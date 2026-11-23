// Concurrency test of the real services against a DISPOSABLE local PostgreSQL. Mercado Pago is simulated; no real payment.
// Usage: LOAD_DATABASE_URL=postgresql://loadtest@127.0.0.1:55432/eventmap_load node scripts/load-test-isolated.cjs 100 500 1000
// It refuses any database other than eventmap_load on 127.0.0.1:55432, and is not part of the offline suite.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const ts = require("typescript");

const target = new URL(process.env.LOAD_DATABASE_URL || "postgresql://invalid");
if (target.hostname !== "127.0.0.1" || target.port !== "55432" || target.pathname !== "/eventmap_load") {
  console.error("Refused: this test only runs against the disposable database eventmap_load on 127.0.0.1:55432.");
  process.exit(2);
}
target.searchParams.set("connection_limit", process.env.LOAD_POOL || "20");
target.searchParams.set("pool_timeout", "120");
process.env.DATABASE_URL = target.toString();
delete process.env.EVENTMAP_PRODUCTION_DATABASE_URL;
delete process.env.VERCEL_ENV;
process.env.NODE_ENV = "test";

const ENV = {
  MP_CLIENT_ID: "load-client", MP_CLIENT_SECRET: "load-secret-value", MP_WEBHOOK_SECRET: "load-webhook-secret",
  TICKETS_ENCRYPTION_KEY: crypto.randomBytes(32).toString("hex"), NEXTAUTH_SECRET: "l".repeat(40), NEXTAUTH_URL: "https://eventmap.test",
};
Object.assign(process.env, ENV);
const warnings = {}; console.warn = (code) => { warnings[code] = (warnings[code] || 0) + 1; }; console.error = () => {}; process.on("exit", () => process.stdout.write(`warnings ${JSON.stringify(warnings)}
`));

const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", source)((name) => {
    if (name.startsWith("@/")) return load(name.slice(2) + ".ts");
    if (name.startsWith(".")) {
      const base = path.resolve(path.dirname(file), name);
      return load(fs.existsSync(base + ".ts") ? base + ".ts" : base + ".tsx");
    }
    return require(name);
  }, mod, mod.exports);
  return mod.exports;
}

function mockMercadoPago() {
  const payments = new Map();
  const byKey = new Map();
  let sequence = Date.now() * 100; // unique across runs: mpPaymentId is unique in the database
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const fetchImpl = async (url, init = {}) => {
    const { pathname } = new URL(url);
    const method = (init.method || "GET").toUpperCase();
    if (pathname === "/v1/payments" && method === "POST") {
      const key = init.headers["X-Idempotency-Key"];
      if (byKey.has(key)) return json(201, byKey.get(key));
      const body = JSON.parse(init.body);
      const id = ++sequence;
      const payment = { id, status: "pending", currency_id: "BRL", external_reference: body.external_reference, transaction_amount: body.transaction_amount, application_fee: body.application_fee, point_of_interaction: { transaction_data: { qr_code: `pix-${id}`, qr_code_base64: `qr${id}` } } };
      payments.set(String(id), payment);
      byKey.set(key, payment);
      return json(201, payment);
    }
    const match = pathname.match(/^\/v1\/payments\/(\d+)$/);
    if (match && method === "GET") return payments.has(match[1]) ? json(200, payments.get(match[1])) : json(404, {});
    return json(404, {});
  };
  return { payments, fetch: fetchImpl };
}

function webhook(id, requestId) {
  const ts = String(Date.now());
  const v1 = crypto.createHmac("sha256", ENV.MP_WEBHOOK_SECRET).update(`id:${id};request-id:${requestId};ts:${ts};`).digest("hex");
  return { xSignature: `ts=${ts},v1=${v1}`, xRequestId: requestId, dataId: String(id), type: "payment" };
}

const pct = (sorted, p) => (sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]) : 0);
function summary(times, extra) {
  const sorted = [...times].sort((a, b) => a - b);
  return { p50ms: pct(sorted, 0.5), p95ms: pct(sorted, 0.95), maxMs: pct(sorted, 1), ...extra };
}
async function timed(items, work) {
  const times = [];
  const started = performance.now();
  const results = await Promise.all(items.map(async (item) => {
    const begin = performance.now();
    try { return await work(item); } catch (error) { return { thrown: error?.code || error?.status || error?.name || "error" }; } finally { times.push(performance.now() - begin); }
  }));
  return { results, times, seconds: Number(((performance.now() - started) / 1000).toFixed(1)) };
}

