// Offline checks for "Diagnóstico do Pix" (lib/services/pixDiagnostics.ts) against an in-memory database and a fake
// Mercado Pago (injected fetch). No database, no network, no real Mercado Pago calls.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const ts = require("typescript");

globalThis.fetch = async () => { throw new Error("real network is forbidden in offline tests"); };

const root = path.resolve(__dirname, "..");
let db;
const cache = new Map();
class PrismaKnownError extends Error { constructor(code) { super("prisma " + code); this.code = code; } }
const prismaStub = { Prisma: { PrismaClientKnownRequestError: PrismaKnownError, TransactionIsolationLevel: { Serializable: "Serializable" } } };
function load(file) {
  file = path.resolve(root, file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const resolve = (name) => {
    if (name === "@/lib/prisma") return { __esModule: true, get default() { return db; } };
    if (name === "@prisma/client") return prismaStub;
    if (name.startsWith("@/")) { const base = path.join(root, name.slice(2)); return load(fs.existsSync(base + ".ts") ? base + ".ts" : base + ".tsx"); }
    if (name.startsWith(".")) { const base = path.resolve(path.dirname(file), name); return load(fs.existsSync(base + ".ts") ? base + ".ts" : base + ".tsx"); }
    return require(name);
  };
  new Function("require", "module", "exports", source)(resolve, mod, mod.exports);
  return mod.exports;
}

const MIN = 60 * 1000;
const NOW = new Date("2099-03-10T15:00:00.000Z");
let current = NOW;
const ENV = {
  MP_CLIENT_ID: "test-client-id", MP_CLIENT_SECRET: "test-client-secret-value", MP_WEBHOOK_SECRET: "test-webhook-secret",
  TICKETS_ENCRYPTION_KEY: crypto.randomBytes(32).toString("hex"), NEXTAUTH_SECRET: "n".repeat(40), NEXTAUTH_URL: "https://eventmap.test",
};
const PLATFORM_ID = 111000;
const SELLER_ID = 222000;

// ---------- in-memory persistence ----------
function cmp(actual, condition) {
  if (condition && typeof condition === "object" && !(condition instanceof Date)) {
    if ("startsWith" in condition) return typeof actual === "string" && actual.startsWith(condition.startsWith);
    if ("in" in condition) return condition.in.includes(actual);
    const v = (x) => (x instanceof Date ? x.getTime() : x);
    if ("lt" in condition) return actual != null && v(actual) < v(condition.lt);
    if ("gt" in condition) return actual != null && v(actual) > v(condition.gt);
    if ("lte" in condition) return actual != null && v(actual) <= v(condition.lte);
    if ("gte" in condition) return actual != null && v(actual) >= v(condition.gte);
    return true;
  }
  if (actual instanceof Date && condition instanceof Date) return actual.getTime() === condition.getTime();
  return actual === condition;
}
const matches = (row, where) => !where || Object.entries(where).every(([key, value]) => cmp(row[key], value));
function table(name, rows = []) {
  let sequence = 0;
  return {
    rows,
    findFirst: async (q = {}) => rows.find((row) => matches(row, q.where)) ?? null,
    findUnique: async (q) => rows.find((row) => matches(row, q.where)) ?? null,
    findMany: async (q = {}) => rows.filter((row) => matches(row, q.where)),
    count: async (q = {}) => rows.filter((row) => matches(row, q.where)).length,
    create: async (q) => { const row = { id: `${name}-${++sequence}`, ...q.data }; rows.push(row); return row; },
    updateMany: async (q) => { const hit = rows.filter((row) => matches(row, q.where)); for (const row of hit) Object.assign(row, q.data); return { count: hit.length }; },
    deleteMany: async (q = {}) => { const before = rows.length; for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], q.where)) rows.splice(i, 1); return { count: before - rows.length }; },
  };
}
function freshDb() {
  const store = {
    user: table("user", [
      { id: "seller", email: "organizadora@eventmap.test", role: "PROMOTER" },
      { id: "seller2", email: "outra@eventmap.test", role: "PROMOTER" },
      { id: "buyer", email: "buyer@eventmap.test", role: "BASIC" },
    ]),
    mercadoPagoAccount: table("mpaccount"), notification: table("notification"), ticketOrder: table("order"), verificationToken: table("vt"),
    ticketPass: table("pass"), eventRegistration: table("registration"), events: table("event"),
  };
  let queue = Promise.resolve();
  store.$executeRaw = async () => 0;
  store.$queryRaw = async () => [];
  store.$transaction = (fn) => { const run = queue.then(() => fn(store)); queue = run.catch(() => undefined); return run; };
  return store;
}

