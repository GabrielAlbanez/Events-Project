// Offline checks for Pix ticket sales with Mercado Pago marketplace split.
// Pure helpers, crypto, the Mercado Pago client (injected fetch) and the real service against in-memory persistence.
// No database, no network, no real Mercado Pago calls.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const ts = require("typescript");

// Any accidental real network call fails the suite.
globalThis.fetch = async () => { throw new Error("real network is forbidden in offline tests"); };

let db;
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const resolve = (name) => {
    if (name === "@/lib/prisma") return { __esModule: true, get default() { return db; } };
    if (name === "@prisma/client") return { Prisma: { PrismaClientKnownRequestError: class extends Error {}, TransactionIsolationLevel: { Serializable: "Serializable" } } };
    if (name.startsWith("@/")) return load(name.slice(2) + ".ts");
    if (name.startsWith(".")) {
      const base = path.resolve(path.dirname(file), name.replace(/\.js$/, ""));
      return load(fs.existsSync(base + ".ts") ? base + ".ts" : base + ".tsx");
    }
    return require(name);
  };
  new Function("require", "module", "exports", source)(resolve, mod, mod.exports);
  return mod.exports;
}

const MIN = 60 * 1000;
const NOW = new Date("2099-03-10T15:00:00.000Z");
let current = NOW;
const clock = () => current;
const KEY_HEX = crypto.randomBytes(32).toString("hex");
const ENV = {
  MP_CLIENT_ID: "test-client-id", MP_CLIENT_SECRET: "test-client-secret-value", MP_WEBHOOK_SECRET: "test-webhook-secret",
  TICKETS_ENCRYPTION_KEY: KEY_HEX, NEXTAUTH_SECRET: "n".repeat(40), NEXTAUTH_URL: "https://eventmap.test",
};

function checkPure(lib) {
  assert.equal(lib.TICKET_FEE_PERCENT, 20);
  assert.equal(lib.ticketFeeCents(5000), 1000);
  assert.equal(lib.ticketFeeCents(1234), 247, "246.8 rounds to 247");
  assert.equal(lib.ticketFeeCents(1232), 246, "246.4 rounds to 246");
  assert.equal(lib.ticketFeeCents(502), 100, "100.4 rounds to 100");
  assert.equal(lib.ticketFeeCents(503), 101, "100.6 rounds to 101");
  assert.equal(lib.ticketNetCents(1234), 987);
  assert.ok(Number.isInteger(lib.ticketFeeCents(999)), "integer cents");
  assert.equal(lib.isValidTicketPrice(500), true, "R$ 5,00 is the minimum");
  assert.equal(lib.isValidTicketPrice(499), false);
  assert.equal(lib.isValidTicketPrice(500000), true, "R$ 5.000,00 is the maximum");
  assert.equal(lib.isValidTicketPrice(500001), false);
  assert.equal(lib.isValidTicketPrice(1000.5), false, "integer cents only");
  assert.equal(lib.isValidTicketPrice("1000"), false);
  assert.equal(lib.TICKET_ORDER_TTL_MS, 30 * MIN);
  assert.equal(lib.formatTicketAmount(2500).replace(/\s/g, " "), "R$ 25,00");

  const orders = [
    { status: "PAID", expiresAt: new Date(NOW.getTime() - 60 * MIN) },
    { status: "PENDING", expiresAt: new Date(NOW.getTime() + MIN) },
    { status: "PENDING", expiresAt: new Date(NOW.getTime() - 1) },
    { status: "PENDING", expiresAt: NOW },
    { status: "CANCELLED", expiresAt: new Date(NOW.getTime() + MIN) },
    { status: "REFUNDED", expiresAt: new Date(NOW.getTime() + MIN) },
    { status: "EXPIRED", expiresAt: new Date(NOW.getTime() + MIN) },
  ];
  assert.equal(lib.ticketSeatsTaken(orders, NOW), 2, "paid + pending not expired");
  assert.equal(lib.ticketSeatsLeft(null, 99), null, "no capacity: unlimited");
  assert.equal(lib.ticketSeatsLeft(3, 2), 1);
  assert.equal(lib.ticketSeatsLeft(3, 5), 0, "never negative");

  const event = { status: "PUBLISHED", dataInicio: "2099-03-20", startTime: "20:00", timezone: "America/Sao_Paulo", ticketsEnabled: true, isFree: false, priceCents: 2500, userId: "seller" };
  const base = { event, buyerId: "buyer", sellerConnected: true, buyerEmailVerified: true, now: NOW };
  assert.equal(lib.ticketEligibility(base), null);
  const code = (patch) => lib.ticketEligibility({ ...base, ...patch })?.code;
  assert.equal(code({ event: null }), "not_found");
  assert.equal(code({ event: { ...event, status: "PENDING" } }), "not_published");
  assert.equal(code({ event: { ...event, dataInicio: "2099-03-10", startTime: "11:00" } }), "ended", "already started");
  assert.equal(code({ event: { ...event, ticketsEnabled: false } }), "not_enabled");
  assert.equal(code({ event: { ...event, isFree: true } }), "invalid_price");
  assert.equal(code({ event: { ...event, priceCents: 100 } }), "invalid_price");
  assert.equal(code({ sellerConnected: false }), "seller_not_connected");
  assert.equal(code({ buyerId: "seller" }), "own_event");
  assert.equal(code({ buyerEmailVerified: false }), "email_unverified");
  for (const patch of [{ event: null }, { buyerId: "seller" }, { buyerEmailVerified: false }]) assert.equal(typeof lib.ticketEligibility({ ...base, ...patch }).message, "string");

  const settings = { ticketsEnabled: true, isFree: false, priceCents: 2500, configured: true, sellerConnected: true };
  assert.equal(lib.ticketSettingsError(settings), null);
  assert.equal(lib.ticketSettingsError({ ...settings, ticketsEnabled: false, sellerConnected: false, configured: false }), null, "disabled: nothing to check");
  assert.match(lib.ticketSettingsError({ ...settings, configured: false }), /configurad/i);
  assert.match(lib.ticketSettingsError({ ...settings, isFree: true }), /pagos/i);
  assert.match(lib.ticketSettingsError({ ...settings, priceCents: 499 }), /5,00/);
  assert.match(lib.ticketSettingsError({ ...settings, sellerConnected: false }), /Mercado Pago/);
}

