// Mutates only one generated test account. Requires explicit human authorization.
const assert = require("node:assert/strict");
const { randomUUID, randomBytes, createHash } = require("node:crypto");
const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");
const { io } = require("socket.io-client");
require("@next/env").loadEnvConfig(process.cwd());
if (!process.argv.includes("--allow-temporary-account")) {
  console.error("Explicit --allow-temporary-account authorization is required."); process.exit(1);
}
const origin = process.env.LIVE_TEST_URL || "http://localhost:3000";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) throw Error("Only a local development server is allowed.");
const prisma = new PrismaClient();
const userId = randomUUID(), email = `session-test-${userId}@example.invalid`;
const password = randomBytes(18).toString("base64url"), nextPassword = randomBytes(18).toString("base64url"), token = randomBytes(32).toString("hex");
const sockets = [];
function jar() { return new Map(); }
function header(cookies) { return Array.from(cookies, ([name, value]) => `${name}=${value}`).join("; "); }
async function request(path, cookies, options = {}) {
  const response = await fetch(origin + path, { redirect: "manual", signal: AbortSignal.timeout(45000), ...options, headers: { ...(options.headers || {}), Cookie: header(cookies), Origin: origin } });
  for (const line of response.headers.getSetCookie()) {
    const pair = line.split(";", 1)[0], index = pair.indexOf("=");
    cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
  return response;
}
async function login(cookies, suppliedPassword) {
  const csrf = await (await request("/api/auth/csrf", cookies)).json();
  await request("/api/auth/callback/credentials", cookies, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password: suppliedPassword, callbackUrl: origin, json: "true" }) });
  const session = await (await request("/api/auth/session", cookies)).json();
  assert.equal(session.user?.id, userId, "Temporary credentials must authenticate");
  assert.equal(session.credentialStamp, undefined); assert.equal(session.user.password, undefined);
}
async function connect(cookies) {
  const socket = io(origin, { transports: ["websocket"], reconnection: false, extraHeaders: { Cookie: header(cookies) }, timeout: 10000 }); sockets.push(socket);
  await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", () => reject(Error("Socket authentication failed"))); });
  const subscribe = await new Promise(resolve => socket.timeout(10000).emit("community-subscribe", { user: true }, (error, result) => resolve(error ? null : result)));
  assert.equal(subscribe?.ok, true, "Temporary authenticated socket must have its private room");
  return socket;
}
async function main() {
  await prisma.user.create({ data: { id: userId, email, name: "Temporary session test", emailVerified: true, password: await bcrypt.hash(password, 10), role: "BASIC" } });
  const first = jar(), second = jar(); await login(first, password); await login(second, password);
  const a = await connect(first), b = await connect(second);
  const revoked = [a, b].map(socket => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("Session revocation timed out")), 15000);
    socket.once("session-expired", () => { clearTimeout(timer); resolve(); });
  }));
  await prisma.verificationToken.create({ data: { identifier: `account-recovery:${userId}`, token: createHash("sha256").update(token).digest("hex"), expires: new Date(Date.now() + 300000) } });
  const reset = await request("/api/account/reset-password", jar(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: nextPassword }) });
  assert.equal(reset.status, 200, "Real reset handler should accept generated recovery token");
  await Promise.all(revoked);
  for (const cookies of [first, second]) {
    const session = await (await request("/api/auth/session", cookies)).json();
    assert.equal(session.error, "SessionRevoked"); assert.equal(session.user?.id, "");
    const upload = await request("/api/upload", cookies, { method: "POST", body: new FormData() });
    assert.equal(upload.status, 401, "Old cookie must lose protected API access");
  }
  const reuse = await request("/api/account/reset-password", jar(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: nextPassword }) }); assert.equal(reuse.status, 400);
  const fresh = jar(); await login(fresh, nextPassword); const current = await connect(fresh); assert.equal(current.connected, true);
  const oldPassword = jar();
  await assert.rejects(login(oldPassword, password), "Previous password must be rejected");
  console.log("PASS: real temporary account, two credential sessions and authenticated sockets, reset revocation, old API denial, token reuse rejection and fresh login");
}
main().catch(() => { console.error("FAIL: live password session verification."); process.exitCode = 1; }).finally(async () => {
  sockets.forEach(socket => socket.disconnect());
  await prisma.verificationToken.deleteMany({ where: { identifier: `account-recovery:${userId}` } });
  await prisma.communitySignal.deleteMany({ where: { room: `user:${userId}` } });
  await prisma.user.deleteMany({ where: { id: userId, email } });
  await prisma.$disconnect();
});