// ---------- fake Mercado Pago ----------
function fakeMercadoPago() {
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const mp = {
    calls: [], payments: new Map(), idempotency: new Map(), sequence: 5000,
    sellerUserId: SELLER_ID, sellerEmail: "loja@vendedor.test", methods: ["pix", "bolbradesco", "visa"],
    clientCredentials: 200, refreshStatus: 200, usersMeStatus: 200, paymentError: null, cancelStatus: 200,
  };
  mp.fetch = async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const body = init.body ? JSON.parse(init.body) : null;
    mp.calls.push({ url, method, headers, body });
    assert.ok(init.signal, "every Mercado Pago call has a timeout");
    const { pathname } = new URL(url);
    const auth = headers.authorization || "";
    if (pathname === "/oauth/token" && method === "POST") {
      if (body.grant_type === "client_credentials") {
        if (mp.clientCredentials !== 200) return json(mp.clientCredentials, { error: "invalid_client" });
        return json(200, { access_token: "APP_USR-platform-token", token_type: "bearer", expires_in: 21600, user_id: PLATFORM_ID });
      }
      if (body.grant_type === "refresh_token") {
        if (mp.refreshStatus !== 200) return json(mp.refreshStatus, { error: "invalid_grant" });
        return json(200, { access_token: "APP_USR-seller-refreshed", refresh_token: "TG-seller-refreshed", expires_in: 15552000, user_id: mp.sellerUserId });
      }
      return json(400, { error: "unsupported" });
    }
    if (pathname === "/users/me" && method === "GET") {
      if (mp.usersMeStatus !== 200) return json(mp.usersMeStatus, { message: "unauthorized" });
      if (auth === "Bearer APP_USR-platform-token") return json(200, { id: PLATFORM_ID, nickname: "EVENTMAP", email: "dono@eventmap.test" });
      return json(200, { id: mp.sellerUserId, nickname: "LOJA_TESTE", email: mp.sellerEmail });
    }
    if (pathname === "/v1/payment_methods" && method === "GET") return json(200, mp.methods.map((id) => ({ id, name: id, payment_type_id: id === "pix" ? "bank_transfer" : "ticket", status: "active" })));
    if (pathname === "/v1/payments" && method === "POST") {
      if (mp.paymentError) return json(400, { message: "refused", error: "bad_request", status: 400, cause: [{ code: mp.paymentError, description: "refused" }] });
      const key = headers["x-idempotency-key"];
      if (mp.idempotency.has(key)) return json(201, mp.idempotency.get(key));
      const id = ++mp.sequence;
      const payment = { id, status: "pending", currency_id: "BRL", external_reference: body.external_reference, transaction_amount: body.transaction_amount, application_fee: body.application_fee, point_of_interaction: { transaction_data: { qr_code: `00020126pix-${id}`, qr_code_base64: `iVBORw0KGgo${id}` } } };
      mp.payments.set(String(id), payment);
      mp.idempotency.set(key, payment);
      return json(201, payment);
    }
    const match = pathname.match(/^\/v1\/payments\/(\d+)$/);
    if (match && method === "PUT") {
      if (mp.cancelStatus !== 200) return json(mp.cancelStatus, { message: "cannot" });
      const payment = mp.payments.get(match[1]);
      if (!payment) return json(404, { message: "not found" });
      payment.status = body.status;
      return json(200, payment);
    }
    if (match && method === "GET") { const payment = mp.payments.get(match[1]); return payment ? json(200, payment) : json(404, {}); }
    return json(404, { message: "unknown route" });
  };
  mp.created = () => mp.calls.filter((call) => call.method === "POST" && new URL(call.url).pathname === "/v1/payments");
  mp.cancelled = () => mp.calls.filter((call) => call.method === "PUT");
  return mp;
}