function checkSecurity(sec) {
  // Encryption round trip and tamper detection.
  const env = { ...ENV };
  const sealed = sec.encryptTicketToken("APP_USR-secret-token", env);
  assert.notEqual(sealed, "APP_USR-secret-token");
  assert.equal(sealed.includes("APP_USR"), false, "ciphertext does not reveal the token");
  assert.notEqual(sec.encryptTicketToken("APP_USR-secret-token", env), sealed, "random IV");
  assert.equal(sec.decryptTicketToken(sealed, env), "APP_USR-secret-token");
  const parts = sealed.split(":");
  const raw = Buffer.from(parts[1], "base64url");
  raw[raw.length - 1] ^= 1;
  assert.throws(() => sec.decryptTicketToken(parts[0] + ":" + raw.toString("base64url"), env), "tampered ciphertext is rejected");
  assert.throws(() => sec.decryptTicketToken(sealed, { ...env, TICKETS_ENCRYPTION_KEY: crypto.randomBytes(32).toString("hex") }), "wrong key is rejected");
  const base64Env = { ...env, TICKETS_ENCRYPTION_KEY: Buffer.from(KEY_HEX, "hex").toString("base64") };
  assert.equal(sec.decryptTicketToken(sealed, base64Env), "APP_USR-secret-token", "base64 and hex keys are equivalent");
  let configError;
  try { sec.encryptTicketToken("x", { ...env, TICKETS_ENCRYPTION_KEY: "" }); } catch (error) { configError = error; }
  assert.ok(configError instanceof sec.TicketConfigError, "missing key: clear config error");
  assert.equal(String(configError.message).includes(KEY_HEX), false);
  assert.throws(() => sec.encryptTicketToken("x", { ...env, TICKETS_ENCRYPTION_KEY: "short" }), sec.TicketConfigError);
  try { sec.encryptTicketToken("x", { ...env, TICKETS_ENCRYPTION_KEY: "z".repeat(40) }); } catch (error) { assert.equal(error.message.includes("zzzz"), false, "invalid key value is never echoed"); }

  assert.equal(sec.ticketPaymentsConfigured(env), true);
  for (const name of ["MP_CLIENT_ID", "MP_CLIENT_SECRET", "MP_WEBHOOK_SECRET", "TICKETS_ENCRYPTION_KEY"]) assert.equal(sec.ticketPaymentsConfigured({ ...env, [name]: "" }), false, name + " is required");
  assert.equal(sec.ticketPaymentsConfigured({ ...env, TICKETS_ENCRYPTION_KEY: "abc" }), false, "invalid key means not configured");

  // Webhook signature (x-signature: ts=...,v1=...; manifest id:<data.id>;request-id:<x-request-id>;ts:<ts>;).
  const secret = env.MP_WEBHOOK_SECRET;
  const ts = "1742505638683";
  const v1 = crypto.createHmac("sha256", secret).update(`id:123456;request-id:req-1;ts:${ts};`).digest("hex");
  const good = { xSignature: `ts=${ts},v1=${v1}`, xRequestId: "req-1", dataId: "123456", secret };
  assert.equal(sec.verifyMercadoPagoSignature(good), true);
  assert.equal(sec.verifyMercadoPagoSignature({ ...good, xSignature: ` v1=${v1} , ts=${ts} ` }), true, "order and spaces do not matter");
  assert.equal(sec.verifyMercadoPagoSignature({ ...good, dataId: "123457" }), false, "other payment id");
  assert.equal(sec.verifyMercadoPagoSignature({ ...good, xRequestId: "req-2" }), false, "other request id");
  assert.equal(sec.verifyMercadoPagoSignature({ ...good, secret: "other" }), false, "other secret");
  assert.equal(sec.verifyMercadoPagoSignature({ ...good, xSignature: `ts=${ts},v1=${v1.slice(0, -2)}` }), false, "truncated signature");
  assert.equal(sec.verifyMercadoPagoSignature({ ...good, xSignature: null }), false, "missing header");
  assert.equal(sec.verifyMercadoPagoSignature({ ...good, xSignature: "garbage" }), false);
  assert.equal(sec.verifyMercadoPagoSignature({ ...good, secret: "" }), false, "no secret: never valid");
  const upper = crypto.createHmac("sha256", secret).update(`id:abc123;request-id:req-1;ts:${ts};`).digest("hex");
  assert.equal(sec.verifyMercadoPagoSignature({ ...good, dataId: "ABC123", xSignature: `ts=${ts},v1=${upper}` }), true, "alphanumeric ids are lowercased per MP docs");

  // OAuth state: signed, bound to the user, expiring.
  const state = sec.signOAuthState("user-1", env, NOW);
  assert.equal(sec.verifyOAuthState(state, "user-1", env, NOW), true);
  assert.equal(sec.verifyOAuthState(state, "user-2", env, NOW), false, "other user");
  assert.equal(sec.verifyOAuthState(state, "user-1", env, new Date(NOW.getTime() + 11 * MIN)), false, "expired");
  assert.equal(sec.verifyOAuthState(state, "user-1", { ...env, NEXTAUTH_SECRET: "x".repeat(40) }, NOW), false, "other secret");
  const [payload, signature] = state.split(".");
  const forged = Buffer.from(Buffer.from(payload, "base64url").toString("utf8").replace("user-1", "user-2")).toString("base64url");
  assert.equal(sec.verifyOAuthState(`${forged}.${signature}`, "user-2", env, NOW), false, "tampered payload");
  assert.equal(sec.verifyOAuthState(`${payload}.${signature}x`, "user-1", env, NOW), false, "tampered signature");
  assert.equal(sec.verifyOAuthState("", "user-1", env, NOW), false);
  assert.equal(sec.verifyOAuthState(null, "user-1", env, NOW), false);
  assert.notEqual(sec.signOAuthState("user-1", env, NOW), state, "random nonce");
}

