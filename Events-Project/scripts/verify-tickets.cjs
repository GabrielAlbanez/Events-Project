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
// Module stubs for files whose real dependencies (session, notifications fan-out) are out of scope here.
const stubs = {};
class PrismaKnownError extends Error { constructor(code, meta) { super("prisma " + code); this.code = code; this.meta = meta; } }
const prismaStub = { Prisma: { PrismaClientKnownRequestError: PrismaKnownError, TransactionIsolationLevel: { Serializable: "Serializable" } } };
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const resolve = (name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name === "@/lib/prisma") return { __esModule: true, get default() { return db; } };
    if (name === "@prisma/client") return prismaStub;
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
  assert.equal(lib.TICKET_FEE_PERCENT, 10);
  assert.equal(lib.ticketFeeCents(10000), 1000, "R$ 100 -> R$ 10 for EventMap");
  assert.equal(lib.ticketNetCents(10000), 9000, "R$ 100 -> R$ 90 for the organizer");
  assert.equal(lib.ticketFeeCents(5000), 500);
  assert.equal(lib.ticketFeeCents(1237), 124, "123.7 rounds to 124");
  assert.equal(lib.ticketFeeCents(1234), 123, "123.4 rounds to 123");
  assert.equal(lib.ticketFeeCents(504), 50, "50.4 rounds to 50");
  assert.equal(lib.ticketFeeCents(506), 51, "50.6 rounds to 51");
  assert.equal(lib.ticketNetCents(1234), 1111);
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
  const good = { xSignature: `ts=${ts},v1=${v1}`, xRequestId: "req-1", dataId: "123456", secret, now: new Date(Number(ts)) };
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
  // Replay window: 10 minutes either way; milliseconds (MP) and seconds both understood.
  assert.equal(sec.verifyMercadoPagoSignature({ ...good, now: new Date(Number(ts) + 9 * MIN) }), true, "9 minutes old: accepted");
  assert.equal(sec.verifyMercadoPagoSignature({ ...good, now: new Date(Number(ts) + 11 * MIN) }), false, "11 minutes old: replay rejected");
  assert.equal(sec.verifyMercadoPagoSignature({ ...good, now: new Date(Number(ts) - 11 * MIN) }), false, "11 minutes in the future: rejected");
  assert.equal(sec.verifyMercadoPagoSignature({ ...good, now: undefined }), false, "defaults to the real clock: a 2025 signature is stale");
  const tsSeconds = String(Math.floor(Number(ts) / 1000));
  const v1Seconds = crypto.createHmac("sha256", secret).update(`id:123456;request-id:req-1;ts:${tsSeconds};`).digest("hex");
  assert.equal(sec.verifyMercadoPagoSignature({ ...good, xSignature: `ts=${tsSeconds},v1=${v1Seconds}` }), true, "ts in seconds");
  assert.equal(sec.verifyMercadoPagoSignature({ ...good, xSignature: `ts=${tsSeconds},v1=${v1Seconds}`, now: new Date(Number(ts) + 20 * MIN) }), false, "ts in seconds, stale");

  // Cron bearer secret: exact match only, never without a configured secret.
  const cronSecret = "c".repeat(32);
  assert.equal(sec.verifyBearerSecret(`Bearer ${cronSecret}`, cronSecret), true);
  assert.equal(sec.verifyBearerSecret(`Bearer ${cronSecret}x`, cronSecret), false);
  assert.equal(sec.verifyBearerSecret(cronSecret, cronSecret), false, "scheme required");
  assert.equal(sec.verifyBearerSecret("Bearer ", ""), false, "no secret configured: always refused");
  assert.equal(sec.verifyBearerSecret(null, cronSecret), false);
  assert.equal(sec.verifyBearerSecret("Bearer short", "short"), false, "secrets under 16 characters are refused");

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
  const mp = { calls, payments, fail: null, tokenCount: 0, fixedUserId: null, onRefresh: null, refreshStatus: 200 };
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
      if (body.grant_type === "refresh_token" && mp.refreshStatus !== 200) return json(mp.refreshStatus, { error: "invalid_grant" });
      if (body.grant_type === "refresh_token" && mp.onRefresh) await mp.onRefresh();
      return json(200, { access_token: `APP_USR-access-${mp.tokenCount}`, refresh_token: `TG-refresh-${mp.tokenCount}`, expires_in: 15552000, user_id: mp.fixedUserId ?? 777000 + mp.tokenCount, token_type: "bearer" });
    }
    if (pathname === "/v1/payments" && method === "POST") {
      const key = headers["x-idempotency-key"];
      if (idempotency.has(key)) return json(201, idempotency.get(key));
      const id = ++sequence;
      const payment = { id, status: "pending", currency_id: "BRL", external_reference: body.external_reference, transaction_amount: body.transaction_amount, application_fee: body.application_fee, point_of_interaction: { transaction_data: { qr_code: `00020126pix-${id}`, qr_code_base64: `iVBORw0KGgo${id}` } } };
      payments.set(String(id), payment);
      idempotency.set(key, payment);
      return json(201, payment);
    }
    const paymentMatch = pathname.match(/^\/v1\/payments\/(\d+)$/);
    if (paymentMatch && method === "GET") {
      const payment = payments.get(paymentMatch[1]);
      return payment ? json(200, payment) : json(404, { message: "not found" });
    }
    if (paymentMatch && method === "PUT") {
      const payment = payments.get(paymentMatch[1]);
      if (!payment) return json(404, { message: "not found" });
      payment.status = body.status;
      return json(200, payment);
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
  // Base URL overrides are for isolated tests only: ignored on the Vercel production deployment.
  const overrides = { ...ENV, MP_API_BASE_URL: "http://127.0.0.1:9/mp", MP_AUTH_BASE_URL: "http://127.0.0.1:9/auth" };
  assert.deepEqual([mpLib.mercadoPagoConfig(overrides).apiBase, mpLib.mercadoPagoConfig(overrides).authBase], ["http://127.0.0.1:9/mp", "http://127.0.0.1:9/auth"]);
  const prod = mpLib.mercadoPagoConfig({ ...overrides, VERCEL_ENV: "production" });
  assert.deepEqual([prod.apiBase, prod.authBase], ["https://api.mercadopago.com", "https://auth.mercadopago.com"], "overrides ignored in production");
  assert.equal(mpLib.mercadoPagoConfig({ ...overrides, VERCEL_ENV: "preview" }).apiBase, "http://127.0.0.1:9/mp", "preview deployments may use a test double");
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
  assert.deepEqual([fetched.id, fetched.status, fetched.externalReference, fetched.amountCents, fetched.currencyId, fetched.applicationFeeCents], ["9001", "pending", "order-1", 2500, "BRL", 500]);
  // fee_details form of the marketplace fee, and its absence.
  mp.payments.get("9001").application_fee = undefined;
  mp.payments.get("9001").fee_details = [{ type: "mercadopago_fee", amount: 0.5 }, { type: "application_fee", amount: 5 }];
  assert.equal((await mpLib.getMercadoPagoPayment(config.apiBase, "APP_USR-seller", "9001", mp.fetch)).applicationFeeCents, 500);
  mp.payments.get("9001").fee_details = [];
  assert.equal((await mpLib.getMercadoPagoPayment(config.apiBase, "APP_USR-seller", "9001", mp.fetch)).applicationFeeCents, null);
  await mpLib.cancelMercadoPagoPayment(config.apiBase, "APP_USR-seller", "9001", mp.fetch);
  assert.deepEqual([mp.calls.at(-1).method, mp.calls.at(-1).body], ["PUT", { status: "cancelled" }]);
  mp.payments.get("9001").status = "pending";
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
    if (key === "eventId_code") return row.eventId === value.eventId && row.code === value.code;
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
    groupBy: async (q) => {
      const groups = new Map();
      for (const row of rows.filter((item) => matches(item, q.where))) {
        const values = Object.fromEntries(q.by.map((field) => [field, row[field] ?? (field === "quantity" ? 1 : null)]));
        const key = JSON.stringify(values);
        const group = groups.get(key) ?? { ...values, _count: { _all: 0 }, _sum: Object.fromEntries(Object.keys(q._sum || {}).map((field) => [field, 0])) };
        group._count._all++;
        for (const field of Object.keys(q._sum || {})) group._sum[field] += row[field] ?? 0;
        groups.set(key, group);
      }
      return Array.from(groups.values());
    },
    aggregate: async (q) => {
      const list = rows.filter((row) => matches(row, q.where));
      const sum = {};
      for (const field of Object.keys(q._sum || {})) sum[field] = list.length ? list.reduce((total, row) => total + (row[field] ?? (field === "quantity" ? 1 : 0)), 0) : null;
      return { _sum: sum, _count: { _all: list.length } };
    },
  };
  return api;
}
function freshDb() {
  const events = [
    { id: "event-1", nome: "Show de Verão", userId: "seller", status: "PUBLISHED", dataInicio: "2099-03-20", dataFim: "2099-03-20", endTime: "23:00", startTime: "20:00", timezone: "America/Sao_Paulo", ticketsEnabled: true, ticketCapacity: 2, isFree: false, priceCents: 2500 },
    { id: "event-free", nome: "Feira", userId: "seller", status: "PUBLISHED", dataInicio: "2099-03-20", dataFim: "2099-03-20", endTime: null, startTime: null, timezone: "America/Sao_Paulo", ticketsEnabled: false, ticketCapacity: null, isFree: true, priceCents: 0 },
    { id: "event-open", nome: "Festival", userId: "seller", status: "PUBLISHED", dataInicio: "2099-03-25", dataFim: "2099-03-25", endTime: null, startTime: "18:00", timezone: "America/Sao_Paulo", ticketsEnabled: true, ticketCapacity: null, isFree: false, priceCents: 1234 },
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
    events: table("event", events), notification: table("notification", []), communitySignal: table("signal", []),
    user: table("user", users, () => ({}), {
      _count: (row) => ({
        Events: events.filter((event) => event.userId === row.id).length, friendsOwned: 0,
        ticketsBought: store.ticketOrder.rows.filter((order) => order.buyerId === row.id).length,
        ticketsSold: store.ticketOrder.rows.filter((order) => order.sellerId === row.id).length,
      }),
    }),
    eventHistory: table("history", []), aiEventCandidate: table("candidate", []),
    eventRegistration: table("registration", [], () => ({ status: "CONFIRMED", qrVersion: 0, checkedInAt: null })),
    mercadoPagoAccount: table("mpaccount", [], () => ({ connectedAt: current })),
    communityTeamMember: table("team", []),
    ticketCoupon: table("coupon", [], () => ({ percentOff: null, amountOffCents: null, maxUses: null, expiresAt: null, active: true })),
  };
  store.ticketPass = table("pass", [], () => ({ status: "VALID", checkedInAt: null }), {
    order: (row) => { const order = store.ticketOrder.rows.find((item) => item.id === row.orderId); return order ? { ...order, quantity: order.quantity ?? 1, buyer: users.find((user) => user.id === order.buyerId) ?? null } : null; },
  });
  store.ticketOrder = table("order", [], () => ({ status: "PENDING", mpPaymentId: null, pixCopyPaste: null, pixQrBase64: null, paidAt: null, refundedAt: null }), {
    quantity: (row) => row.quantity ?? 1,
    passes: (row) => store.ticketPass.rows.filter((pass) => pass.orderId === row.id).sort((a, b) => a.position - b.position).map(({ id, position, status }) => ({ id, position, status })),
    event: (row) => events.find((event) => event.id === row.eventId) ?? null,
    buyer: (row) => users.find((user) => user.id === row.buyerId) ?? null,
    seller: (row) => users.find((user) => user.id === row.sellerId) ?? null,
  });
  // Serializes transactions like Postgres SERIALIZABLE would for these conflicting rows.
  let queue = Promise.resolve();
  store.$queryRaw = async () => [];
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
  assert.equal(await service.handleMercadoPagoWebhook(signedWebhook(1), bare), 503, "not configured: 503 so Mercado Pago retries later");
  assert.equal(await service.handleMercadoPagoWebhook(signedWebhook(1), { ...deps, env: { ...ENV, MP_WEBHOOK_SECRET: "" } }), 503, "missing webhook secret is a configuration problem, not a bad signature");

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
  assert.deepEqual([order.unitCents, order.feeCents, order.sellerId, order.buyerId, order.status], [2500, 250, "seller", "buyer", "PENDING"]);
  assert.equal(order.expiresAt.getTime(), NOW.getTime() + 30 * MIN, "30 minute Pix");
  const payCall = mp.calls.filter((call) => call.url.endsWith("/v1/payments") && call.method === "POST");
  assert.equal(payCall.length, 1);
  assert.equal(payCall[0].headers["x-idempotency-key"], order.id);
  assert.equal(payCall[0].headers.authorization, `Bearer ${sec.decryptTicketToken(account.accessTokenEnc, ENV)}`, "payment created with the seller token");
  assert.deepEqual([payCall[0].body.transaction_amount, payCall[0].body.application_fee, payCall[0].body.external_reference, payCall[0].body.payer.email], [25, 2.5, order.id, "buyer@example.test"]);
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
  assert.equal(openRow.feeCents, 123, "fee rounding at order time");
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
  assert.deepEqual([show.sold, show.grossCents, show.feeCents, show.netCents], [2, 5000, 500, 4500]);
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
  assert.deepEqual([adminOverview.data.paid.count, adminOverview.data.paid.grossCents, adminOverview.data.paid.feeCents], [1, 1234, 123]);
  assert.deepEqual([adminOverview.data.refunded.count, adminOverview.data.refunded.grossCents], [2, 5000]);

  // Buyer tickets list.
  const mine = await service.listMyTickets(as("buyer"), deps);
  assert.equal(mine.success, true);
  assert.deepEqual(mine.data.map((item) => item.status).sort(), ["PAID", "REFUNDED"]);
  assert.deepEqual([mine.data[0].organizerId, mine.data[0].organizerName], ["seller", "Organizadora"], "refund contact: the organizer");
  assert.equal((await service.listMyTickets(anonymous, deps)).success, false);

  // Token refresh before expiry.
  account.expiresAt = new Date(NOW.getTime() + 2 * 24 * 60 * MIN);
  const tokenCallsBefore = mp.calls.filter((call) => call.url.endsWith("/oauth/token")).length;
  const refreshedOrder = await service.createTicketOrder({ eventId: "event-open" }, as("google"), deps);
  assert.equal(refreshedOrder.success, true, refreshedOrder.message);
  assert.equal(mp.calls.filter((call) => call.url.endsWith("/oauth/token")).length, tokenCallsBefore + 1, "token refreshed when close to expiring");
  assert.ok(account.expiresAt.getTime() > NOW.getTime() + 100 * 24 * 60 * MIN, "new expiry stored");
  assert.equal(account.accessTokenEnc.includes("APP_USR"), false);

  // Disconnect is refused while a Pix is open, and while paid tickets exist for events that have not ended.
  const blocked = await service.disconnectMercadoPago(as("seller", "PROMOTER"), deps);
  assert.equal(blocked.success, false, "pending Pix blocks disconnect");
  current = new Date(NOW.getTime() + 45 * MIN);
  // A long sales history on past events must not hide a paid ticket for an upcoming one.
  db.events.rows.push({ id: "event-past", nome: "Antigo", userId: "seller", status: "ENDED", dataInicio: "2000-01-01", dataFim: "2000-01-01", endTime: "23:00", startTime: "20:00", timezone: "America/Sao_Paulo", ticketsEnabled: false, ticketCapacity: null, isFree: false, priceCents: 1000 });
  const history = Array.from({ length: 2000 }, (_, index) => ({ id: `history-${index}`, eventId: "event-past", sellerId: "seller", buyerId: "buyer", status: "PAID", unitCents: 1000, quantity: 1, feeCents: 100, mpPaymentId: null }));
  db.ticketOrder.rows.unshift(...history);
  const historyBlocked = await service.disconnectMercadoPago(as("seller", "PROMOTER"), deps);
  db.ticketOrder.rows.splice(0, history.length);
  db.events.rows.pop();
  assert.equal(historyBlocked.success, false, "paid tickets stay protected beyond 2000 orders");
  const paidBlocked = await service.disconnectMercadoPago(as("seller", "PROMOTER"), deps);
  assert.equal(paidBlocked.success, false, "paid tickets for an upcoming event block disconnect");
  assert.match(paidBlocked.message, /ingresso pago/);
  current = new Date("2099-03-26T03:30:00.000Z");
  const savedAccount = { ...db.mercadoPagoAccount.rows[0] };
  const disconnected = await service.disconnectMercadoPago(as("seller", "PROMOTER"), deps);
  assert.equal(disconnected.success, true, disconnected.message);
  assert.equal(db.mercadoPagoAccount.rows.length, 0);
  current = NOW;
  // Disconnecting pauses the sale: a paid event must never become a free registration with a valid QR.
  assert.equal(db.events.rows.find((event) => event.id === "event-1").ticketsEnabled, true, "the sale setting survives so reconnecting resumes it");
  assert.equal(await service.isTicketSaleActive("event-1", deps), false, "no checkout while disconnected");
  const envBefore = { ...process.env };
  Object.assign(process.env, ENV);
  try {
    const attendance = load("lib/services/attendance.ts");
    const paused = await attendance.getRegistrationState("event-1", "buyer");
    assert.deepEqual([paused.ticketSale, paused.ticketSalesPaused], [false, true], "public page shows paused sales");
    await assert.rejects(() => attendance.registerForEvent("event-1", "free-rider"), /pausadas/, "no free registration on a paused paid event");
    assert.equal(db.eventRegistration.rows.some((row) => row.userId === "free-rider"), false);
    assert.equal(await service.ticketSettingsProblem(db, "seller", { ticketsEnabled: true, isFree: false, priceCents: 2500, alreadyEnabled: true }, ENV), null, "a paused event can still be edited");
    assert.match(await service.ticketSettingsProblem(db, "seller", { ticketsEnabled: true, isFree: false, priceCents: 2500 }, ENV), /Mercado Pago/, "new sales still need a connected account");
    db.mercadoPagoAccount.rows.push(savedAccount);
    assert.equal(await service.isTicketSaleActive("event-1", deps), true, "reconnecting resumes the sale");
    assert.equal((await attendance.getRegistrationState("event-1", "buyer")).ticketSale, true);
  } finally {
    for (const key of Object.keys(ENV)) { if (key in envBefore) process.env[key] = envBefore[key]; else delete process.env[key]; }
  }
}