(async () => {
  const sec = load("lib/ticketSecurity.ts");
  const diag = load("lib/services/pixDiagnostics.ts");
  const tickets = load("lib/services/tickets.ts");
  const as = (id, role = "PROMOTER") => async () => ({ id, role });
  const uuid = () => crypto.randomUUID();
  let mp;
  let deps;
  const connect = (userId = "seller", patch = {}) => db.mercadoPagoAccount.rows.push({
    userId, mpUserId: String(SELLER_ID), connectedAt: new Date(NOW.getTime() - 60 * MIN),
    accessTokenEnc: sec.encryptTicketToken("APP_USR-seller-access", ENV), refreshTokenEnc: sec.encryptTicketToken("TG-seller-refresh", ENV),
    expiresAt: new Date(NOW.getTime() + 90 * 24 * 60 * MIN), ...patch,
  });
  const reset = (env = ENV) => { db = freshDb(); mp = fakeMercadoPago(); deps = { fetch: mp.fetch, now: () => current, env }; current = NOW; diag.clearPlatformUserIdCache(); };
  const byId = (result, id) => result.checks.find((item) => item.id === id);
  const warned = [];
  const realWarn = console.warn;
  console.warn = (...args) => warned.push(args.map(String).join(" "));

  try {
    // Not configured.
    reset({ NEXTAUTH_SECRET: ENV.NEXTAUTH_SECRET });
    const bare = await diag.diagnosePayments("seller", deps);
    assert.equal(bare.configured, false);
    assert.equal(bare.overall, "fail");
    assert.equal(mp.calls.length, 0, "no provider call when payments are not configured");

    // No account connected.
    reset();
    const none = await diag.diagnosePayments("seller", deps);
    assert.deepEqual([byId(none, "connection").status, byId(none, "connection").action], ["fail", "connect"]);

    // Healthy seller: every check ok, platform owner detected through client_credentials.
    reset();
    connect();
    const healthy = await diag.diagnosePayments("seller", deps);
    assert.deepEqual(healthy.checks.map((item) => `${item.id}:${item.status}`), ["connection:ok", "platform_owner:ok", "pix_method:ok", "fee_refused:ok"]);
    assert.equal(healthy.overall, "ok");
    assert.equal(healthy.verified, false, "read-only checks never claim the Pix is proven");
    assert.match(healthy.headline, /teste de recebimento/);
    assert.equal(healthy.accountLabel, "loja@vendedor.test");
    assert.equal(mp.created().length, 0, "'Verificar agora' never creates a payment");
    const credentialsCall = mp.calls.find((call) => call.body?.grant_type === "client_credentials");
    assert.ok(credentialsCall, "platform account comes from the client_credentials token");
    assert.equal(/APP_USR|TG-|client-secret/.test(JSON.stringify(healthy)), false, "no tokens or secrets in the diagnosis");
    assert.equal(JSON.stringify(healthy).includes("dono@eventmap.test"), false, "the platform account is never exposed");
    await diag.diagnosePayments("seller", deps);
    assert.equal(mp.calls.filter((call) => call.body?.grant_type === "client_credentials").length, 1, "platform id is cached");

    // Live test: R$ 1,00 Pix with the ticket fee rule, clearly marked, cancelled at once, no orders.
    const tested = await diag.testPixReceipt("seller", "11111111-1111-4111-8111-111111111111", deps);
    assert.equal(byId(tested, "live_test").status, "ok");
    assert.equal(tested.verified, true);
    assert.equal(tested.headline, "Pix pronto para vender");
    const [created] = mp.created();
    assert.equal(created.body.transaction_amount, 1);
    assert.equal(created.body.application_fee, 0.1, "same 10% fee as tickets");
    assert.equal(created.body.payment_method_id, "pix");
    assert.equal(created.body.description, "Teste EventMap — não pague");
    assert.equal(created.body.external_reference, "diagnostic:11111111-1111-4111-8111-111111111111");
    assert.deepEqual(created.body.metadata, { diagnostic: true });
    assert.equal(created.body.notification_url, undefined, "no webhook requested for the test");
    assert.equal(created.body.payer.email, "organizadora@eventmap.test", "payer: the organizer's own EventMap e-mail");
    assert.equal(created.headers.authorization, "Bearer APP_USR-seller-access", "created with the seller token");
    assert.ok(created.headers["x-idempotency-key"].startsWith("diagnostic-"));
    const expires = new Date(created.body.date_of_expiration.replace("-03:00", "Z")).getTime() + 3 * 60 * MIN;
    assert.equal(expires - NOW.getTime(), 30 * MIN, "expires in 30 minutes");
    assert.equal(mp.cancelled().length, 1);
    assert.equal(mp.payments.get(String(mp.sequence)).status, "cancelled", "test Pix cancelled right away");
    assert.equal(db.ticketOrder.rows.length, 0, "diagnostics never create orders");
    assert.equal(db.notification.rows.length, 0, "nor notifications");

    // Webhook for the diagnostic payment: ignored safely, no order adopted.
    const ts0 = String(current.getTime());
    const dataId = String(mp.sequence);
    const v1 = crypto.createHmac("sha256", ENV.MP_WEBHOOK_SECRET).update(`id:${dataId};request-id:req-d;ts:${ts0};`).digest("hex");
    const status = await tickets.handleMercadoPagoWebhook({ xSignature: `ts=${ts0},v1=${v1}`, xRequestId: "req-d", dataId, type: "payment", mpUserId: String(SELLER_ID) }, deps);
    assert.equal(status, 200);
    assert.ok(warned.some((line) => line.includes("ticket-webhook-diagnostic-ignored")));
    assert.equal(db.ticketOrder.rows.length, 0);

    // Cancel not confirmed: honest warning, never "ok".
    mp.cancelStatus = 500;
    const uncancelled = await diag.testPixReceipt("seller", uuid(), deps);
    assert.equal(byId(uncancelled, "live_test").status, "warn");
    assert.match(byId(uncancelled, "live_test").message, /não pague/);
    mp.cancelStatus = 200;

    // Seller connected the platform's own account.
    reset();
    connect();
    mp.sellerUserId = PLATFORM_ID;
    const owner = await diag.diagnosePayments("seller", deps);
    assert.deepEqual([byId(owner, "platform_owner").status, byId(owner, "platform_owner").action], ["fail", "switch_account"]);
    assert.match(owner.headline, /problema/);
    // MP_PLATFORM_USER_ID wins over the API lookup.
    reset({ ...ENV, MP_PLATFORM_USER_ID: String(SELLER_ID) });
    connect();
    assert.equal(byId(await diag.diagnosePayments("seller", deps), "platform_owner").status, "fail");
    assert.equal(mp.calls.some((call) => call.body?.grant_type === "client_credentials"), false);
    // Platform id unknown: a warning that points to the live test.
    reset();
    connect();
    mp.clientCredentials = 401;
    const unknown = byId(await diag.diagnosePayments("seller", deps), "platform_owner");
    assert.deepEqual([unknown.status, unknown.action], ["warn", "run_test"]);

    // 2059: fee refused.
    reset();
    connect();
    mp.paymentError = 2059;
    const refused = byId(await diag.testPixReceipt("seller", uuid(), deps), "live_test");
    assert.deepEqual([refused.status, refused.action], ["fail", "switch_account"]);
    assert.match(refused.message, /2059/);
    assert.equal(db.ticketOrder.rows.length + db.notification.rows.length, 0);
    // 13253: no Pix key.
    mp.paymentError = 13253;
    assert.equal(byId(await diag.testPixReceipt("seller", uuid(), deps), "live_test").action, "pix_key_help");
    // 2034: users involved (payer vs collector) is its own diagnosis.
    mp.paymentError = 2034;
    const users = byId(await diag.testPixReceipt("seller", uuid(), deps), "live_test");
    assert.equal(users.status, "warn");
    assert.match(users.message, /2034/);
    mp.paymentError = null;

    // Payer e-mail equals the collector's: the test is not sent.
    reset();
    connect();
    mp.sellerEmail = "organizadora@eventmap.test";
    const same = byId(await diag.testPixReceipt("seller", uuid(), deps), "live_test");
    assert.equal(same.status, "warn");
    assert.match(same.message, /pagador e recebedor/);
    assert.equal(mp.created().length, 0);

    // Token close to expiry is refreshed; a rejected refresh asks to reconnect and skips the live test.
    reset();
    connect("seller", { expiresAt: new Date(NOW.getTime() - MIN) });
    const refreshed = await diag.diagnosePayments("seller", deps);
    assert.equal(byId(refreshed, "connection").status, "ok");
    assert.ok(mp.calls.some((call) => call.body?.grant_type === "refresh_token"));
    assert.equal(sec.decryptTicketToken(db.mercadoPagoAccount.rows[0].accessTokenEnc, ENV), "APP_USR-seller-refreshed");
    reset();
    connect("seller", { expiresAt: new Date(NOW.getTime() - MIN) });
    mp.refreshStatus = 400;
    const expired = await diag.testPixReceipt("seller", uuid(), deps);
    assert.deepEqual([byId(expired, "connection").status, byId(expired, "connection").action], ["fail", "reconnect"]);
    assert.equal(byId(expired, "live_test").status, "warn");
    assert.equal(mp.created().length, 0);
    // Revoked token answering 401 on /users/me.
    reset();
    connect();
    mp.usersMeStatus = 401;
    assert.equal(byId(await diag.diagnosePayments("seller", deps), "connection").action, "reconnect");

    // Pix not listed for the account.
    reset();
    connect();
    mp.methods = ["visa", "bolbradesco"];
    const noPix = byId(await diag.diagnosePayments("seller", deps), "pix_method");
    assert.deepEqual([noPix.status, noPix.action], ["fail", "pix_key_help"]);

    // Recorded fee refusal (existing notification for this connection).
    reset();
    connect();
    db.notification.rows.push({ id: "n1", userId: "seller", groupKey: tickets.feeRefusedKey("seller", db.mercadoPagoAccount.rows[0].connectedAt) });
    assert.equal(byId(await diag.diagnosePayments("seller", deps), "fee_refused").status, "fail");

    // Session wrapper: auth, ownership, validation, per-click idempotency and rate limit.
    reset();
    connect();
    assert.equal((await diag.runPixDiagnostics({ action: "check", clientId: uuid() }, async () => null, deps)).status, 401);
    assert.equal((await diag.runPixDiagnostics({ action: "check", clientId: uuid() }, as("buyer", "BASIC"), deps)).status, 403);
    assert.equal((await diag.runPixDiagnostics({ action: "check", clientId: uuid(), organizerId: "seller" }, as("seller2"), deps)).status, 400, "no account id is accepted");
    assert.equal((await diag.runPixDiagnostics({ action: "test", clientId: "not-a-uuid" }, as("seller"), deps)).status, 400);
    const other = await diag.runPixDiagnostics({ action: "check", clientId: uuid() }, as("seller2"), deps);
    assert.equal(other.status, 200);
    assert.equal(byId(other.data, "connection").action, "connect", "another organizer only sees their own (absent) account");
    assert.equal(/loja@vendedor|organizadora@|APP_USR|TG-/.test(JSON.stringify(other)), false, "nothing of another organizer leaks");
    const click = uuid();
    assert.equal((await diag.runPixDiagnostics({ action: "test", clientId: click }, as("seller"), deps)).status, 200);
    const repeat = await diag.runPixDiagnostics({ action: "test", clientId: click }, as("seller"), deps);
    assert.equal(repeat.status, 200);
    assert.equal(mp.created().length, 1, "the same click never creates a second test payment");
    for (let index = 0; index < 4; index++) assert.equal((await diag.runPixDiagnostics({ action: "test", clientId: uuid() }, as("seller"), deps)).status, 200);
    const limited = await diag.runPixDiagnostics({ action: "test", clientId: uuid() }, as("seller"), deps);
    assert.equal(limited.status, 429);
    assert.match(limited.message, /5 testes/);
    assert.equal(mp.created().length, 5, "at most 5 test payments per hour");
    assert.equal((await diag.runPixDiagnostics({ action: "check", clientId: uuid() }, as("seller"), deps)).status, 200, "checks have their own budget");
    current = new Date(NOW.getTime() + 61 * MIN);
    assert.equal((await diag.runPixDiagnostics({ action: "test", clientId: uuid() }, as("seller"), deps)).status, 200, "a new hour opens a new window");
    for (let index = 0; index < 25; index++) await diag.runPixDiagnostics({ action: "check", clientId: uuid() }, as("seller"), deps);
    assert.equal((await diag.runPixDiagnostics({ action: "check", clientId: uuid() }, as("seller"), deps)).status, 429);
  } finally {
    console.warn = realWarn;
  }

  // Logs: stage/status/cause codes only.
  const logs = warned.join("\n");
  assert.ok(/pix-diagnostic-test-refused stage=payment_create status=400 causes=2059/.test(logs), "refusal logged with its cause code");
  assert.equal(/@|APP_USR|TG-|client-secret/.test(logs), false, "no e-mails, tokens or secrets in logs");

  // Wiring: route is same-origin, session-bound, no impersonation; panel shows the card.
  const route = fs.readFileSync(path.join(root, "app/api/tickets/pix-diagnostics/route.ts"), "utf8");
  assert.match(route, /isAllowedRequestOrigin\(request, true\)/);
  assert.match(route, /allowImpersonation: false/);
  assert.match(route, /no-store/);
  const panel = fs.readFileSync(path.join(root, "components/MyComponents/tickets/PaymentsPanel.tsx"), "utf8");
  assert.match(panel, /<PixDiagnosticsCard /);
  const card = fs.readFileSync(path.join(root, "components/MyComponents/tickets/PixDiagnosticsCard.tsx"), "utf8");
  for (const text of ["Diagnóstico do Pix", "Verificar agora", "Testar recebimento (R$ 1,00, cancelado na hora)", "nenhum valor é cobrado", "Desconectar e trocar de conta", "Reconectar", 'aria-live="polite"']) assert.ok(card.includes(text), text);
  console.log("PASS pix diagnostics: checks, platform-owner detection, live test created+cancelled, 2059/13253/2034, payer==collector, refresh/reconnect, Pix missing, rate limit, ownership, webhook ignores diagnostics, safe logs.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