// Mock Mercado Pago API. Records every call; supports idempotency and failure injection.
function mockMercadoPago() {
  const calls = [];
  const payments = new Map();
  const idempotency = new Map();
  let sequence = 9000;
  const mp = { calls, payments, fail: null, tokenCount: 0 };
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  mp.fetch = async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, method, headers, body });
    assert.ok(init.signal, "every Mercado Pago call has a timeout signal");
    const { pathname } = new URL(url);
    if (mp.fail && mp.fail(pathname, method)) return json(500, { message: "internal error" });
    if (pathname === "/oauth/token" && method === "POST") {
      mp.tokenCount++;
      if (body.code === "bad-code") return json(400, { message: "invalid_grant" });
      return json(200, { access_token: `APP_USR-access-${mp.tokenCount}`, refresh_token: `TG-refresh-${mp.tokenCount}`, expires_in: 15552000, user_id: 777000 + mp.tokenCount, token_type: "bearer" });
    }
    if (pathname === "/v1/payments" && method === "POST") {
      const key = headers["x-idempotency-key"];
      if (idempotency.has(key)) return json(201, idempotency.get(key));
      const id = ++sequence;
      const payment = { id, status: "pending", external_reference: body.external_reference, transaction_amount: body.transaction_amount, application_fee: body.application_fee, point_of_interaction: { transaction_data: { qr_code: `00020126pix-${id}`, qr_code_base64: `iVBORw0KGgo${id}` } } };
      payments.set(String(id), payment);
      idempotency.set(key, payment);
      return json(201, payment);
    }
    const paymentMatch = pathname.match(/^\/v1\/payments\/(\d+)$/);
    if (paymentMatch && method === "GET") {
      const payment = payments.get(paymentMatch[1]);
      return payment ? json(200, payment) : json(404, { message: "not found" });
    }
    const refundMatch = pathname.match(/^\/v1\/payments\/(\d+)\/refunds$/);
    if (refundMatch && method === "POST") {
      const payment = payments.get(refundMatch[1]);
      if (!payment) return json(404, { message: "not found" });
      payment.status = "refunded";
      return json(201, { id: 1, payment_id: payment.id, amount: payment.transaction_amount });
    }
    return json(404, { message: "unknown route" });
  };
  return mp;
}

function checkClient(mpLib) {
  const config = mpLib.mercadoPagoConfig(ENV);
  assert.equal(config.redirectUri, "https://eventmap.test/api/mercadopago/callback", "default redirect uri");
  assert.equal(mpLib.mercadoPagoConfig({ ...ENV, MP_REDIRECT_URI: "https://other.test/cb" }).redirectUri, "https://other.test/cb");
  assert.equal(mpLib.mercadoPagoConfig({ ...ENV, MP_CLIENT_ID: "" }), null);
  const url = new URL(mpLib.mercadoPagoAuthorizeUrl(config, "state-123"));
  assert.equal(url.origin + url.pathname, "https://auth.mercadopago.com/authorization");
  assert.deepEqual(Object.fromEntries(url.searchParams), { client_id: "test-client-id", response_type: "code", platform_id: "mp", state: "state-123", redirect_uri: "https://eventmap.test/api/mercadopago/callback" });
  assert.equal(url.href.includes("test-client-secret-value"), false, "secret never goes to the browser");
}

async function checkClientCalls(mpLib) {
  const mp = mockMercadoPago();
  const config = mpLib.mercadoPagoConfig(ENV);
  const tokens = await mpLib.exchangeMercadoPagoCode(config, "good-code", mp.fetch);
  assert.deepEqual([tokens.accessToken, tokens.refreshToken, tokens.expiresInSeconds, tokens.mpUserId], ["APP_USR-access-1", "TG-refresh-1", 15552000, "777001"]);
  const tokenCall = mp.calls[0];
  assert.equal(tokenCall.url, "https://api.mercadopago.com/oauth/token");
  assert.deepEqual(tokenCall.body, { client_id: "test-client-id", client_secret: "test-client-secret-value", grant_type: "authorization_code", code: "good-code", redirect_uri: config.redirectUri });
  await assert.rejects(mpLib.exchangeMercadoPagoCode(config, "bad-code", mp.fetch), (error) => error instanceof mpLib.MercadoPagoError && !error.message.includes("test-client-secret-value"));
  await mpLib.refreshMercadoPagoToken(config, "TG-old", mp.fetch);
  assert.deepEqual(mp.calls.at(-1).body, { client_id: "test-client-id", client_secret: "test-client-secret-value", grant_type: "refresh_token", refresh_token: "TG-old" });

  const expiresAt = new Date("2099-03-10T15:30:00.000Z");
  const pix = await mpLib.createMercadoPagoPixPayment(config.apiBase, "APP_USR-seller", { orderId: "order-1", amountCents: 2500, feeCents: 500, description: "Ingresso: Show", payerEmail: "buyer@example.test", notificationUrl: "https://eventmap.test/api/webhooks/mercadopago", expiresAt }, mp.fetch);
  const call = mp.calls.at(-1);
  assert.equal(call.url, "https://api.mercadopago.com/v1/payments");
  assert.equal(call.headers.authorization, "Bearer APP_USR-seller");
  assert.equal(call.headers["x-idempotency-key"], "order-1");
  assert.deepEqual([call.body.payment_method_id, call.body.transaction_amount, call.body.application_fee, call.body.external_reference, call.body.payer.email, call.body.notification_url], ["pix", 25, 5, "order-1", "buyer@example.test", "https://eventmap.test/api/webhooks/mercadopago"]);
  assert.equal(call.body.date_of_expiration, "2099-03-10T12:30:00.000-03:00", "expiration in Brasília offset");
  assert.deepEqual([pix.paymentId, pix.qrCode, pix.qrCodeBase64], ["9001", "00020126pix-9001", "iVBORw0KGgo9001"]);
  const fetched = await mpLib.getMercadoPagoPayment(config.apiBase, "APP_USR-seller", "9001", mp.fetch);
  assert.deepEqual([fetched.id, fetched.status, fetched.externalReference, fetched.amountCents], ["9001", "pending", "order-1", 2500]);
  await mpLib.refundMercadoPagoPayment(config.apiBase, "APP_USR-seller", "9001", "refund-order-1", mp.fetch);
  assert.equal(mp.calls.at(-1).headers["x-idempotency-key"], "refund-order-1");
  assert.equal(mp.payments.get("9001").status, "refunded");
  mp.fail = () => true;
  await assert.rejects(mpLib.getMercadoPagoPayment(config.apiBase, "APP_USR-seller", "9001", mp.fetch), mpLib.MercadoPagoError);
  await assert.rejects(mpLib.getMercadoPagoPayment(config.apiBase, "APP_USR-seller", "../x", mp.fetch), mpLib.MercadoPagoError, "payment ids are numeric");
}