// Ticket orders are financial records: deleting their event or a buyer/seller account is refused (DB RESTRICT + friendly guard).
async function checkFinancialRecords() {
  db = freshDb();
  current = NOW;
  stubs["@/lib/adminAuth"] = { getAuthenticatedAdminId: async () => "admin" };
  stubs["@/lib/eventNotifications"] = { notifyEventAudience: async () => undefined };
  const { deleteEvents } = load("app/(actions)/deleteEvents/action.ts");
  const { deleteUser } = load("lib/services/userAdministration.ts");
  db.events.rows.push({ id: "event-plain", nome: "Sem vendas", userId: "seller", status: "PUBLISHED", banner: "", carrossel: [] });
  for (const event of db.events.rows) { event.banner ??= ""; event.carrossel ??= []; }
  db.ticketOrder.rows.push({ id: "order-old", eventId: "event-1", buyerId: "buyer2", sellerId: "seller", unitCents: 2500, feeCents: 500, status: "EXPIRED", expiresAt: NOW, createdAt: NOW });

  const blockedDelete = await deleteEvents(["event-1", "event-plain"], "admin");
  assert.equal(blockedDelete.status, "error", "an event with any ticket order (even expired) cannot be deleted");
  assert.match(blockedDelete.message, /ingresso/i);
  assert.ok(db.events.rows.some((event) => event.id === "event-1") && db.events.rows.some((event) => event.id === "event-plain"), "nothing deleted when one event is blocked");
  assert.equal(db.eventHistory.rows.length, 0, "no audit row for a refused delete");
  const okDelete = await deleteEvents(["event-plain"], "admin");
  assert.equal(okDelete.status, "success", okDelete.message);
  assert.equal(db.events.rows.some((event) => event.id === "event-plain"), false);

  const buyerDelete = await deleteUser({ id: "buyer2" }, async () => "admin");
  assert.equal(buyerDelete.status, "error", "a buyer with ticket history cannot be hard-deleted");
  assert.match(buyerDelete.message, /ingresso/i);
  assert.ok(db.user.rows.some((user) => user.id === "buyer2"));
  const plainDelete = await deleteUser({ id: "unverified" }, async () => "admin");
  assert.equal(plainDelete.status, "success", plainDelete.message);
  delete stubs["@/lib/adminAuth"];
  delete stubs["@/lib/eventNotifications"];

  const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
  const ticketModel = schema.match(/model TicketOrder \{[\s\S]*?\n\}/)[0];
  for (const relation of ["event ", "buyer ", "seller "]) {
    assert.match(ticketModel, new RegExp(`\\n\\s*${relation}[^\\n]*onDelete: Restrict`), relation.trim() + " relation is RESTRICT");
  }
  const restrict = fs.readdirSync("prisma/migrations").filter((name) => name.endsWith("_ticket_orders_restrict"));
  assert.equal(restrict.length, 1, "one RESTRICT migration");
  const sql = fs.readFileSync(path.join("prisma/migrations", restrict[0], "migration.sql"), "utf8");
  for (const column of ["eventId", "buyerId", "sellerId"]) {
    assert.match(sql, new RegExp(`ADD CONSTRAINT "ticket_orders_${column}_fkey"[^;]*ON DELETE RESTRICT`), column + " recreated with RESTRICT");
  }
  assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN)|DELETE\s+FROM|TRUNCATE|UPDATE\s+"/i, "constraint-only migration");
}

