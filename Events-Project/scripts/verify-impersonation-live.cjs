// Explicit opt-in: briefly locks an existing DEMO account, never changes its credentials.
const assert = require("node:assert/strict");
const { loadEnvConfig } = require("@next/env");
const { PrismaClient } = require("@prisma/client");
const { encode, decode } = require("next-auth/jwt");
const { io } = require("socket.io-client");
const { credentialStamp } = require("./load-session-credential.cjs");
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
const origin = process.env.IMPERSONATION_TEST_URL || "http://localhost:3000";
const name = origin.startsWith("https:") ? "__Secure-next-auth.session-token" : "next-auth.session-token";
const sockets = [];
const records = new Set();
let administrator;
let stage = "fixtures";

async function fixture(user) {
  // Server-side signed fixture: tests HTTP authorization independently from the login form.
  return `${name}=${await encode({ secret: process.env.NEXTAUTH_SECRET, maxAge: 1200, token: {
    id: user.id, sessionVersion: user.sessionVersion, provider: "credentials", role: user.role, credentialStamp: credentialStamp(user.password),
  } })}`;
}
function cookies(response, previous) {
  const jar = new Map(previous.split("; ").filter(Boolean).map(item => {
    const separator = item.indexOf("="); return [item.slice(0, separator), item.slice(separator + 1)];
  }));
  for (const header of response.headers.getSetCookie()) {
    const first = header.split(";", 1)[0], separator = first.indexOf("=");
    const key = first.slice(0, separator), value = first.slice(separator + 1);
    if (!value || /max-age=0/i.test(header)) jar.delete(key); else jar.set(key, value);
  }
  return [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
}
async function request(path, cookie, body, requestOrigin = origin) {
  return fetch(origin + path, { method: body === undefined ? "GET" : "POST", headers: {
    Cookie: cookie, Origin: requestOrigin, "Content-Type": "application/json",
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(45000), redirect: "manual" });
}
async function connect(cookie) {
  const socket = io(origin, { transports: ["websocket"], extraHeaders: { Cookie: cookie, Origin: origin }, reconnection: false });
  sockets.push(socket);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Socket connection timed out")), 15000);
    socket.once("connect", () => { clearTimeout(timer); resolve(); });
    socket.once("connect_error", () => { clearTimeout(timer); reject(new Error("Socket authorization failed")); });
  });
  return socket;
}
function disconnected(socket, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Socket revocation timed out")), 15000);
    socket.once(event, () => { clearTimeout(timer); resolve(); });
  });
}
async function start(cookie, target) {
  const response = await request("/api/admin/impersonation/start", cookie, { userId: target.id, reason: "Teste de suporte autorizado" });
  assert.equal(response.status, 200, "start must succeed");
  assert.equal((await response.json()).ok, true);
  const updated = cookies(response, cookie);
  const encrypted = new Map(updated.split("; ").map(item => item.split("="))).get(name);
  const token = await decode({ token: encrypted, secret: process.env.NEXTAUTH_SECRET });
  assert.ok(token.impersonationId);
  records.add(token.impersonationId);
  return { cookie: updated, id: token.impersonationId };
}
async function main() {
  assert.ok(process.argv.includes("--allow-demo-account-lock"), "Requires --allow-demo-account-lock");
  const [admin, target, other] = await Promise.all([
    prisma.user.findFirst({ where: { role: "ADMIN" } }),
    prisma.user.findUnique({ where: { email: "alice.demo@eventmap.example" } }),
    prisma.user.findUnique({ where: { email: "bruno.demo@eventmap.example" } }),
  ]);
  assert.ok(admin && target && other && target.role !== "ADMIN" && target.name.includes("DEMO"));
  administrator = admin.id;
  assert.equal(await prisma.impersonationSession.count({ where: { OR: [{ adminId: admin.id }, { userId: target.id, reason: "Teste de suporte autorizado" }], endedAt: null, expiresAt: { gt: new Date() } } }), 0, "Do not interrupt an existing impersonation");
  const [adminCookie, targetCookie, otherCookie] = await Promise.all([fixture(admin), fixture(target), fixture(other)]);
  stage = "authorization";
  assert.equal((await request("/api/admin/impersonation/start", "", { userId: target.id, reason: "Teste de suporte autorizado" })).status, 401);
  assert.equal((await request("/api/admin/impersonation/start", targetCookie, { userId: other.id, reason: "Teste de suporte autorizado" })).status, 403);
  assert.equal((await request("/api/admin/impersonation/start", adminCookie, { userId: admin.id, reason: "Teste de suporte autorizado" })).status, 403);
  assert.equal((await request("/api/admin/impersonation/start", adminCookie, { userId: target.id, reason: "Teste de suporte autorizado" }, "https://untrusted.example")).status, 403);
  const targetSocket = await connect(targetCookie);
  stage = "start and target revocation";
  const revoked = disconnected(targetSocket, "account-impersonated");
  // Attach a rejection handler immediately while the start request is in flight.
  void revoked.catch(() => {});
  const active = await start(adminCookie, target);
  await revoked;
  if (process.argv.includes("--hold-visual")) {
    console.log("VISUAL CHECK: DEMO target suspended for up to 60 seconds; send Enter to continue.");
    await new Promise(resolve => {
      const timer = setTimeout(resolve, 60000);
      process.stdin.once("data", () => { clearTimeout(timer); resolve(); });
    });
  }
  stage = "effective HTTP identity";
  const previewSession = await (await request("/api/auth/session", active.cookie)).json();
  assert.equal(previewSession.user.id, target.id); assert.equal(previewSession.user.role, target.role);
  assert.equal(previewSession.impersonation.userName, target.name);
  assert.equal(previewSession.credentialStamp, undefined);
  assert.equal((await request("/api/admin/impersonation/start", active.cookie, { userId: other.id, reason: "Teste de suporte autorizado" })).status, 403);
  assert.equal((await (await request("/api/admin/impersonation/status", active.cookie)).json()).impersonation.userName, target.name, "Rejected nested start must preserve the active preview");
  assert.equal((await request("/api/dataAllUser", active.cookie)).status, 403);
  const blocked = await (await request("/api/auth/session", targetCookie)).json();
  assert.equal(blocked.error, "AccountImpersonated"); assert.equal(blocked.user.id, "");
  assert.equal((await (await request("/api/admin/impersonation/status", targetCookie)).json()).blocked, true);
  assert.equal((await (await request("/api/auth/session", otherCookie)).json()).user.id, other.id);
  const previewSocket = await connect(active.cookie);
  stage = "effective socket identity";
  await new Promise((resolve, reject) => previewSocket.timeout(5000).emit("community-subscribe", { user: true }, (error, ack) => {
    if (error || !ack?.ok) reject(new Error("Effective identity subscription failed")); else resolve();
  }));
  const previewRevoked = disconnected(previewSocket, "session-expired");
  void previewRevoked.catch(() => {});
  stage = "restore administrator";
  const ended = await request("/api/admin/impersonation/end", active.cookie, {});
  assert.equal(ended.status, 200);
  const restoredCookie = cookies(ended, active.cookie);
  assert.equal((await (await request("/api/auth/session", restoredCookie)).json()).user.id, admin.id);
  assert.equal((await (await request("/api/auth/session", targetCookie)).json()).user.id, target.id);
  await previewRevoked;
  const audit = await prisma.impersonationSession.findUnique({ where: { id: active.id } });
  stage = "audit";
  assert.equal(audit.adminId, admin.id); assert.equal(audit.userId, target.id);
  assert.ok(audit.startedAt && audit.endedAt && audit.ip);
  const expiring = await start(restoredCookie, target);
  stage = "expiration";
  // Only modify the newly created test record to exercise the expiry path immediately.
  await prisma.impersonationSession.update({ where: { id: expiring.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  // The background worker must close the audit even without another administrator request.
  await new Promise(resolve => setTimeout(resolve, 6000));
  assert.ok((await prisma.impersonationSession.findUnique({ where: { id: expiring.id } })).endedAt);
  const expired = await request("/api/admin/impersonation/status", expiring.cookie);
  assert.equal((await expired.json()).restoreRequired, true);
  assert.equal((await (await request("/api/auth/session", cookies(expired, expiring.cookie))).json()).user.id, admin.id);
  assert.equal((await (await request("/api/admin/impersonation/status", targetCookie)).json()).blocked, false);
  assert.ok((await prisma.impersonationSession.findUnique({ where: { id: expiring.id } })).endedAt);
  stage = "logout releases target";
  const beforeLogout = await start(cookies(expired, expiring.cookie), target);
  const csrfResponse = await request("/api/auth/csrf", beforeLogout.cookie);
  const { csrfToken } = await csrfResponse.json();
  const signout = await fetch(origin + "/api/auth/signout", {
    method: "POST", headers: { Cookie: cookies(csrfResponse, beforeLogout.cookie), Origin: origin, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, callbackUrl: origin + "/", json: "true" }), signal: AbortSignal.timeout(30000), redirect: "manual",
  });
  assert.equal(signout.status, 200);
  assert.ok((await prisma.impersonationSession.findUnique({ where: { id: beforeLogout.id } })).endedAt);
  assert.equal((await (await request("/api/auth/session", targetCookie)).json()).user.id, target.id);
  console.log("PASS live HTTP/Socket.IO: server authorization, origin, effective account, suspended target, isolated other account, socket revocation, restoration, expiration and audit IP. Signed server fixtures; manual login is not covered.");
}
main().catch(error => { console.error(`FAIL: live impersonation validation at ${stage}; ${error instanceof assert.AssertionError ? error.message : "operation failed"}. No credentials were logged.`); process.exitCode = 1; }).finally(async () => {
  for (const socket of sockets) socket.disconnect();
  if (records.size) await prisma.impersonationSession.updateMany({ where: { id: { in: [...records] }, adminId: administrator, endedAt: null }, data: { endedAt: new Date() } });
  await prisma.$disconnect();
});