// Minimal Prisma-like store for the shapes used by lib/services/tickets.ts.
function cmp(actual, condition) {
  if (condition && typeof condition === "object" && !(condition instanceof Date)) {
    if ("in" in condition && !condition.in.includes(actual)) return false;
    if ("not" in condition && actual === condition.not) return false;
    const has = ["gt", "gte", "lt", "lte"].some((op) => op in condition);
    if (has && actual == null) return false;
    const a = actual instanceof Date ? actual.getTime() : actual;
    const v = (x) => (x instanceof Date ? x.getTime() : x);
    if ("gt" in condition && !(a > v(condition.gt))) return false;
    if ("gte" in condition && !(a >= v(condition.gte))) return false;
    if ("lt" in condition && !(a < v(condition.lt))) return false;
    if ("lte" in condition && !(a <= v(condition.lte))) return false;
    return true;
  }
  if (actual instanceof Date && condition instanceof Date) return actual.getTime() === condition.getTime();
  return actual === condition;
}
function matches(row, where) {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some((part) => matches(row, part));
    if (key === "eventId_userId") return row.eventId === value.eventId && row.userId === value.userId;
    return cmp(row[key], value);
  });
}
function applyData(row, data) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && "increment" in value) row[key] = (row[key] ?? 0) + value.increment;
    else row[key] = value;
  }
}
function table(name, rows, defaults = () => ({}), relations = {}) {
  const hydrate = (row) => {
    const copy = { ...row };
    for (const [rel, resolveRelation] of Object.entries(relations)) copy[rel] = resolveRelation(row);
    return copy;
  };
  let sequence = 0;
  const api = {
    rows,
    findFirst: async (q = {}) => { const row = rows.find((item) => matches(item, q.where)); return row ? hydrate(row) : null; },
    findUnique: async (q) => { const row = rows.find((item) => matches(item, q.where)); return row ? hydrate(row) : null; },
    findMany: async (q = {}) => { let list = rows.filter((row) => matches(row, q.where)); if (q.take) list = list.slice(0, q.take); return list.map(hydrate); },
    count: async (q = {}) => rows.filter((row) => matches(row, q.where)).length,
    create: async (q) => { const row = { id: `${name}-${++sequence}`, createdAt: current, updatedAt: current, ...defaults(), ...q.data }; rows.push(row); return hydrate(row); },
    createMany: async (q) => { for (const data of q.data) rows.push({ id: `${name}-${++sequence}`, ...data }); return { count: q.data.length }; },
    update: async (q) => { const row = rows.find((item) => matches(item, q.where)); if (!row) throw new Error("not found"); applyData(row, q.data); return hydrate(row); },
    updateMany: async (q) => { const hit = rows.filter((row) => matches(row, q.where)); for (const row of hit) applyData(row, q.data); return { count: hit.length }; },
    upsert: async (q) => { const row = rows.find((item) => matches(item, q.where)); if (row) { applyData(row, q.update); return hydrate(row); } return api.create({ data: q.create }); },
    deleteMany: async (q) => { const before = rows.length; for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], q.where)) rows.splice(i, 1); return { count: before - rows.length }; },
    aggregate: async (q) => {
      const list = rows.filter((row) => matches(row, q.where));
      const sum = {};
      for (const field of Object.keys(q._sum || {})) sum[field] = list.length ? list.reduce((total, row) => total + row[field], 0) : null;
      return { _sum: sum, _count: { _all: list.length } };
    },
  };
  return api;
}
function freshDb() {
  const events = [
    { id: "event-1", nome: "Show de Verão", userId: "seller", status: "PUBLISHED", dataInicio: "2099-03-20", startTime: "20:00", timezone: "America/Sao_Paulo", ticketsEnabled: true, ticketCapacity: 2, isFree: false, priceCents: 2500 },
    { id: "event-free", nome: "Feira", userId: "seller", status: "PUBLISHED", dataInicio: "2099-03-20", startTime: null, timezone: "America/Sao_Paulo", ticketsEnabled: false, ticketCapacity: null, isFree: true, priceCents: 0 },
    { id: "event-open", nome: "Festival", userId: "seller", status: "PUBLISHED", dataInicio: "2099-03-25", startTime: "18:00", timezone: "America/Sao_Paulo", ticketsEnabled: true, ticketCapacity: null, isFree: false, priceCents: 1234 },
  ];
  const users = [
    { id: "seller", name: "Organizadora", email: "seller@example.test", emailVerified: true, role: "PROMOTER", accounts: [] },
    { id: "buyer", name: "Comprador", email: "buyer@example.test", emailVerified: true, role: "BASIC", accounts: [] },
    { id: "buyer2", name: "Compradora", email: "buyer2@example.test", emailVerified: true, role: "BASIC", accounts: [] },
    { id: "google", name: "Google", email: "google@example.test", emailVerified: null, role: "BASIC", accounts: [{ id: "acc-g" }] },
    { id: "unverified", name: "Sem email", email: "nv@example.test", emailVerified: false, role: "BASIC", accounts: [] },
    { id: "admin", name: "Admin", email: "admin@example.test", emailVerified: true, role: "ADMIN", accounts: [] },
  ];
  const store = {
    events: table("event", events), user: table("user", users), notification: table("notification", []), communitySignal: table("signal", []),
    eventRegistration: table("registration", [], () => ({ status: "CONFIRMED", qrVersion: 0, checkedInAt: null })),
    mercadoPagoAccount: table("mpaccount", [], () => ({ connectedAt: current })),
  };
  store.ticketOrder = table("order", [], () => ({ status: "PENDING", mpPaymentId: null, pixCopyPaste: null, pixQrBase64: null, paidAt: null, refundedAt: null }), {
    event: (row) => events.find((event) => event.id === row.eventId) ?? null,
    buyer: (row) => users.find((user) => user.id === row.buyerId) ?? null,
    seller: (row) => users.find((user) => user.id === row.sellerId) ?? null,
  });
  // Serializes transactions like Postgres SERIALIZABLE would for these conflicting rows.
  let queue = Promise.resolve();
  store.$transaction = (fn) => { const run = queue.then(() => fn(store)); queue = run.catch(() => undefined); return run; };
  return store;
}