// Production-audit hardening: webhook availability, payment verification, late oversell, token lifecycle, reconciliation.
async function checkHardening() {
  const sec = load("lib/ticketSecurity.ts");
  const service = load("lib/services/tickets.ts");
  const as = (id, role = "BASIC") => async () => ({ id, role });
  const mp = mockMercadoPago();
  const deps = { fetch: mp.fetch, now: clock, env: ENV, statusCheckIntervalMs: 0, reconcileIntervalMs: 0 };
  db = freshDb();
  current = NOW;
  const connect = (patch = {}) => {
    db.mercadoPagoAccount.rows.splice(0);
    db.mercadoPagoAccount.rows.push({ id: "acc-1", userId: "seller", mpUserId: "555", accessTokenEnc: sec.encryptTicketToken("APP_USR-stored", ENV), refreshTokenEnc: sec.encryptTicketToken("TG-stored", ENV), expiresAt: new Date(NOW.getTime() + 100 * 24 * 60 * MIN), connectedAt: NOW, ...patch });
    return db.mercadoPagoAccount.rows[0];
  };
  connect();
  const buy = async (buyer, eventId = "event-open") => {
    const result = await service.createTicketOrder({ eventId }, as(buyer), deps);
    assert.equal(result.success, true, result.message);
    return db.ticketOrder.rows.find((row) => row.id === result.data.id);
  };
  const approve = (row) => { mp.payments.get(row.mpPaymentId).status = "approved"; };

  // Payment verification: currency, payment id and marketplace fee must match the stored order.
  const usd = await buy("buyer");
  approve(usd);
  mp.payments.get(usd.mpPaymentId).currency_id = "USD";
  assert.equal(await service.handleMercadoPagoWebhook(signedWebhook(usd.mpPaymentId), deps), 200);
  assert.equal(usd.status, "PENDING", "non-BRL payment never confirms");
  mp.payments.get(usd.mpPaymentId).currency_id = "BRL";
  mp.payments.get(usd.mpPaymentId).application_fee = 1;
  await service.handleMercadoPagoWebhook(signedWebhook(usd.mpPaymentId), deps);
  assert.equal(usd.status, "PENDING", "marketplace fee different from the order fee never confirms");
  mp.payments.get(usd.mpPaymentId).id = 424242;
  mp.payments.get(usd.mpPaymentId).application_fee = 1.23;
  await service.handleMercadoPagoWebhook(signedWebhook(usd.mpPaymentId), deps);
  assert.equal(usd.status, "PENDING", "payment id different from the stored one never confirms");
  mp.payments.get(usd.mpPaymentId).id = Number(usd.mpPaymentId);
  mp.payments.get(usd.mpPaymentId).application_fee = undefined;
  await service.handleMercadoPagoWebhook(signedWebhook(usd.mpPaymentId), deps);
  assert.equal(usd.status, "PAID", "fee absent from Mercado Pago's answer: confirmed (logged)");

  // Webhook replay: a valid signature older than 10 minutes is refused.
  const stale = signedWebhook(usd.mpPaymentId);
  current = new Date(NOW.getTime() + 11 * MIN);
  assert.equal(await service.handleMercadoPagoWebhook(stale, deps), 400, "replayed signature rejected");
  current = NOW;

  // Late approval with the event sold out: refunded automatically, buyer and seller notified.
  const capacityEvent = db.events.rows.find((event) => event.id === "event-1");
  const late = await buy("buyer", "event-1");
  current = new Date(NOW.getTime() + 31 * MIN);
  await service.getTicketOrderStatus({ orderId: late.id }, as("buyer"), deps);
  assert.equal(late.status, "EXPIRED");
  const filler1 = await buy("buyer2", "event-1");
  const filler2 = await buy("google", "event-1");
  for (const filler of [filler1, filler2]) { approve(filler); await service.handleMercadoPagoWebhook(signedWebhook(filler.mpPaymentId), deps); }
  assert.deepEqual([filler1.status, filler2.status], ["PAID", "PAID"], "event-1 (capacity 2) is now full");
  approve(late);
  assert.equal(await service.handleMercadoPagoWebhook(signedWebhook(late.mpPaymentId), deps), 200);
  assert.equal(late.status, "REFUNDED", "late approval on a full event is refunded");
  assert.ok(mp.calls.some((call) => call.url.endsWith(`/v1/payments/${late.mpPaymentId}/refunds`) && call.headers["x-idempotency-key"] === `refund-${late.id}`));
  assert.equal(db.eventRegistration.rows.some((row) => row.eventId === "event-1" && row.userId === "buyer" && row.status === "CONFIRMED"), false, "no seat granted");
  assert.ok(db.notification.rows.some((row) => row.userId === "buyer" && row.title === "Ingressos esgotados" && /Pix foi devolvido/.test(row.message)));
  assert.ok(db.notification.rows.some((row) => row.userId === "seller" && row.title === "Pix devolvido automaticamente"));
  // Same situation, but Mercado Pago refuses the refund: the money stays, so the ticket is honored above capacity.
  assert.equal(capacityEvent.ticketCapacity, 2);
  db.ticketOrder.rows.push({ id: "order-late-2", eventId: "event-1", buyerId: "admin", sellerId: "seller", unitCents: 2500, feeCents: 500, status: "EXPIRED", mpPaymentId: "8800", pixCopyPaste: null, pixQrBase64: null, expiresAt: NOW, paidAt: null, refundedAt: null, createdAt: current });
  mp.payments.set("8800", { id: 8800, status: "approved", currency_id: "BRL", external_reference: "order-late-2", transaction_amount: 25, application_fee: 5 });
  mp.fail = (pathname) => pathname.endsWith("/refunds");
  assert.equal(await service.handleMercadoPagoWebhook(signedWebhook("8800"), deps), 200);
  mp.fail = null;
  const lateTwo = db.ticketOrder.rows.find((row) => row.id === "order-late-2");
  assert.equal(lateTwo.status, "PAID", "refund refused: order stays PAID");
  assert.ok(db.eventRegistration.rows.some((row) => row.eventId === "event-1" && row.userId === "admin" && row.status === "CONFIRMED"), "ticket honored");
  current = NOW;

  // Unknown payment id (store failed at creation): recovered through external_reference with the collector's token.
  db.ticketOrder.rows.push({ id: "order-orphan", eventId: "event-open", buyerId: "buyer2", sellerId: "seller", unitCents: 1234, feeCents: 247, status: "PENDING", mpPaymentId: null, pixCopyPaste: null, pixQrBase64: null, expiresAt: new Date(NOW.getTime() + 20 * MIN), paidAt: null, refundedAt: null, createdAt: NOW });
  mp.payments.set("7700", { id: 7700, status: "approved", currency_id: "BRL", external_reference: "order-orphan", transaction_amount: 12.34, application_fee: 2.47 });
  assert.equal(await service.handleMercadoPagoWebhook({ ...signedWebhook("7700"), mpUserId: "999" }, deps), 200, "unknown collector: ignored");
  const orphan = db.ticketOrder.rows.find((row) => row.id === "order-orphan");
  assert.equal(orphan.mpPaymentId, null);
  assert.equal(await service.handleMercadoPagoWebhook({ ...signedWebhook("7700"), mpUserId: "555" }, deps), 200);
  assert.deepEqual([orphan.mpPaymentId, orphan.status], ["7700", "PAID"], "orphan payment adopted and confirmed");
  mp.payments.set("7701", { id: 7701, status: "approved", currency_id: "BRL", external_reference: "order-orphan", transaction_amount: 12.34, application_fee: 2.47 });
  await service.handleMercadoPagoWebhook({ ...signedWebhook("7701"), mpUserId: "555" }, deps);
  assert.equal(orphan.mpPaymentId, "7700", "an order that already has a payment id is never re-linked");

  // Store failure after Mercado Pago created the Pix: cancel there first, then release the order.
  const originalUpdateMany = db.ticketOrder.updateMany;
  db.ticketOrder.updateMany = async (q) => { if (q.data && q.data.mpPaymentId) throw new Error("db down"); return originalUpdateMany(q); };
  const storeFailed = await service.createTicketOrder({ eventId: "event-open" }, as("google"), deps);
  assert.equal(storeFailed.success, false);
  assert.equal(storeFailed.data, undefined, "no QR code is shown for a payment that was not stored");
  const storeRow = db.ticketOrder.rows.filter((row) => row.buyerId === "google" && row.eventId === "event-open").at(-1);
  const cancelCall = mp.calls.find((call) => call.method === "PUT" && call.body && call.body.status === "cancelled");
  assert.ok(cancelCall, "payment cancelled at Mercado Pago");
  assert.equal(storeRow.status, "CANCELLED", "order released only after the cancel");
  mp.fail = (pathname, method) => method === "PUT";
  current = new Date(NOW.getTime() + 11 * MIN);
  const cancelFailed = await service.createTicketOrder({ eventId: "event-open" }, as("google"), deps);
  mp.fail = null;
  db.ticketOrder.updateMany = originalUpdateMany;
  assert.equal(cancelFailed.success, false);
  const keptRow = db.ticketOrder.rows.filter((row) => row.buyerId === "google" && row.eventId === "event-open").at(-1);
  assert.notEqual(keptRow.id, storeRow.id);
  assert.equal(keptRow.status, "PENDING", "cancel failed: order kept PENDING (seat held) instead of a blind cancel");
  keptRow.status = "EXPIRED";
  current = NOW;

  // Serializable retries: serialization conflicts (P2034, or 40001 behind P2010/P2028) are retried with backoff.
  const realTransaction = db.$transaction;
  let conflicts = 0;
  db.$transaction = (fn, options) => {
    if (conflicts < 3) { conflicts++; return Promise.reject(conflicts === 2 ? new PrismaKnownError("P2010", { code: "40001" }) : new PrismaKnownError(conflicts === 3 ? "P2028" : "P2034", { message: "could not serialize access (40001)" })); }
    return realTransaction(fn, options);
  };
  const retried = await service.createTicketOrder({ eventId: "event-open" }, as("admin", "ADMIN"), deps);
  assert.equal(retried.success, true, "succeeds after three serialization conflicts: " + retried.message);
  assert.equal(conflicts, 3);
  conflicts = 0;
  db.$transaction = () => { conflicts++; return Promise.reject(new PrismaKnownError("P2034")); };
  assert.equal((await service.createTicketOrder({ eventId: "event-open" }, as("buyer"), deps)).success, false);
  assert.equal(conflicts, 5, "gives up after 5 attempts");
  conflicts = 0;
  db.$transaction = () => { conflicts++; return Promise.reject(new PrismaKnownError("P2002")); };
  await service.createTicketOrder({ eventId: "event-open" }, as("buyer"), deps);
  assert.equal(conflicts, 1, "other errors are not retried");
  db.$transaction = realTransaction;

  // Reconciliation: recent EXPIRED/PENDING orders with a payment id are re-read; older than 48 hours are left alone.
  const missed = db.ticketOrder.rows.find((row) => row.id === retried.data.id);
  missed.status = "EXPIRED";
  approve(missed);
  db.ticketOrder.rows.push({ id: "order-ancient", eventId: "event-open", buyerId: "buyer", sellerId: "seller", unitCents: 1234, feeCents: 247, status: "EXPIRED", mpPaymentId: "6600", pixCopyPaste: null, pixQrBase64: null, expiresAt: NOW, paidAt: null, refundedAt: null, createdAt: new Date(NOW.getTime() - 49 * 60 * MIN) });
  db.user.rows.push({ id: "day-old-buyer", name: "Comprador antigo", email: "day-old@example.test" }, { id: "chargeback-buyer", name: "Comprador estornado", email: "chargeback@example.test" });
  // Created just before yesterday's daily run and paid after it: the next run must still see it.
  db.ticketOrder.rows.push({ id: "order-day-old", eventId: "event-open", buyerId: "day-old-buyer", sellerId: "seller", unitCents: 1234, feeCents: 247, status: "EXPIRED", mpPaymentId: "6601", pixCopyPaste: null, pixQrBase64: null, expiresAt: NOW, paidAt: null, refundedAt: null, createdAt: new Date(NOW.getTime() - 25 * 60 * MIN) });
  mp.payments.set("6601", { id: 6601, status: "approved", currency_id: "BRL", external_reference: "order-day-old", transaction_amount: 12.34, application_fee: 2.47 });
  mp.payments.set("6600", { id: 6600, status: "approved", currency_id: "BRL", external_reference: "order-ancient", transaction_amount: 12.34, application_fee: 2.47 });
  const report = await service.reconcileRecentTicketOrders(deps);
  assert.equal(missed.status, "PAID", "missed webhook recovered by reconciliation");
  assert.equal(db.ticketOrder.rows.find((row) => row.id === "order-ancient").status, "EXPIRED", "outside the 48 hour window");
  assert.equal(db.ticketOrder.rows.find((row) => row.id === "order-day-old").status, "PAID", "a daily cron never skips an order between two runs");
  assert.ok(report.checked >= 1 && report.failed === 0, JSON.stringify(report));
  assert.deepEqual(await service.reconcileRecentTicketOrders({ ...deps, env: { NEXTAUTH_SECRET: ENV.NEXTAUTH_SECRET } }), { checked: 0, failed: 0 }, "not configured: no-op");
  // Crash between marking a late oversold approval PAID and refunding it: PAID with no registration row at all
  // (grantTicket always creates one and cancelling keeps it). Reconciliation finishes the refund.
  const strand = (id, eventId, paymentId, status) => {
    db.ticketOrder.rows.push({ id, eventId, buyerId: "unverified", sellerId: "seller", unitCents: 2500, feeCents: 500, status: "PAID", mpPaymentId: paymentId, pixCopyPaste: null, pixQrBase64: null, expiresAt: NOW, paidAt: NOW, refundedAt: null, createdAt: NOW });
    mp.payments.set(paymentId, { id: Number(paymentId), status, currency_id: "BRL", external_reference: id, transaction_amount: 25, application_fee: 5 });
    return db.ticketOrder.rows.find((row) => row.id === id);
  };
  const stranded = strand("order-stranded", "event-1", "5500", "approved");
  const strandedRefunded = strand("order-stranded-2", "event-open", "5501", "refunded");
  const honored = db.ticketOrder.rows.find((row) => row.id === "order-late-2");
  const honoredRefunds = () => mp.calls.filter((call) => call.url.endsWith("/v1/payments/8800/refunds")).length;
  const honoredBefore = honoredRefunds();
  await service.reconcileRecentTicketOrders(deps);
  assert.equal(stranded.status, "REFUNDED", "stranded oversold order is refunded by reconciliation");
  assert.ok(mp.calls.some((call) => call.url.endsWith("/v1/payments/5500/refunds") && call.headers["x-idempotency-key"] === "refund-order-stranded"), "refund reuses the order idempotency key");
  assert.equal(strandedRefunded.status, "REFUNDED", "refund already done at Mercado Pago: order marked REFUNDED");
  assert.equal(honored.status, "PAID", "paid order with a registration is left alone");
  assert.equal(honoredRefunds(), honoredBefore, "no new refund attempt for honored tickets");
  // Refund or chargeback made at Mercado Pago with the webhook lost: the ticket must stop being valid.
  db.events.rows.push({ ...db.events.rows.find((event) => event.id === "event-open"), id: "event-chargeback", nome: "Chargeback" });
  db.ticketOrder.rows.push({ id: "order-chargeback", eventId: "event-chargeback", buyerId: "chargeback-buyer", sellerId: "seller", unitCents: 2500, feeCents: 500, quantity: 1, status: "PAID", mpPaymentId: "5502", pixCopyPaste: null, pixQrBase64: null, expiresAt: NOW, paidAt: NOW, refundedAt: null, createdAt: NOW });
  db.eventRegistration.rows.push({ id: "reg-chargeback", eventId: "event-chargeback", userId: "chargeback-buyer", status: "CONFIRMED", qrVersion: 0, checkedInAt: null, createdAt: NOW });
  mp.payments.set("5502", { id: 5502, status: "charged_back", currency_id: "BRL", external_reference: "order-chargeback", transaction_amount: 25, application_fee: 5 });
  await service.reconcileRecentTicketOrders(deps);
  assert.equal(db.ticketOrder.rows.find((row) => row.id === "order-chargeback").status, "REFUNDED", "lost chargeback webhook recovered");
  assert.equal(db.eventRegistration.rows.find((row) => row.id === "reg-chargeback").status, "CANCELLED", "its QR stops working");
  assert.equal(honored.status, "PAID", "an approved payment stays paid");
  // Removed by the organizer: cannot buy, and a late Pix is returned instead of granting a seat.
  db.events.rows.push({ ...db.events.rows.find((event) => event.id === "event-open"), id: "event-removed", nome: "Removido" });
  db.user.rows.push({ ...db.user.rows.find((user) => user.id === "buyer2"), id: "removed-buyer", email: "removed@example.test" });
  const removedOrder = await buy("removed-buyer", "event-removed");
  removedOrder.status = "EXPIRED";
  db.eventRegistration.rows.push({ id: "reg-removed", eventId: "event-removed", userId: "removed-buyer", status: "REJECTED", qrVersion: 1, checkedInAt: null, createdAt: NOW });
  const removedRetry = await service.createTicketOrder({ eventId: "event-removed" }, as("removed-buyer"), deps);
  assert.equal(removedRetry.success, false, "a removed person cannot buy");
  assert.equal((await service.getTicketPurchaseState("event-removed", as("removed-buyer"), deps)).data.state, "approval", "the purchase is not offered");
  approve(removedOrder);
  await service.reconcileRecentTicketOrders(deps);
  assert.equal(removedOrder.status, "REFUNDED", "a late Pix from a removed person goes back");
  assert.ok(mp.calls.some((call) => call.url.endsWith(`/v1/payments/${removedOrder.mpPaymentId}/refunds`)), "refund requested");
  assert.equal(db.eventRegistration.rows.find((row) => row.id === "reg-removed").status, "REJECTED", "no seat is granted");
  assert.ok(db.notification.rows.some((row) => row.userId === "removed-buyer" && /devolvido/.test(row.message) && !/esgot/.test(row.message)), "told the real reason");
  // Opportunistic run when the buyer opens /ingressos (throttled per viewer).
  db.events.rows.push({ ...db.events.rows.find((event) => event.id === "event-open"), id: "event-extra", nome: "Extra" });
  const viaList = await buy("buyer", "event-extra");
  current = new Date(NOW.getTime() + 31 * MIN);
  await service.getTicketOrderStatus({ orderId: viaList.id }, as("buyer"), deps);
  assert.equal(viaList.status, "EXPIRED");
  approve(viaList);
  const throttled = { ...deps, reconcileIntervalMs: 20 * MIN };
  const getsBefore = mp.calls.filter((call) => call.method === "GET").length;
  await service.listMyTickets(as("buyer"), throttled);
  assert.equal(viaList.status, "PAID", "listing my tickets reconciles my recent orders");
  viaList.status = "EXPIRED";
  await service.listMyTickets(as("buyer"), throttled);
  assert.equal(viaList.status, "EXPIRED", "second load within the interval does not call Mercado Pago again");
  assert.ok(mp.calls.filter((call) => call.method === "GET").length > getsBefore);
  viaList.status = "PAID";
  current = NOW;

  // Refunds: disconnected account vs provider failure vs store failure after a successful refund.
  const refundable = db.ticketOrder.rows.find((row) => row.id === "order-orphan");
  db.mercadoPagoAccount.rows.splice(0);
  const disconnected = await service.refundTicketOrder({ orderId: refundable.id }, as("seller", "PROMOTER"), deps);
  assert.equal(disconnected.success, false);
  assert.match(disconnected.message, /desconectada/, "disconnected account is named as such");
  connect();
  mp.fail = (pathname) => pathname.endsWith("/refunds");
  const providerDown = await service.refundTicketOrder({ orderId: refundable.id }, as("seller", "PROMOTER"), deps);
  mp.fail = null;
  assert.match(providerDown.message, /não confirmou/);
  assert.doesNotMatch(providerDown.message, /desconectada/);
  let failingWrites = 2;
  db.ticketOrder.updateMany = async (q) => { if (q.data && q.data.status === "REFUNDED" && failingWrites-- > 0) throw new Error("db down"); return originalUpdateMany(q); };
  const refundStoreFailed = await service.refundTicketOrder({ orderId: refundable.id }, as("seller", "PROMOTER"), deps);
  db.ticketOrder.updateMany = originalUpdateMany;
  assert.equal(refundStoreFailed.success, true, "money already returned: never reported as a failure");
  assert.match(refundStoreFailed.message, /em instantes/);
  assert.equal(refundable.status, "PAID", "both writes failed; the webhook/reconcile will reflect it");
  failingWrites = 1;
  db.ticketOrder.updateMany = async (q) => { if (q.data && q.data.status === "REFUNDED" && failingWrites-- > 0) throw new Error("db down"); return originalUpdateMany(q); };
  const refundRetried = await service.refundTicketOrder({ orderId: refundable.id }, as("seller", "PROMOTER"), deps);
  db.ticketOrder.updateMany = originalUpdateMany;
  assert.equal(refundRetried.success, true);
  assert.equal(refundable.status, "REFUNDED", "markRefunded retried once");

  // Token refresh race: another request rotated the refresh token first, so its stored token is used.
  const racing = connect({ expiresAt: new Date(NOW.getTime() + 2 * 24 * 60 * MIN) });
  mp.onRefresh = async () => {
    racing.refreshTokenEnc = sec.encryptTicketToken("TG-winner", ENV);
    racing.accessTokenEnc = sec.encryptTicketToken("APP_USR-winner", ENV);
    racing.expiresAt = new Date(NOW.getTime() + 180 * 24 * 60 * MIN);
  };
  const raced = await buy("buyer2");
  mp.onRefresh = null;
  const racedCall = mp.calls.filter((call) => call.url.endsWith("/v1/payments") && call.method === "POST").at(-1);
  assert.equal(racedCall.headers.authorization, "Bearer APP_USR-winner", "concurrent refresh: the stored winner is used");
  assert.equal(sec.decryptTicketToken(racing.refreshTokenEnc, ENV), "TG-winner", "the winner's refresh token is not overwritten");
  raced.status = "EXPIRED";

  // invalid_grant: account flagged for reconnection, seller notified once, sales show as unavailable.
  const revoked = connect({ expiresAt: new Date(NOW.getTime() + 2 * 24 * 60 * MIN) });
  mp.refreshStatus = 400;
  const afterRevoke = await service.createTicketOrder({ eventId: "event-open" }, as("buyer2"), deps);
  assert.equal(afterRevoke.success, false);
  assert.equal(revoked.expiresAt.getTime(), 0, "flagged for reconnection");
  assert.equal(db.mercadoPagoAccount.rows.length, 1, "the account row is kept");
  const reconnectNotices = () => db.notification.rows.filter((row) => row.userId === "seller" && /Reconecte/.test(row.title)).length;
  assert.equal(reconnectNotices(), 1);
  const panel = await service.getPaymentsOverview(as("seller", "PROMOTER"), deps);
  assert.equal(panel.data.account.needsReconnect, true, "panel asks to reconnect");
  assert.equal(reconnectNotices(), 1, "seller notified once");
  const tokenCalls = mp.calls.filter((call) => call.url.endsWith("/oauth/token")).length;
  assert.equal((await service.getTicketPurchaseState("event-open", as("buyer2"), deps)).data.state, "unavailable", "buyers see sales unavailable");
  await service.createTicketOrder({ eventId: "event-open" }, as("buyer2"), deps);
  assert.equal(mp.calls.filter((call) => call.url.endsWith("/oauth/token")).length, tokenCalls, "a flagged account is not refreshed again");
  mp.refreshStatus = 200;

  // Reconnect: a different Mercado Pago account is refused while orders are open or paid; the same account is fine.
  const start = await service.startMercadoPagoConnect(as("seller", "PROMOTER"), deps);
  const state = new URL(start.data.url).searchParams.get("state");
  mp.fixedUserId = 999001;
  assert.equal(await service.completeMercadoPagoConnect({ code: "good-code", state }, as("seller", "PROMOTER"), deps), "account_mismatch");
  assert.equal(db.mercadoPagoAccount.rows[0].mpUserId, "555", "stored account untouched");
  mp.fixedUserId = 555;
  assert.equal(await service.completeMercadoPagoConnect({ code: "good-code", state }, as("seller", "PROMOTER"), deps), "connected");
  assert.ok(db.mercadoPagoAccount.rows[0].expiresAt.getTime() > NOW.getTime(), "reconnection clears the flag");
  assert.equal((await service.getPaymentsOverview(as("seller", "PROMOTER"), deps)).data.account.needsReconnect, false);
  mp.fixedUserId = null;
}