async function main() {
  const levels = process.argv.slice(2).map(Number).filter((value) => value > 0);
  const prisma = load("lib/prisma.ts").default;
  const security = load("lib/ticketSecurity.ts");
  const tickets = load("lib/services/tickets.ts");
  const attendance = load("lib/services/attendance.ts");
  const output = [];
  for (const users of levels) {
    const run = crypto.randomUUID().slice(0, 8);
    const seller = `seller-${run}`;
    const ids = Array.from({ length: users }, (_, index) => `u-${run}-${index}`);
    await prisma.user.create({ data: { id: seller, name: "Organizador carga", email: `${seller}@load.test`, emailVerified: true, role: "PROMOTER" } });
    await prisma.user.createMany({ data: ids.map((id) => ({ id, name: "Carga", email: `${id}@load.test`, emailVerified: true })) });
    await prisma.mercadoPagoAccount.create({ data: { userId: seller, mpUserId: `mp-${run}`, accessTokenEnc: security.encryptTicketToken("APP_USR-load", ENV), refreshTokenEnc: security.encryptTicketToken("TG-load", ENV), expiresAt: new Date(Date.now() + 100 * 86_400_000) } });
    const base = { banner: "/x.jpg", descricao: "Evento de carga", dataInicio: "2099-06-10", dataFim: "2099-06-10", startTime: "20:00", timezone: "America/Sao_Paulo", linkParaCompra: "", endereco: "Carga", userId: seller, status: "PUBLISHED", validate: true };
    const capacity = Math.floor(users / 2);
    const freeEvent = await prisma.events.create({ data: { ...base, nome: `Gratuito ${run}`, isFree: true, priceCents: 0, capacity } });
    const paidEvent = await prisma.events.create({ data: { ...base, nome: `Pago ${run}`, isFree: false, priceCents: 10000, ticketsEnabled: true, ticketCapacity: capacity } });

    const register = await timed(ids, (id) => attendance.registerForEvent(freeEvent.id, id));
    const confirmed = await prisma.eventRegistration.count({ where: { eventId: freeEvent.id, status: "CONFIRMED" } });
    const waiting = await prisma.eventRegistration.count({ where: { eventId: freeEvent.id, status: "WAITLISTED" } });
    const registerErrors = register.results.filter((item) => item?.thrown).length;

    const mp = mockMercadoPago();
    const deps = { fetch: mp.fetch, now: () => new Date(), env: ENV, statusCheckIntervalMs: 0, reconcileIntervalMs: 3_600_000 };
    const buy = await timed(ids, (id) => tickets.createTicketOrder({ eventId: paidEvent.id }, async () => ({ id, role: "BASIC" }), deps));
    const bought = buy.results.filter((item) => item?.success).length;
    const buyThrown = buy.results.filter((item) => item?.thrown).length;
    const soldOut = buy.results.filter((item) => item && item.success === false && /esgotad/i.test(item.message)).length;
    const otherRefusals = buy.results.filter((item) => item && item.success === false && !/esgotad/i.test(item.message)).length;
    const refusalReasons = {};
    for (const item of buy.results) if (item && item.success === false && !/esgotad/i.test(item.message)) refusalReasons[item.message.slice(0, 48)] = (refusalReasons[item.message.slice(0, 48)] || 0) + 1;
    const orderStates = Object.fromEntries((await prisma.ticketOrder.groupBy({ by: ["status"], where: { eventId: paidEvent.id }, _count: { _all: true } })).map((row) => [row.status, row._count._all]));
    const orders = await prisma.ticketOrder.findMany({ where: { eventId: paidEvent.id, status: "PENDING", mpPaymentId: { not: null } }, select: { id: true, mpPaymentId: true } });
    for (const order of orders) mp.payments.get(order.mpPaymentId).status = "approved";
    // Every webhook delivered twice, at the same time.
    const deliveries = orders.flatMap((order) => [webhook(order.mpPaymentId, `${order.id}-a`), webhook(order.mpPaymentId, `${order.id}-b`)]);
    const hooks = await timed(deliveries, (input) => tickets.handleMercadoPagoWebhook(input, deps));
    const hookFailures = hooks.results.filter((status) => status !== 200).length;
    // Mercado Pago retries non-2xx deliveries; simulate that retry once so the final state reflects it.
    if (hookFailures) await timed(orders, (order) => tickets.handleMercadoPagoWebhook(webhook(order.mpPaymentId, `${order.id}-retry`), deps));
    const paid = await prisma.ticketOrder.count({ where: { eventId: paidEvent.id, status: "PAID" } });
    const paidNotices = await prisma.notification.count({ where: { groupKey: { in: orders.map((order) => `ticket-paid:${order.id}`) } } });

    const result = {
      users, capacity,
      register: summary(register.times, { seconds: register.seconds, errors: registerErrors, confirmed, waiting, oversold: confirmed > capacity }),
      purchase: summary(buy.times, { seconds: buy.seconds, pixCreated: bought, soldOut, otherRefusals, refusalReasons, orderStates, errors: buyThrown, oversold: bought > capacity }),
      webhook: summary(hooks.times, { seconds: hooks.seconds, deliveries: deliveries.length, firstPassFailures: hookFailures, paid, notices: paidNotices, duplicateNotices: paidNotices > paid }),
    };
    output.push(result);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
  await prisma.$disconnect();
  if (process.env.LOAD_OUTPUT) fs.writeFileSync(process.env.LOAD_OUTPUT, JSON.stringify(output, null, 2));
}
main().catch((error) => { process.stderr.write(`load test failed: ${error?.message?.slice(0, 200)}\n`); process.exit(1); });