function signedWebhook(dataId, requestId = "req-" + dataId) {
  const ts = String(current.getTime());
  const v1 = crypto.createHmac("sha256", ENV.MP_WEBHOOK_SECRET).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex");
  return { xSignature: `ts=${ts},v1=${v1}`, xRequestId: requestId, dataId: String(dataId), type: "payment" };
}

async function checkService() {
  const sec = load("lib/ticketSecurity.ts");
  const service = load("lib/services/tickets.ts");
  const as = (id, role = "BASIC") => async () => ({ id, role });
  const anonymous = async () => null;
  const admin = async () => "admin";
  const notAdmin = async () => null;
  const mp = mockMercadoPago();
  const deps = { fetch: mp.fetch, now: clock, env: ENV, statusCheckIntervalMs: 0 };
  db = freshDb();
  current = NOW;

  // Not configured: nothing crashes, purchase hidden, connect refused.
  const bare = { ...deps, env: { NEXTAUTH_SECRET: ENV.NEXTAUTH_SECRET } };
  const bareState = await service.getTicketPurchaseState("event-1", as("buyer"), bare);
  assert.equal(bareState.success && bareState.data.state, "unavailable");
  assert.equal((await service.createTicketOrder({ eventId: "event-1" }, as("buyer"), bare)).success, false);
  assert.equal((await service.startMercadoPagoConnect(as("seller", "PROMOTER"), bare)).success, false);
  const bareOverview = await service.getPaymentsOverview(as("seller", "PROMOTER"), bare);
  assert.equal(bareOverview.success && bareOverview.data.configured, false);
  assert.equal(await service.handleMercadoPagoWebhook(signedWebhook(1), bare), 400, "webhook without secret is rejected");

  // OAuth connect: state bound to the user, code exchanged on the server, tokens encrypted.
  assert.equal((await service.startMercadoPagoConnect(anonymous, deps)).success, false);
  const start = await service.startMercadoPagoConnect(as("seller", "PROMOTER"), deps);
  assert.equal(start.success, true);
  const state = new URL(start.data.url).searchParams.get("state");
  assert.equal(await service.completeMercadoPagoConnect({ code: "good-code", state }, as("buyer"), deps), "invalid", "state of another user");
  assert.equal(await service.completeMercadoPagoConnect({ code: "good-code", state: state + "x" }, as("seller", "PROMOTER"), deps), "invalid", "tampered state");
  assert.equal(await service.completeMercadoPagoConnect({ code: "good-code", state }, anonymous, deps), "invalid", "no session");
  assert.equal(await service.completeMercadoPagoConnect({ code: "good-code", state }, as("seller", "PROMOTER"), { ...deps, now: () => new Date(NOW.getTime() + 11 * MIN) }), "invalid", "expired state");
  assert.equal(await service.completeMercadoPagoConnect({ error: "access_denied", state }, as("seller", "PROMOTER"), deps), "denied");
  assert.equal(await service.completeMercadoPagoConnect({ code: "bad-code", state }, as("seller", "PROMOTER"), deps), "error");
  assert.equal(db.mercadoPagoAccount.rows.length, 0, "nothing stored on failure");
  assert.equal(await service.completeMercadoPagoConnect({ code: "good-code", state }, as("seller", "PROMOTER"), deps), "connected");
  const account = db.mercadoPagoAccount.rows[0];
  assert.equal(account.userId, "seller");
  assert.equal(account.accessTokenEnc.includes("APP_USR"), false, "access token encrypted at rest");
  assert.equal(account.refreshTokenEnc.includes("TG-"), false, "refresh token encrypted at rest");
  assert.match(sec.decryptTicketToken(account.accessTokenEnc, ENV), /^APP_USR-access-/);
  const overview = await service.getPaymentsOverview(as("seller", "PROMOTER"), deps);
  assert.equal(overview.success && overview.data.account.mpUserId, account.mpUserId);
  assert.equal(/APP_USR|TG-|Enc/.test(JSON.stringify(overview)), false, "no token reaches the client");
  const sellerStatus = await service.getTicketSellerStatus(as("seller", "PROMOTER"), deps);
  assert.deepEqual(sellerStatus.data, { configured: true, connected: true });

  // Event settings validation used by the event form action.
  assert.equal(await service.ticketSettingsProblem(db, "seller", { ticketsEnabled: true, isFree: false, priceCents: 2500 }, ENV), null);
  assert.match(await service.ticketSettingsProblem(db, "buyer", { ticketsEnabled: true, isFree: false, priceCents: 2500 }, ENV), /Mercado Pago/, "cannot enable without a connected account");
  assert.match(await service.ticketSettingsProblem(db, "seller", { ticketsEnabled: true, isFree: false, priceCents: 400 }, ENV), /5,00/);
  assert.equal(await service.ticketSettingsProblem(db, "buyer", { ticketsEnabled: false, isFree: true, priceCents: 0 }, ENV), null);

  // Purchase state for guests and the seller.
  const guestState = await service.getTicketPurchaseState("event-1", anonymous, deps);
  assert.deepEqual([guestState.data.state, guestState.data.priceCents, guestState.data.seatsLeft], ["login", 2500, 2]);
  assert.equal((await service.getTicketPurchaseState("event-1", as("seller", "PROMOTER"), deps)).data.state, "own_event");
  assert.equal((await service.getTicketPurchaseState("event-free", as("buyer"), deps)).data.state, "unavailable");

  // Create order: eligibility, server-side price, one MP call with idempotency key = order id.
  assert.equal((await service.createTicketOrder({ eventId: "event-1" }, anonymous, deps)).success, false, "login required");
  assert.equal((await service.createTicketOrder({ eventId: "event-1", priceCents: 1 }, as("buyer"), deps)).success, false, "client cannot send a price");
  assert.equal((await service.createTicketOrder({ eventId: "event-1" }, as("seller", "PROMOTER"), deps)).success, false, "seller cannot buy own ticket");
  const unverified = await service.createTicketOrder({ eventId: "event-1" }, as("unverified"), deps);
  assert.equal(unverified.success, false);
  assert.match(unverified.message, /e-mail/i);
  assert.equal((await service.createTicketOrder({ eventId: "event-free" }, as("buyer"), deps)).success, false, "free event");
  assert.equal(db.ticketOrder.rows.length, 0);

  const created = await service.createTicketOrder({ eventId: "event-1" }, as("buyer"), deps);
  assert.equal(created.success, true, created.message);
  const order = db.ticketOrder.rows[0];
  assert.deepEqual([order.unitCents, order.feeCents, order.sellerId, order.buyerId, order.status], [2500, 500, "seller", "buyer", "PENDING"]);
  assert.equal(order.expiresAt.getTime(), NOW.getTime() + 30 * MIN, "30 minute Pix");
  const payCall = mp.calls.filter((call) => call.url.endsWith("/v1/payments") && call.method === "POST");
  assert.equal(payCall.length, 1);
  assert.equal(payCall[0].headers["x-idempotency-key"], order.id);
  assert.equal(payCall[0].headers.authorization, `Bearer ${sec.decryptTicketToken(account.accessTokenEnc, ENV)}`, "payment created with the seller token");
  assert.deepEqual([payCall[0].body.transaction_amount, payCall[0].body.application_fee, payCall[0].body.external_reference, payCall[0].body.payer.email], [25, 5, order.id, "buyer@example.test"]);
  assert.equal(payCall[0].body.notification_url, "https://eventmap.test/api/webhooks/mercadopago");
  assert.deepEqual([created.data.pixCopyPaste, created.data.pixQrBase64, created.data.status], ["00020126pix-9001", "iVBORw0KGgo9001", "PENDING"]);
  assert.equal(order.mpPaymentId, "9001");
  assert.equal(/APP_USR|TG-|Enc|feeCents/.test(JSON.stringify(created)), false, "no secrets or internals in the response");

  // Same buyer again: same order, no new payment (idempotent create).
  const again = await service.createTicketOrder({ eventId: "event-1" }, as("buyer"), deps);
  assert.equal(again.success, true);
  assert.equal(again.data.id, order.id);
  assert.equal(db.ticketOrder.rows.length, 1, "one open order per buyer per event");
  assert.equal(mp.calls.filter((call) => call.url.endsWith("/v1/payments") && call.method === "POST").length, 1, "no duplicate Pix");
  assert.equal((await service.getTicketPurchaseState("event-1", as("buyer"), deps)).data.state, "pending");

  // Race for the last seat: capacity 2, one pending + two buyers at the same time -> exactly one wins.
  const [first, second] = await Promise.all([
    service.createTicketOrder({ eventId: "event-1" }, as("buyer2"), deps),
    service.createTicketOrder({ eventId: "event-1" }, as("google"), deps),
  ]);
  assert.equal([first, second].filter((result) => result.success).length, 1, "only one buyer gets the last seat");
  const loser = first.success ? second : first;
  assert.match(loser.message, /esgotad/i);
  assert.equal(db.ticketOrder.rows.filter((row) => row.eventId === "event-1" && row.status === "PENDING").length, 2);
  assert.equal((await service.getTicketPurchaseState("event-1", as("admin", "ADMIN"), deps)).data.state, "sold_out");
  const winnerId = first.success ? "buyer2" : "google";
  const winner = db.ticketOrder.rows.find((row) => row.buyerId === winnerId);

  // Status: other users cannot read an order.
  assert.equal((await service.getTicketOrderStatus({ orderId: order.id }, as("buyer2"), deps)).success, false, "orders are private to the buyer");

  // Webhook: invalid signature rejected; valid signature but not approved / amount mismatch / unknown order -> no confirmation.
  assert.equal(await service.handleMercadoPagoWebhook({ ...signedWebhook(9001), xSignature: "ts=1,v1=deadbeef" }, deps), 400);
  assert.equal(await service.handleMercadoPagoWebhook({ ...signedWebhook(9001), dataId: "9002" }, deps), 400, "signature for another id");
  assert.equal(await service.handleMercadoPagoWebhook(signedWebhook(9001), deps), 200, "pending payment: accepted, nothing changes");
  assert.equal(order.status, "PENDING");
  assert.equal(await service.handleMercadoPagoWebhook(signedWebhook(123456), deps), 200, "unknown payment: ignored");
  assert.equal(await service.handleMercadoPagoWebhook({ ...signedWebhook(9001), type: "merchant_order" }, deps), 200, "other topics ignored");
  mp.payments.get("9001").status = "approved";
  mp.payments.get("9001").transaction_amount = 1;
  assert.equal(await service.handleMercadoPagoWebhook(signedWebhook(9001), deps), 200);
  assert.equal(order.status, "PENDING", "amount mismatch never confirms");
  mp.payments.get("9001").transaction_amount = 25;
  mp.payments.get("9001").external_reference = "someone-else";
  await service.handleMercadoPagoWebhook(signedWebhook(9001), deps);
  assert.equal(order.status, "PENDING", "external_reference mismatch never confirms");
  mp.payments.get("9001").external_reference = order.id;

  // Valid approved payment, delivered twice -> one PAID order, one registration, one notification.
  assert.equal(await service.handleMercadoPagoWebhook(signedWebhook(9001), deps), 200);
  assert.equal(await service.handleMercadoPagoWebhook(signedWebhook(9001, "req-retry"), deps), 200);
  assert.equal(order.status, "PAID");
  assert.equal(order.paidAt.getTime(), NOW.getTime());
  const registrations = db.eventRegistration.rows.filter((row) => row.eventId === "event-1" && row.userId === "buyer");
  assert.equal(registrations.length, 1, "duplicate webhook: single registration");
  assert.equal(registrations[0].status, "CONFIRMED");
  const notices = db.notification.rows.filter((row) => row.userId === "buyer" && row.title === "Ingresso confirmado");
  assert.equal(notices.length, 1, "notified once");
  assert.equal(notices[0].href, "/eventos/event-1");
  assert.ok(db.communitySignal.rows.some((row) => row.room === "user:buyer"), "bell refreshes in real time");
  assert.equal((await service.getTicketPurchaseState("event-1", as("buyer"), deps)).data.state, "owned");
  assert.equal((await service.createTicketOrder({ eventId: "event-1" }, as("buyer"), deps)).success, false, "already has a ticket");

  // Live re-check on the buyer screen (no webhook): approved payment confirms the winner's order.
  mp.payments.get(winner.mpPaymentId).status = "approved";
  const live = await service.getTicketOrderStatus({ orderId: winner.id }, as(winnerId), deps);
  assert.equal(live.success && live.data.status, "PAID", "live check confirms without webhook");
  assert.equal(db.eventRegistration.rows.filter((row) => row.userId === winnerId).length, 1);

  // Expiry: a pending order past 30 minutes frees the seat.
  const openOrder = await service.createTicketOrder({ eventId: "event-open" }, as("buyer"), deps);
  assert.equal(openOrder.success, true);
  const openRow = db.ticketOrder.rows.find((row) => row.id === openOrder.data.id);
  assert.equal(openRow.feeCents, 247, "fee rounding at order time");
  current = new Date(NOW.getTime() + 31 * MIN);
  const expired = await service.getTicketOrderStatus({ orderId: openRow.id }, as("buyer"), deps);
  assert.equal(expired.data.status, "EXPIRED");
  assert.equal(openRow.status, "EXPIRED");
  // A Pix approved right at the deadline is still honored (money was received).
  mp.payments.get(openRow.mpPaymentId).status = "approved";
  await service.handleMercadoPagoWebhook(signedWebhook(openRow.mpPaymentId), deps);
  assert.equal(openRow.status, "PAID", "late approval of an expired order is still confirmed");
  current = NOW;

  // MP failure while creating the Pix: order CANCELLED, friendly error, seat released.
  mp.fail = (pathname, method) => pathname === "/v1/payments" && method === "POST";
  const failed = await service.createTicketOrder({ eventId: "event-open" }, as("buyer2"), deps);
  mp.fail = null;
  assert.equal(failed.success, false);
  assert.match(failed.message, /Pix/);
  assert.equal(/500|internal/i.test(failed.message), false, "no provider detail");
  const failedRow = db.ticketOrder.rows.filter((row) => row.buyerId === "buyer2" && row.eventId === "event-open").at(-1);
  assert.equal(failedRow.status, "CANCELLED");

  // Rate limit: at most 5 order creations per buyer per 10 minutes.
  for (let index = 0; index < 4; index++) {
    mp.fail = (pathname, method) => pathname === "/v1/payments" && method === "POST";
    await service.createTicketOrder({ eventId: "event-open" }, as("buyer2"), deps);
  }
  mp.fail = null;
  const limited = await service.createTicketOrder({ eventId: "event-open" }, as("buyer2"), deps);
  assert.equal(limited.success, false);
  assert.match(limited.message, /tentativas/i, "6th attempt within 10 minutes is refused");
  current = new Date(NOW.getTime() + 11 * MIN);
  const afterWindow = await service.createTicketOrder({ eventId: "event-open" }, as("buyer2"), deps);
  assert.equal(afterWindow.success, true, "window passed: allowed again");
  current = NOW;

  // Seller summary: per-event count, gross, fee and net.
  const summary = await service.getPaymentsOverview(as("seller", "PROMOTER"), deps);
  const show = summary.data.events.find((item) => item.eventId === "event-1");
  assert.deepEqual([show.sold, show.grossCents, show.feeCents, show.netCents], [2, 5000, 1000, 4000]);
  assert.equal(JSON.stringify(summary).includes("@example.test"), false, "buyer e-mails are not exposed in the sales summary");
  assert.equal((await service.getPaymentsOverview(as("buyer"), deps)).data.events.length, 0, "only own sales");

  // Refund: only seller or admin; MP refund, REFUNDED, registration cancelled, buyer notified.
  assert.equal((await service.refundTicketOrder({ orderId: order.id }, as("buyer"), deps)).success, false, "buyer cannot refund");
  assert.equal((await service.refundTicketOrder({ orderId: order.id }, as("buyer2"), deps)).success, false, "stranger cannot refund");
  assert.equal(order.status, "PAID");
  const refunded = await service.refundTicketOrder({ orderId: order.id }, as("seller", "PROMOTER"), deps);
  assert.equal(refunded.success, true, refunded.message);
  assert.equal(order.status, "REFUNDED");
  assert.equal(order.refundedAt.getTime(), NOW.getTime());
  const refundCall = mp.calls.find((call) => call.url.endsWith(`/v1/payments/${order.mpPaymentId}/refunds`));
  assert.ok(refundCall, "MP refund called");
  assert.equal(refundCall.headers["x-idempotency-key"], `refund-${order.id}`);
  const buyerRegistration = db.eventRegistration.rows.find((row) => row.eventId === "event-1" && row.userId === "buyer");
  assert.equal(buyerRegistration.status, "CANCELLED");
  assert.equal(buyerRegistration.qrVersion, 1, "old QR invalidated");
  assert.ok(db.notification.rows.some((row) => row.userId === "buyer" && row.title === "Ingresso estornado"));
  assert.equal((await service.refundTicketOrder({ orderId: order.id }, as("seller", "PROMOTER"), deps)).success, false, "cannot refund twice");
  const adminRefund = await service.refundTicketOrder({ orderId: winner.id }, as("admin", "ADMIN"), deps);
  assert.equal(adminRefund.success, true, "admin can refund");
  assert.equal(winner.status, "REFUNDED");
  // A refund failure at MP leaves the order PAID.
  mp.fail = (pathname) => pathname.endsWith("/refunds");
  const failedRefund = await service.refundTicketOrder({ orderId: openRow.id }, as("seller", "PROMOTER"), deps);
  mp.fail = null;
  assert.equal(failedRefund.success, false);
  assert.equal(openRow.status, "PAID");

  // Admin fee totals.
  assert.equal((await service.getAdminTicketOverview(notAdmin, deps)).success, false);
  const adminOverview = await service.getAdminTicketOverview(admin, deps);
  assert.deepEqual([adminOverview.data.paid.count, adminOverview.data.paid.grossCents, adminOverview.data.paid.feeCents], [1, 1234, 247]);
  assert.deepEqual([adminOverview.data.refunded.count, adminOverview.data.refunded.grossCents], [2, 5000]);

  // Buyer tickets list.
  const mine = await service.listMyTickets(as("buyer"), deps);
  assert.equal(mine.success, true);
  assert.deepEqual(mine.data.map((item) => item.status).sort(), ["PAID", "REFUNDED"]);
  assert.equal((await service.listMyTickets(anonymous, deps)).success, false);

  // Token refresh before expiry.
  account.expiresAt = new Date(NOW.getTime() + 2 * 24 * 60 * MIN);
  const tokenCallsBefore = mp.calls.filter((call) => call.url.endsWith("/oauth/token")).length;
  const refreshedOrder = await service.createTicketOrder({ eventId: "event-open" }, as("google"), deps);
  assert.equal(refreshedOrder.success, true, refreshedOrder.message);
  assert.equal(mp.calls.filter((call) => call.url.endsWith("/oauth/token")).length, tokenCallsBefore + 1, "token refreshed when close to expiring");
  assert.ok(account.expiresAt.getTime() > NOW.getTime() + 100 * 24 * 60 * MIN, "new expiry stored");
  assert.equal(account.accessTokenEnc.includes("APP_USR"), false);

  // Disconnect is refused while a Pix is open, then removes tokens and disables sales.
  const blocked = await service.disconnectMercadoPago(as("seller", "PROMOTER"), deps);
  assert.equal(blocked.success, false, "pending Pix blocks disconnect");
  current = new Date(NOW.getTime() + 45 * MIN);
  const disconnected = await service.disconnectMercadoPago(as("seller", "PROMOTER"), deps);
  assert.equal(disconnected.success, true, disconnected.message);
  assert.equal(db.mercadoPagoAccount.rows.length, 0);
  assert.equal(db.events.rows.filter((event) => event.userId === "seller" && event.ticketsEnabled).length, 0, "sales disabled");
  current = NOW;
}