function checkWiring() {
  // Production runtime reads EVENTMAP_PRODUCTION_DATABASE_URL (lib/prisma.ts); migrations must target that same database.
  const migrate = fs.readFileSync("scripts/migrate-on-production.cjs", "utf8");
  assert.match(fs.readFileSync("lib/prisma.ts", "utf8"), /EVENTMAP_PRODUCTION_DATABASE_URL/);
  assert.match(migrate, /DATABASE_URL: process\.env\.EVENTMAP_PRODUCTION_DATABASE_URL/, "migrations run against the runtime production database");
  const { schemaUpToDate } = require(path.resolve("scripts/migrate-on-production.cjs"));
  assert.equal(schemaUpToDate({ status: 0, stdout: ["19 migrations found in prisma/migrations", "", "Database schema is up to date!"].join("\n") }), true, "nothing pending: skip migrate deploy (no advisory lock)");
  assert.equal(schemaUpToDate({ status: 1, stdout: ["Following migration have not yet been applied:", "20990101_x"].join("\n") }), false, "pending migrations still run");
  assert.equal(schemaUpToDate({ status: 1, stderr: "Error: P1001: Can't reach database server" }), false, "errors fall through to migrate deploy");
  assert.equal(schemaUpToDate({ error: new Error("ETIMEDOUT"), status: null, stdout: "Database schema is up to date!" }), false, "timeouts never skip");
  assert.match(migrate, /require\.main === module/, "script only runs when executed, so tests can load it");
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
  for (const file of ["components/MyComponents/tickets/TicketPurchase.tsx", "components/MyComponents/tickets/PaymentsPanel.tsx"]) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /process\.env|MP_CLIENT_SECRET|TICKETS_ENCRYPTION_KEY/, file + " never reads secrets");
  }
  const purchase = fs.readFileSync("components/MyComponents/tickets/TicketPurchase.tsx", "utf8");
  assert.match(purchase, /4000/, "status polling every ~4s");
  assert.match(purchase, /clearInterval|clearTimeout/, "polling is cleaned up");
  const terms = fs.readFileSync("app/(publicRoutes)/termos/page.tsx", "utf8");
  assert.match(terms, /10%/);
  assert.match(terms, /art\. 49/);
  const publicActions = fs.readFileSync("components/MyComponents/EventPublicActions.tsx", "utf8");
  assert.match(publicActions, /ticketSale && registrationOpen && <TicketPurchase/, "event page shows the checkout when EventMap sells tickets");
  assert.match(fs.readFileSync("app/eventos/[id]/page.tsx", "utf8"), /isTicketSaleActive\(/, "buy button hidden unless payments are configured");
  // Drawers and modals don't receive ticketSale: the registration state must say the event sells tickets so they hide the free RSVP.
  assert.match(fs.readFileSync("lib/services/attendance.ts", "utf8"), /ticketSale: canSell, ticketSalesPaused: sellsTickets && !canSell/, "registration state exposes ticketSale");
  const actionsUi = fs.readFileSync("components/MyComponents/EventPublicActions.tsx", "utf8");
  assert.match(actionsUi, /const sellsElsewhere = !ticketSale && Boolean\(registration\?\.ticketSale\)/, "overlays detect EventMap ticket sales");
  const eventForm = fs.readFileSync("components/MyComponents/EventoForm.tsx", "utf8");
  assert.match(eventForm, /Vender ingressos pelo EventMap/);
  assert.match(fs.readFileSync("components/MyComponents/tickets/MercadoPagoConnectCard.tsx", "utf8"), /conecte sua conta do Mercado Pago/, "disabled toggle explains the connect step");
  assert.match(eventForm, /payload\.append\("ticketsEnabled"/);
  const sidebar = fs.readFileSync("components/ui/app-sidebar.tsx", "utf8");
  for (const href of ["/ingressos", "/myEvents/pagamentos", "/admin/ingressos"]) assert.match(sidebar, new RegExp(`href: "${href.replace(/\//g, "\/")}"`), href + " in navigation");
  // Free RSVP stays closed for paid EventMap sales even while payments are not configured.
  const attendanceSource = fs.readFileSync("lib/services/attendance.ts", "utf8");
  assert.match(attendanceSource, /if \(event\.ticketsEnabled && !event\.isFree\) \{/, "registration blocked regardless of payments configuration");
  assert.match(attendanceSource, /As vendas deste evento estão pausadas no momento\./);
  assert.match(attendanceSource, /ticketSalesPaused: sellsTickets && !canSell/);
  // Webhook route forwards the collector hint; cron route is bearer-protected; health reports payments.
  assert.match(fs.readFileSync("app/api/webhooks/mercadopago/route.ts", "utf8"), /mpUserId:/);
  const cron = fs.readFileSync("app/api/cron/tickets-reconcile/route.ts", "utf8");
  assert.match(cron, /verifyBearerSecret\(request\.headers\.get\("authorization"\), secret\)/);
  assert.match(cron, /reconcileRecentTicketOrders\(\)/);
  assert.match(cron, /export async function GET/, "Vercel Cron uses GET");
  const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  const job = vercel.crons.find((item) => item.path === "/api/cron/tickets-reconcile");
  assert.ok(job, "cron scheduled");
  assert.match(job.schedule, /^\d+ \d+ \* \* \*$/, "daily schedule (Vercel Hobby)");
  const health = fs.readFileSync("app/api/health/route.ts", "utf8");
  assert.match(health, /payments: ticketPaymentsConfigured\(\)/);
  assert.doesNotMatch(health, /MP_|TICKETS_ENCRYPTION_KEY/, "health exposes no variable names");
  // Copy and UI for the audit fixes.
  const panelUi = fs.readFileSync("components/MyComponents/tickets/PaymentsPanel.tsx", "utf8");
  assert.match(panelUi, /account_mismatch:/, "reconnect with another account explained");
  assert.match(panelUi, /needsReconnect/);
  assert.match(panelUi, /Reconectar Mercado Pago/);
  assert.match(actionsUi, /registration\?\.ticketSalesPaused/);
  assert.match(actionsUi, /As vendas deste evento estão pausadas no momento\./);
  assert.match(actionsUi, /!ticketSale && !sellsElsewhere && !salesPaused && eventStatus !== "CANCELLED"/, "no free RSVP while sales are paused");
  const myTickets = fs.readFileSync("app/(private)/ingressos/page.tsx", "utf8");
  assert.match(myTickets, /Precisa de reembolso\?/);
  assert.match(myTickets, /7 dias/);
  assert.match(myTickets, /\/promotores\//, "links the organizer profile");
  const organizers = fs.readFileSync("app/(publicRoutes)/para-organizadores/page.tsx", "utf8");
  assert.doesNotMatch(organizers, /não vende ingressos|não processa pagamentos/, "organizer page reflects ticket sales");
  assert.match(organizers, /10%/);
  assert.match(fs.readFileSync("app/(publicRoutes)/privacidade/page.tsx", "utf8"), /Mercado Pago, que recebe seu nome, e-mail/);
  assert.ok(fs.existsSync("docs/superpowers/specs/2026-11-21-ingressos-rollback.md"), "rollback notes");
  const envExample = fs.readFileSync(".env.example", "utf8");
  for (const name of ["MP_CLIENT_ID", "MP_CLIENT_SECRET", "MP_WEBHOOK_SECRET", "TICKETS_ENCRYPTION_KEY", "MP_REDIRECT_URI", "CRON_SECRET"]) assert.match(envExample, new RegExp(`^${name}=\\s*$`, "m"), name + " documented without value");
}


// Discount coupons: created by the event owner, applied at checkout; the 20% fee is charged on the discounted price.
function checkCouponRules(lib) {
  assert.equal(lib.normalizeCouponCode(" amigo10 "), "AMIGO10");
  assert.equal(lib.normalizeCouponCode("AB"), null, "too short");
  assert.equal(lib.normalizeCouponCode("x".repeat(21)), null, "too long");
  assert.equal(lib.normalizeCouponCode("amigo 10"), null, "no spaces");
  assert.equal(lib.normalizeCouponCode(42), null);
  assert.equal(lib.discountedTicketCents(5000, { percentOff: 10, amountOffCents: null }), 4500);
  assert.equal(lib.discountedTicketCents(2999, { percentOff: 15, amountOffCents: null }), 2549, "percent discount rounded half up in the buyer's favor");
  assert.equal(lib.discountedTicketCents(5000, { percentOff: null, amountOffCents: 1500 }), 3500);
  assert.equal(lib.discountedTicketCents(800, { percentOff: null, amountOffCents: 2000 }), lib.TICKET_COUPON_MIN_CHARGE_CENTS, "never below the minimum charge");
  assert.equal(lib.TICKET_COUPON_MIN_CHARGE_CENTS, 100);
  assert.equal(lib.TICKET_COUPON_MAX_PERCENT, 90);
}

async function checkCoupons() {
  const sec = load("lib/ticketSecurity.ts");
  const service = load("lib/services/tickets.ts");
  const as = (id, role = "BASIC") => async () => ({ id, role });
  const mp = mockMercadoPago();
  const deps = { fetch: mp.fetch, now: clock, env: ENV, statusCheckIntervalMs: 0, reconcileIntervalMs: 0 };
  db = freshDb();
  current = NOW;
  db.mercadoPagoAccount.rows.push({ id: "acc-1", userId: "seller", mpUserId: "555", accessTokenEnc: sec.encryptTicketToken("APP_USR-stored", ENV), refreshTokenEnc: sec.encryptTicketToken("TG-stored", ENV), expiresAt: new Date(NOW.getTime() + 100 * 24 * 60 * MIN), connectedAt: NOW });

  // Creation: owner only, validated, unique per event.
  const make = (input, who = as("seller", "PROMOTER")) => service.createTicketCoupon({ eventId: "event-1", ...input }, who, deps);
  assert.equal((await make({ code: "AMIGO10", percentOff: 10 }, as("buyer"))).success, false, "only the event owner creates coupons");
  assert.equal((await make({ code: "AMIGO10", percentOff: 10 }, async () => null)).success, false);
  assert.equal((await make({ code: "AB", percentOff: 10 })).success, false, "invalid code");
  assert.equal((await make({ code: "TUDO", percentOff: 95 })).success, false, "percent capped at 90");
  assert.equal((await make({ code: "AMBOS", percentOff: 10, amountOffCents: 500 })).success, false, "percent or amount, not both");
  assert.equal((await make({ code: "NADA" })).success, false, "a discount is required");
  const created = await make({ code: "amigo10", percentOff: 10, maxUses: 1 });
  assert.equal(created.success, true, created.message);
  assert.equal(created.data.code, "AMIGO10");
  assert.equal((await make({ code: "AMIGO10", percentOff: 20 })).success, false, "duplicate code on the same event");
  const cincoCreated = await make({ code: "CINCO", amountOffCents: 500, expiresAt: new Date(NOW.getTime() + 60 * MIN).toISOString() });
  assert.equal(cincoCreated.success, true, cincoCreated.message);
  assert.equal((await service.createTicketCoupon({ eventId: "event-open", code: "AMIGO10", percentOff: 10 }, as("seller", "PROMOTER"))).success, true, "same code allowed on another event");

  // Preview: price after discount, without reserving anything.
  const preview = await service.previewTicketCoupon({ eventId: "event-1", code: "amigo10" }, as("buyer"), deps);
  assert.equal(preview.success, true, preview.message);
  assert.deepEqual([preview.data.code, preview.data.discountCents, preview.data.finalCents], ["AMIGO10", 250, 2250]);
  assert.equal((await service.previewTicketCoupon({ eventId: "event-1", code: "NAOEXISTE" }, as("buyer"), deps)).success, false);
  assert.equal(db.ticketOrder.rows.length, 0, "preview reserves nothing");

  // Checkout with a coupon: Pix charged at the discounted price, fee 20% of that, discount recorded on the order.
  const bought = await service.createTicketOrder({ eventId: "event-1", couponCode: "amigo10" }, as("buyer"), deps);
  assert.equal(bought.success, true, bought.message);
  const order = db.ticketOrder.rows.find((row) => row.id === bought.data.id);
  assert.deepEqual([order.unitCents, order.feeCents, order.discountCents, order.couponId], [2250, 225, 250, created.data.id]);
  const pixCall = mp.calls.filter((call) => call.url.endsWith("/v1/payments") && call.method === "POST").at(-1);
  assert.deepEqual([pixCall.body.transaction_amount, pixCall.body.application_fee], [22.5, 2.25]);
  // Usage limit counts paid and still-open orders.
  const limited = await service.createTicketOrder({ eventId: "event-1", couponCode: "AMIGO10" }, as("buyer2"), deps);
  assert.equal(limited.success, false);
  assert.match(limited.message, /cupom/i);
  assert.equal((await service.previewTicketCoupon({ eventId: "event-1", code: "AMIGO10" }, as("buyer2"), deps)).success, false, "preview also respects the limit");
  // Once the Pix expires unpaid, the use is released.
  current = new Date(NOW.getTime() + 31 * MIN);
  assert.equal((await service.previewTicketCoupon({ eventId: "event-1", code: "AMIGO10" }, as("buyer2"), deps)).success, true, "expired Pix frees the coupon");
  // Expired coupon.
  current = new Date(NOW.getTime() + 61 * MIN);
  assert.equal((await service.previewTicketCoupon({ eventId: "event-1", code: "CINCO" }, as("buyer2"), deps)).success, false, "coupon past its expiry");
  current = NOW;
  // Deactivated coupon; only the owner can toggle it.
  const cinco = db.ticketCoupon.rows.find((row) => row.code === "CINCO");
  assert.equal((await service.setTicketCouponActive({ couponId: cinco.id, active: false }, as("buyer"))).success, false);
  assert.equal((await service.setTicketCouponActive({ couponId: cinco.id, active: false }, as("seller", "PROMOTER"))).success, true);
  assert.equal((await service.createTicketOrder({ eventId: "event-1", couponCode: "CINCO" }, as("buyer2"), deps)).success, false, "inactive coupon refused");
  // Without a coupon the full price applies; a client cannot send its own price.
  const full = await service.createTicketOrder({ eventId: "event-1" }, as("buyer2"), deps);
  assert.equal(full.success, true, full.message);
  const fullRow = db.ticketOrder.rows.find((row) => row.id === full.data.id);
  assert.deepEqual([fullRow.unitCents, fullRow.feeCents, fullRow.discountCents ?? 0, fullRow.couponId ?? null], [2500, 250, 0, null]);
  assert.equal((await service.createTicketOrder({ eventId: "event-1", unitCents: 1 }, as("google"), deps)).success, false, "unknown fields rejected");

  // Owner listing with uses.
  const listed = await service.listTicketCoupons("event-1", as("seller", "PROMOTER"), deps);
  assert.equal(listed.success, true, listed.message);
  const amigo = listed.data.find((row) => row.code === "AMIGO10");
  assert.deepEqual([amigo.percentOff, amigo.maxUses, amigo.uses, amigo.active], [10, 1, 1, true]);
  assert.equal(listed.data.find((row) => row.code === "CINCO").active, false);
  assert.equal((await service.listTicketCoupons("event-1", as("buyer"), deps)).success, false, "buyers cannot list coupons");
}

// Promoter events with approval: no Pix until the organizer approves; the payment confirms the approved registration.
async function checkApprovalPurchase() {
  const sec = load("lib/ticketSecurity.ts");
  const service = load("lib/services/tickets.ts");
  const as = (id, role = "BASIC") => async () => ({ id, role });
  const mp = mockMercadoPago();
  const deps = { fetch: mp.fetch, now: clock, env: ENV, statusCheckIntervalMs: 0, reconcileIntervalMs: 0 };
  db = freshDb();
  current = NOW;
  db.mercadoPagoAccount.rows.push({ id: "acc-1", userId: "seller", mpUserId: "555", accessTokenEnc: sec.encryptTicketToken("APP_USR-stored", ENV), refreshTokenEnc: sec.encryptTicketToken("TG-stored", ENV), expiresAt: new Date(NOW.getTime() + 100 * 24 * 60 * MIN), connectedAt: NOW });
  const event = db.events.rows.find((row) => row.id === "event-1");
  event.requiresApproval = true;
  const state = await service.getTicketPurchaseState("event-1", as("buyer"), deps);
  assert.equal(state.data.state, "approval", "no buy button before approval");
  assert.match(state.data.message, /Peça para participar/);
  const blocked = await service.createTicketOrder({ eventId: "event-1" }, as("buyer"), deps);
  assert.equal(blocked.success, false);
  assert.match(blocked.message, /aprovar sua participação/);
  db.eventRegistration.rows.push({ id: "reg-p", eventId: "event-1", userId: "buyer", status: "PENDING", qrVersion: 0, checkedInAt: null });
  assert.match((await service.getTicketPurchaseState("event-1", as("buyer"), deps)).data.message, /aguardando a aprovação/);
  assert.equal((await service.createTicketOrder({ eventId: "event-1" }, as("buyer"), deps)).success, false, "pending request still cannot buy");
  db.eventRegistration.rows[0].status = "APPROVED";
  assert.equal((await service.getTicketPurchaseState("event-1", as("buyer"), deps)).data.state, "available");
  const bought = await service.createTicketOrder({ eventId: "event-1" }, as("buyer"), deps);
  assert.equal(bought.success, true, bought.message);
  const order = db.ticketOrder.rows.find((row) => row.id === bought.data.id);
  mp.payments.get(order.mpPaymentId).status = "approved";
  await service.handleMercadoPagoWebhook(signedWebhook(order.mpPaymentId), deps);
  assert.equal(order.status, "PAID");
  assert.equal(db.eventRegistration.rows[0].status, "CONFIRMED", "payment confirms the approved registration");
  // Imported events ignore the flag.
  event.aiImport = { id: "cand-1" };
  assert.notEqual((await service.getTicketPurchaseState("event-1", as("buyer2"), deps)).data.state, "approval", "imported events never wait for approval");
}

// Full payment journey, end to end through the real services (tickets + attendance + check-in) with a simulated
// Mercado Pago: promoter connects, creates a coupon; buyer asks to join, is approved, pays the Pix with the coupon;
// the signed webhook confirms; the QR is scanned at the door (once); the organizer refunds and the seat is released.
async function checkFullJourney() {
  const service = load("lib/services/tickets.ts");
  const attendance = load("lib/services/attendance.ts");
  const as = (id, role = "BASIC") => async () => ({ id, role });
  const promoter = { id: "seller", role: "PROMOTER" };
  const mp = mockMercadoPago();
  const deps = { fetch: mp.fetch, now: clock, env: ENV, statusCheckIntervalMs: 0, reconcileIntervalMs: 0 };
  const savedEnv = { ...process.env };
  Object.assign(process.env, ENV);
  try {
    db = freshDb();
    db.communityTeamMember = table("team", []);
    current = NOW;
    const event = db.events.rows.find((row) => row.id === "event-1");
    Object.assign(event, { requiresApproval: true, aiImport: null, capacity: null, priceCents: 5000 });

    // 1. Promoter connects Mercado Pago (OAuth); the event can then sell tickets.
    const start = await service.startMercadoPagoConnect(as("seller", "PROMOTER"), deps);
    assert.equal(start.success, true, start.message);
    const authorize = new URL(start.data.url);
    assert.equal(authorize.searchParams.get("client_id"), ENV.MP_CLIENT_ID);
    assert.match(authorize.searchParams.get("redirect_uri"), /\/api\/mercadopago\/callback$/);
    const state = authorize.searchParams.get("state");
    assert.equal(await service.completeMercadoPagoConnect({ code: "good-code", state }, as("seller", "PROMOTER"), deps), "connected");
    assert.deepEqual((await service.getTicketSellerStatus(as("seller", "PROMOTER"), deps)).data, { configured: true, connected: true });
    assert.equal(await service.ticketSettingsProblem(db, "seller", { ticketsEnabled: true, isFree: false, priceCents: 5000 }, ENV), null);

    // 2. Promoter creates a 20% coupon.
    const coupon = await service.createTicketCoupon({ eventId: "event-1", code: "amigos20", percentOff: 20 }, as("seller", "PROMOTER"), deps);
    assert.equal(coupon.success, true, coupon.message);

    // 3. Buyer cannot buy before approval; asks to participate; promoter approves.
    assert.equal((await service.getTicketPurchaseState("event-1", as("buyer"), deps)).data.state, "approval");
    assert.equal((await service.createTicketOrder({ eventId: "event-1" }, as("buyer"), deps)).success, false);
    const request = await attendance.registerForEvent("event-1", "buyer");
    assert.equal(request.status, "PENDING");
    assert.ok(db.notification.rows.some((row) => row.userId === "seller" && /Aprove ou recuse/.test(row.message)), "promoter notified");
    assert.equal((await attendance.reviewRegistration("event-1", promoter, request.id, "APPROVE")).status, "APPROVED");
    assert.equal((await service.getTicketPurchaseState("event-1", as("buyer"), deps)).data.state, "available");

    // 4. Coupon preview and Pix order: R$ 50,00 - 20% = R$ 40,00; EventMap fee 10% = R$ 4,00 via application_fee.
    const preview = await service.previewTicketCoupon({ eventId: "event-1", code: "AMIGOS20" }, as("buyer"), deps);
    assert.equal(preview.success, true, preview.message);
    const order = await service.createTicketOrder({ eventId: "event-1", couponCode: "amigos20" }, as("buyer"), deps);
    assert.equal(order.success, true, order.message);
    const row = db.ticketOrder.rows.find((item) => item.id === order.data.id);
    assert.deepEqual([row.unitCents, row.discountCents, row.feeCents, row.status], [4000, 1000, 400, "PENDING"]);
    const pixCall = mp.calls.find((call) => call.url.endsWith("/v1/payments") && call.method === "POST");
    assert.equal(pixCall.body.transaction_amount, 40);
    assert.equal(pixCall.body.application_fee, 4, "EventMap's 10% goes to the platform account");
    assert.equal(pixCall.body.payment_method_id, "pix");
    assert.match(pixCall.headers.authorization, /^Bearer APP_USR-access-/, "charged with the promoter's own token");
    assert.ok(row.pixCopyPaste && row.pixQrBase64, "buyer receives Pix copy-and-paste and QR");

    // 5. Buyer pays; Mercado Pago sends the signed webhook: order PAID, registration CONFIRMED.
    mp.payments.get(row.mpPaymentId).status = "approved";
    assert.equal(await service.handleMercadoPagoWebhook({ ...signedWebhook(row.mpPaymentId), xSignature: "ts=1,v1=forged" }, deps) >= 400, true, "forged webhook refused");
    assert.equal(row.status, "PENDING");
    assert.equal(await service.handleMercadoPagoWebhook(signedWebhook(row.mpPaymentId), deps), 200);
    assert.equal(row.status, "PAID");
    const registration = db.eventRegistration.rows.find((item) => item.eventId === "event-1" && item.userId === "buyer");
    assert.equal(registration.status, "CONFIRMED");
    const mine = await service.listMyTickets(as("buyer"), deps);
    assert.ok(mine.success && mine.data.some((ticket) => ticket.eventId === "event-1" || ticket.event?.id === "event-1"), "ticket listed for the buyer");
    const overview = await service.getPaymentsOverview(as("seller", "PROMOTER"), deps);
    assert.equal(overview.success, true);
    assert.equal(/APP_USR|TG-/.test(JSON.stringify(overview)), false, "no token reaches the organizer screen");

    // 6. Door: QR issued to the buyer, scanned by the promoter once.
    const qr = await attendance.issueCheckInToken("event-1", "buyer");
    assert.equal((await attendance.checkInAttendee("event-1", promoter, qr.token)).status, "CHECKED_IN");
    const first = db.eventRegistration.rows.find((item) => item.eventId === "event-1" && item.userId === "buyer").checkedInAt;
    const again = await attendance.checkInAttendee("event-1", promoter, qr.token);
    assert.equal(again.alreadyCheckedIn, true, "a second scan of the same QR is flagged, not shown as a new entry");
    assert.equal(again.checkedInAt, first, "keeps the time of the first entry");
    const door = fs.readFileSync("app/(private)/myEvents/[id]/checkin/page.tsx", "utf8");
    assert.match(door, /data\.alreadyCheckedIn/, "door screen checks the reused-QR flag");
    assert.match(door, /QR já utilizado/, "door screen warns about a reused QR");
    await assert.rejects(attendance.checkInAttendee("event-1", { id: "buyer2", role: "BASIC" }, qr.token), (error) => error.status === 403, "only staff scans");

    // 7. Refund by the organizer: full amount back through Mercado Pago, order REFUNDED, seat released.
    assert.equal((await service.refundTicketOrder({ orderId: row.id }, as("buyer"), deps)).success, false, "buyer cannot refund");
    const refund = await service.refundTicketOrder({ orderId: row.id }, as("seller", "PROMOTER"), deps);
    assert.equal(refund.success, true, refund.message);
    assert.equal(row.status, "REFUNDED");
    assert.ok(mp.calls.some((call) => call.url.endsWith(`/v1/payments/${row.mpPaymentId}/refunds`)), "refund sent to Mercado Pago");
    assert.ok(db.notification.rows.some((item) => item.userId === "buyer"), "buyer notified along the way");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
  }
}

// Several tickets in one Pix: fee on the total, seats held, one unique QR per ticket, refund cancels them all.
async function checkMultiTicketOrder() {
  const lib = load("lib/tickets.ts");
  assert.deepEqual(lib.ticketOrderTotals(10000, 3), { grossCents: 30000, feeCents: 3000, netCents: 27000 });
  const service = load("lib/services/tickets.ts");
  const attendance = load("lib/services/attendance.ts");
  const as = (id, role = "BASIC") => async () => ({ id, role });
  const promoter = { id: "seller", role: "PROMOTER" };
  const mp = mockMercadoPago();
  const deps = { fetch: mp.fetch, now: clock, env: ENV, statusCheckIntervalMs: 0, reconcileIntervalMs: 0 };
  const savedEnv = { ...process.env };
  Object.assign(process.env, ENV);
  try {
    db = freshDb();
    current = NOW;
    const event = db.events.rows.find((row) => row.id === "event-1");
    Object.assign(event, { priceCents: 10000, ticketCapacity: 4, requiresApproval: false, aiImport: null, capacity: null });
    const start = await service.startMercadoPagoConnect(as("seller", "PROMOTER"), deps);
    await service.completeMercadoPagoConnect({ code: "good-code", state: new URL(start.data.url).searchParams.get("state") }, as("seller", "PROMOTER"), deps);
    assert.equal((await service.createTicketOrder({ eventId: "event-1", quantity: 7 }, as("buyer"), deps)).success, false, "over the per-order limit");
    assert.equal((await service.createTicketOrder({ eventId: "event-1", quantity: 0 }, as("buyer"), deps)).success, false);
    const tooMany = await service.createTicketOrder({ eventId: "event-1", quantity: 5 }, as("buyer"), deps);
    assert.match(tooMany.message, /Restam só 4/);
    const created = await service.createTicketOrder({ eventId: "event-1", quantity: 3 }, as("buyer"), deps);
    assert.equal(created.success, true, created.message);
    assert.deepEqual([created.data.quantity, created.data.totalCents], [3, 30000]);
    const row = db.ticketOrder.rows.find((item) => item.id === created.data.id);
    assert.deepEqual([row.unitCents, row.quantity, row.feeCents], [10000, 3, 3000]);
    const pix = mp.calls.find((call) => call.url.endsWith("/v1/payments") && call.method === "POST");
    assert.deepEqual([pix.body.transaction_amount, pix.body.application_fee], [300, 30], "R$ 300 charged, R$ 30 for EventMap, R$ 270 for the organizer");
    const other = await service.getTicketPurchaseState("event-1", as("buyer2"), deps);
    assert.deepEqual([other.data.seatsLeft, other.data.maxQuantity], [1, 1], "the open Pix holds all 3 seats");
    assert.equal(db.ticketPass.rows.length, 0, "no ticket before the payment is confirmed");
    mp.payments.get(row.mpPaymentId).status = "approved";
    assert.equal(await service.handleMercadoPagoWebhook(signedWebhook(row.mpPaymentId), deps), 200);
    assert.equal(await service.handleMercadoPagoWebhook(signedWebhook(row.mpPaymentId, "req-repeat"), deps), 200);
    assert.deepEqual(db.ticketPass.rows.map((pass) => pass.position), [2, 3], "tickets 2 and 3 issued once");
    assert.equal(db.notification.rows.filter((item) => item.groupKey === `ticket-paid:${row.id}`).length, 1, "repeated webhook notifies once");
    const mine = await service.listMyTickets(as("buyer"), deps);
    assert.deepEqual(mine.data[0].passes.map((pass) => pass.position), [2, 3]);
    assert.equal(mine.data[0].ownTicketStatus, "VALID", "ticket 1 is ready before the entrance");
    const buyerSeat = db.eventRegistration.rows.find((item) => item.userId === "buyer");
    buyerSeat.status = "CHECKED_IN";
    assert.equal((await service.listMyTickets(as("buyer"), deps)).data[0].ownTicketStatus, "USED", "ticket 1 shows as used after the entrance");
    buyerSeat.status = "CANCELLED";
    assert.equal((await service.listMyTickets(as("buyer"), deps)).data[0].ownTicketStatus, "CANCELLED", "ticket 1 shows as cancelled");
    buyerSeat.status = "CONFIRMED";
    const pass = db.ticketPass.rows[0];
    await assert.rejects(attendance.issueTicketPassToken("event-1", "buyer2", pass.id), (error) => error.status === 404, "only the buyer gets the QR");
    const qr = await attendance.issueTicketPassToken("event-1", "buyer", pass.id);
    await assert.rejects(attendance.checkInAttendee("event-1", { id: "buyer2", role: "BASIC" }, qr.token), (error) => error.status === 403);
    const entered = await attendance.checkInAttendee("event-1", promoter, qr.token);
    assert.deepEqual([entered.status, entered.alreadyCheckedIn, entered.ticketLabel], ["CHECKED_IN", false, "Ingresso 2 de 3"]);
    assert.equal((await attendance.checkInAttendee("event-1", promoter, qr.token)).alreadyCheckedIn, true, "same QR flagged on a second scan");
    assert.equal(db.eventRegistration.rows.find((item) => item.userId === "buyer").status, "CONFIRMED", "ticket 1 is independent");
    assert.deepEqual((await attendance.getCheckInOverview("event-1", promoter)).extraTickets, { total: 2, checkedIn: 1 });
    const overview = await service.getPaymentsOverview(as("seller", "PROMOTER"), deps);
    assert.deepEqual([overview.data.totals.sold, overview.data.totals.grossCents, overview.data.totals.feeCents, overview.data.totals.netCents], [3, 30000, 3000, 27000]);
    const admin = await service.getAdminTicketOverview(async () => "admin", deps);
    assert.deepEqual([admin.data.paid.count, admin.data.paid.grossCents, admin.data.paid.feeCents], [3, 30000, 3000]);
    assert.equal((await service.refundTicketOrder({ orderId: row.id }, as("seller", "PROMOTER"), deps)).success, true);
    assert.deepEqual(db.ticketPass.rows.map((item) => item.status), ["USED", "CANCELLED"], "refund cancels unused tickets, keeps the check-in record");
    const after = await service.getPaymentsOverview(as("seller", "PROMOTER"), deps);
    assert.deepEqual([after.data.totals.sold, after.data.totals.refunded, after.data.totals.refundedCents], [0, 3, 30000]);
    const unused = await attendance.issueTicketPassToken("event-1", "buyer", db.ticketPass.rows[1].id).catch((error) => error);
    assert.equal(unused.status, 409, "a refunded ticket has no QR");
    // Totals cover every order, even when the list of orders on screen is capped.
    for (let index = 0; index < 600; index++) db.ticketOrder.rows.push({ ...row, id: `bulk-${index}`, status: "PAID", unitCents: 1000, quantity: 1, feeCents: 100, mpPaymentId: null });
    const large = await service.getPaymentsOverview(as("seller", "PROMOTER"), deps);
    assert.deepEqual([large.data.totals.sold, large.data.totals.grossCents, large.data.totals.feeCents, large.data.totals.netCents, large.data.totals.refunded], [600, 600000, 60000, 540000, 3], "dashboard totals are not limited to the listed orders");
    // Sales export: only the organizer's own paid and refunded orders, with safe cells and pt-BR amounts.
    const exported = await service.getSalesExport(as("seller", "PROMOTER"), deps);
    assert.equal(exported.data.length, 601, "every paid and refunded order, beyond the on-screen cap");
    assert.equal((await service.getSalesExport(as("buyer2", "PROMOTER"), deps)).data.length, 0, "never another organizer's sales");
    assert.equal((await service.getSalesExport(async () => null, deps)).success, false);
    const csvLib = load("lib/organizerOps/salesCsv.ts");
    const csvText = csvLib.salesCsv([{ eventName: "=HYPERLINK(1)", code: "ABC", buyerName: "Ana; Silva", status: "PAID", unitCents: 1050, quantity: 3, feeCents: 315, paidAt: "2099-01-02T15:00:00.000Z", refundedAt: null }]);
    const csvRow = csvText.split(String.fromCharCode(13, 10))[1];
    assert.ok(csvRow.startsWith(`'=HYPERLINK(1);ABC;"Ana; Silva";3;"10,50";"31,50";"3,15";"28,35";Pago;02/01/2099 12:00;`), csvRow);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
  }
}

(async () => {
  checkPure(load("lib/tickets.ts"));
  checkCouponRules(load("lib/tickets.ts"));
  checkSecurity(load("lib/ticketSecurity.ts"));
  const mpLib = load("lib/mercadopago.ts");
  checkClient(mpLib);
  await checkClientCalls(mpLib);
  await checkService();
  await checkHardening();
  await checkFinancialRecords();
  await checkCoupons();
  await checkApprovalPurchase();
  await checkFullJourney();
  await checkMultiTicketOrder();
  checkWiring();
  console.log("PASS tickets: fee, bounds, capacity race, idempotent orders, rate limit, webhook signature and validation, expiry, refunds, OAuth state, token encryption, routes.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
