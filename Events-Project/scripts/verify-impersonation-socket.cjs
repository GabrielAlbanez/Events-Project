const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const credentials = require("./load-session-credential.cjs");
const impersonation = require("./load-session-impersonation.cjs");
function load(name) {
  const mod = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(`server/${name}.mts`, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function("require", "module", "exports", output)(id => id === "../lib/auth/accountAccess.js" ? require("./load-account-access.cjs") : id === "../lib/auth/sessionCredential.js" ? credentials : id === "../lib/auth/impersonation.js" ? impersonation : id.startsWith("./") ? load(id.slice(2).replace(/\.mjs$/, "")) : require(id), mod, mod.exports);
  return mod.exports;
}
(async () => {
  process.env.NEXTAUTH_SECRET = "test-only-impersonation-session-key";
  const admin = { id: "admin", role: "ADMIN", password: "admin-password-hash" }, target = { id: "target", role: "BASIC", password: "target-password-hash" }, other = { id: "other", role: "BASIC", password: "other-password-hash" };
  const users = new Map([admin, target, other].map(user => [user.id, user]));
  let record = { id: "session", adminId: admin.id, userId: target.id, endedAt: null, expiresAt: new Date(Date.now() + 900000), user: target };
  const db = { user: { findUnique: async ({ where }) => users.get(where.id) ?? null, findMany: async ({ where }) => where.id.in.map(id => users.get(id)).filter(Boolean) }, impersonationSession: {
    findUnique: async ({ where }) => record && where.id === record.id ? record : null,
    findFirst: async ({ where }) => record && !record.endedAt && record.expiresAt > new Date() && where.OR?.some(condition => condition.userId === record.userId || condition.adminId === record.adminId) ? { id: record.id } : null,
    updateMany: async () => { record.endedAt = new Date(); return { count: 1 }; },
  } };
  const identity = load("socketIdentity");
  const token = user => ({ id: user.id, provider: "credentials", credentialStamp: credentials.credentialStamp(user.password) });
  const asTarget = { ...token(admin), impersonationId: record.id, effectiveUserId: target.id, effectiveRole: target.role };
  assert.deepEqual(await identity.resolveSocketIdentity(db, asTarget), { id: "target", role: "BASIC" });
  assert.equal(await identity.resolveSocketIdentity(db, token(target)), "ACCOUNT_IMPERSONATED");
  assert.equal(await identity.resolveSocketIdentity(db, token(admin)), "ACCOUNT_IMPERSONATED", "Other admin browser cannot retain admin rooms while impersonating");
  assert.deepEqual(await identity.resolveSocketIdentity(db, token(other)), { id: "other", role: "BASIC" });
  assert.notDeepEqual(await identity.resolveSocketIdentity(db, { ...token(other), impersonationId: record.id, effectiveUserId: target.id, effectiveRole: "ADMIN" }), { id: "target", role: "ADMIN" });
  const io = { sockets: { sockets: new Map(), adapter: { rooms: new Map() } } };
  function socket(id, userId, authUserId, originalToken) {
    const value = { connected: true, data: { userId, authUserId, provider: originalToken.provider, credentialStamp: originalToken.credentialStamp, impersonationId: originalToken.impersonationId, effectiveRole: users.get(userId).role }, events: [], emit(name) { this.events.push(name); }, disconnect() { this.connected = false; }, use(handler) { this.middleware = handler; } };
    io.sockets.sockets.set(id, value); return value;
  }
  const affected = socket("target", "target", "target", token(target)), oldAdmin = socket("admin", "admin", "admin", token(admin)), impersonating = socket("effective", "target", "admin", asTarget), untouched = socket("other", "other", "other", token(other));
  const session = load("socketSession"); session.enforceSocketCredentials(db, affected);
  let failure; await affected.middleware(["community-subscribe"], error => { failure = error; });
  assert.ok(failure); assert.deepEqual(affected.events, ["account-impersonated"]);
  await load("accountRevocation").createAccountRevocationPoller(db, io).poll();
  assert.equal(oldAdmin.connected, false); assert.equal(impersonating.connected, true); assert.equal(untouched.connected, true);
  target.password = "target-changed-password";
  assert.equal(await identity.validateSocketIdentity(db, impersonating), true, "Administrator uses original credentials, never target password");
  admin.password = "admin-changed-password";
  assert.equal(await identity.validateSocketIdentity(db, impersonating), false); assert.deepEqual(impersonating.events, ["session-expired"]);
  assert.ok(record.endedAt, "Revoking the original administrator credential must release the target");
  admin.password = "admin-password-hash"; record.expiresAt = new Date(0);
  assert.deepEqual(await identity.resolveSocketIdentity(db, asTarget), { id: "admin", role: "ADMIN" });
  assert.equal(record.endedAt instanceof Date, true);
  assert.deepEqual(await identity.resolveSocketIdentity(db, token(target)), { id: "target", role: "BASIC" });
  const stale = socket("stale", "target", "admin", asTarget); assert.equal(await identity.validateSocketIdentity(db, stale), false);
  assert.deepEqual(stale.events, ["session-expired"], "Expired target socket never acquires admin privileges");
  record.endedAt = null; record.expiresAt = new Date(Date.now() + 900000);
  const outboundTarget = socket("out-target", "target", "target", token(target));
  const outboundAdmin = socket("out-admin", "admin", "admin", token(admin));
  const outboundEffective = socket("out-effective", "target", "admin", { ...token(admin), impersonationId: record.id });
  io.sockets.adapter.rooms.set("user:target", new Set(["out-target", "out-effective"]));
  io.sockets.adapter.rooms.set("admins", new Set(["out-admin"]));
  await identity.emitAuthorizedRoom(db, io, "user:target", "private-notification");
  await identity.emitAuthorizedRoom(db, io, "admins", "admin-only-payload");
  assert.deepEqual(outboundTarget.events, ["account-impersonated"]);
  assert.deepEqual(outboundAdmin.events, ["account-impersonated"]);
  assert.deepEqual(outboundEffective.events, ["private-notification"]);
  console.log("PASS: effective socket identity, target/admin-old-session suspension, packet denial, idle revocation, credential isolation, expiry and restoration");
})().catch(error => { console.error(error); process.exitCode = 1; });