function checkWiring() {
  const { canAccessPath, isPublicPath } = load("lib/authPolicy.ts");
  for (const role of ["PROMOTER", "ADMIN"]) assert.equal(canAccessPath(role, "/myEvents/pagamentos"), true, role + " pagamentos");
  for (const role of ["BASIC", "GUEST"]) assert.equal(canAccessPath(role, "/myEvents/pagamentos"), false);
  for (const role of ["BASIC", "PROMOTER", "ADMIN"]) assert.equal(canAccessPath(role, "/ingressos"), true, role + " ingressos");
  assert.equal(canAccessPath("GUEST", "/ingressos"), false);
  assert.equal(canAccessPath("ADMIN", "/admin/ingressos"), true);
  for (const role of ["BASIC", "PROMOTER", "GUEST"]) assert.equal(canAccessPath(role, "/admin/ingressos"), false);
  assert.equal(isPublicPath("/ingressos"), false);
  const middleware = fs.readFileSync("middleware.ts", "utf8");
  assert.match(middleware, /"\/ingressos"/, "middleware protects /ingressos");
  assert.doesNotMatch(middleware, /\/api\/webhooks/, "webhook is never behind the session middleware");

  const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
  assert.match(schema, /model MercadoPagoAccount[\s\S]*accessTokenEnc[\s\S]*refreshTokenEnc/);
  assert.match(schema, /model TicketOrder[\s\S]*mpPaymentId\s+String\?\s+@unique/);
  assert.match(schema, /ticketsEnabled\s+Boolean\s+@default\(false\)/);
  const migrations = fs.readdirSync("prisma/migrations").filter((name) => name.endsWith("_ticket_sales"));
  assert.equal(migrations.length, 1, "one ticket sales migration");
  const sql = fs.readFileSync(path.join("prisma/migrations", migrations[0], "migration.sql"), "utf8");
  assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN)|ALTER\s+COLUMN[\s\S]*TYPE|DELETE\s+FROM|TRUNCATE/i, "additive migration only");

  const actions = fs.readFileSync("app/(actions)/tickets/action.ts", "utf8");
  assert.match(actions, /^"use server";/);
  assert.match(actions, /allowImpersonation: false/, "buying and connecting use the real account holder");
  const webhook = fs.readFileSync("app/api/webhooks/mercadopago/route.ts", "utf8");
  assert.match(webhook, /x-signature/);
  assert.match(webhook, /x-request-id/);
  const callback = fs.readFileSync("app/api/mercadopago/callback/route.ts", "utf8");
  assert.match(callback, /\/myEvents\/pagamentos\?status=/);
  const attendance = fs.readFileSync("lib/services/attendance.ts", "utf8");
  assert.match(attendance, /ticketsEnabled/, "free registration is closed while EventMap sells tickets");
  const events = fs.readFileSync("lib/services/events.ts", "utf8");
  assert.match(events, /ticketSettingsProblem/, "event form enforces ticket settings on the server");
  assert.match(events, /ticketOrder\.count/, "cancelling an event with sold tickets requires refunds first");
  const envExample = fs.readFileSync(".env.example", "utf8");
  for (const name of ["MP_CLIENT_ID", "MP_CLIENT_SECRET", "MP_WEBHOOK_SECRET", "TICKETS_ENCRYPTION_KEY", "MP_REDIRECT_URI"]) assert.match(envExample, new RegExp(`^${name}=\\s*$`, "m"), name + " documented without value");
}

(async () => {
  checkPure(load("lib/tickets.ts"));
  checkSecurity(load("lib/ticketSecurity.ts"));
  const mpLib = load("lib/mercadopago.ts");
  checkClient(mpLib);
  await checkClientCalls(mpLib);
  await checkService();
  checkWiring();
  console.log("PASS tickets: fee, bounds, capacity race, idempotent orders, rate limit, webhook signature and validation, expiry, refunds, OAuth state, token encryption, routes.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
