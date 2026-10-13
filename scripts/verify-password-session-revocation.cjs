const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
function load(file, dependencies) {
  const mod = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", output)(id => Object.hasOwn(dependencies, id) ? dependencies[id] : require(id), mod, mod.exports);
  return mod.exports;
}
(async () => {
  process.env.NEXTAUTH_SECRET = "test-only-session-key";
  const credentials = require("./load-session-credential.cjs");
  let user = { id: "u1", role: "BASIC", password: "old-bcrypt-hash", emailVerified: true };
  const prisma = { impersonationSession: { findFirst: async () => null }, user: { findUnique: async () => user } };
  const options = load("lib/auth/options.ts", {
    "@/lib/auth/accountAccess": require("./load-account-access.cjs"),
    "@/lib/auth/impersonation": require("./load-impersonation.cjs"),
    "@/lib/prisma": { __esModule: true, default: prisma },
    "@/lib/auth/googleProfileImage": require("./load-google-profile-image.cjs"),
    "@/lib/auth/sessionCredential": credentials,
    "@next-auth/prisma-adapter": { PrismaAdapter: () => ({}) },
  }).authOptions;
  const first = await options.callbacks.jwt({ token: {}, user, account: { provider: "credentials" } });
  assert.equal(first.credentialStamp, credentials.credentialStamp(user.password));
  const publicSession = await options.callbacks.session({ session: {}, token: first });
  assert.equal(publicSession.user.id, "u1"); assert.equal(publicSession.credentialStamp, undefined); assert.equal(publicSession.user.password, undefined);
  assert.equal((await options.callbacks.jwt({ token: { ...first } })).id, "u1");
  assert.deepEqual(await options.callbacks.jwt({ token: { id: "u1", provider: "credentials" } }), { error: "SessionRevoked" });
  let cookieToken = { ...first };
  const admin = load("lib/adminAuth.ts", {
    "@/lib/auth/accountAccess": require("./load-account-access.cjs"),
    "@/lib/auth/impersonation": require("./load-impersonation.cjs"),
    "next/headers": { headers: () => new Headers() }, "next/server": { NextRequest: class {} },
    "next-auth/jwt": { getToken: async () => cookieToken },
    "@/lib/prisma": { __esModule: true, default: prisma },
    "@/lib/authPolicy": { isDevelopmentIdentityDisabled: () => false },
    "@/lib/auth/sessionCredential": credentials,
  });
  assert.deepEqual(await admin.getAuthenticatedUser({}), { id: "u1", role: "BASIC" });
  user.password = "new-bcrypt-hash";
  assert.equal(await admin.getAuthenticatedUser({}), null);
  const revoked = await options.callbacks.jwt({ token: { ...first } });
  assert.deepEqual(revoked, { error: "SessionRevoked" });
  assert.equal((await options.callbacks.session({ session: {}, token: revoked })).user.id, "");
  cookieToken = { id: "u1", provider: "google" };
  assert.equal((await admin.getAuthenticatedUser({})).id, "u1");
  assert.equal((await options.callbacks.jwt({ token: cookieToken })).id, "u1");
  const fresh = await options.callbacks.jwt({ token: {}, user, account: { provider: "credentials" } });
  assert.notEqual(fresh.credentialStamp, first.credentialStamp);

  const socketIdentity = load("server/socketIdentity.mts", { "../lib/auth/accountAccess.js": require("./load-account-access.cjs"),
    "../lib/auth/sessionCredential.js": credentials, "../lib/auth/impersonation.js": require("./load-session-impersonation.cjs") });
  const server = load("server/accountRevocation.mts", { "../lib/auth/accountAccess.js": require("./load-account-access.cjs"),
    "../lib/auth/sessionCredential.js": credentials, "../lib/auth/impersonation.js": require("./load-session-impersonation.cjs"), "./socketIdentity.mjs": socketIdentity });
  const io = { sockets: { sockets: new Map() } };
  const makeSocket = (id, provider, stamp) => {
    const socket = { connected: true, data: { userId: "u1", provider, credentialStamp: stamp, effectiveRole: "BASIC" }, events: [], emit(event) { this.events.push(event); }, disconnect(force) { assert.equal(force, true); this.connected = false; } };
    io.sockets.sockets.set(id, socket); return socket;
  };
  const old = makeSocket("old", "credentials", first.credentialStamp), current = makeSocket("new", "credentials", fresh.credentialStamp), oauth = makeSocket("oauth", "google"), legacy = makeSocket("legacy", "credentials");
  await server.revokeRemovedAccount(prisma, io, "u1");
  assert.deepEqual(old.events, ["session-expired"]); assert.deepEqual(legacy.events, ["session-expired"]);
  assert.equal(old.connected, false); assert.equal(current.connected, true); assert.equal(oauth.connected, true);
  user.password = "third-hash";
  prisma.user.findMany = async () => [user];
  await server.createAccountRevocationPoller(prisma, io).poll();
  assert.equal(current.connected, false); assert.equal(oauth.connected, true);
  assert.deepEqual(current.events, ["session-expired"]);
  assert.match(fs.readFileSync("server.mts", "utf8"), /resolveSocketIdentity\(prisma, token\)/);
  const packetGuard = load("server/socketSession.mts", { "./socketIdentity.mjs": socketIdentity });
  let middleware;
  const blocked = makeSocket("packet", "credentials", first.credentialStamp);
  blocked.use = handler => { middleware = handler; };
  packetGuard.enforceSocketCredentials(prisma, blocked);
  let packetError;
  await middleware(["community-subscribe", { user: true }], error => { packetError = error; });
  assert.ok(packetError); assert.equal(blocked.connected, false);
  assert.deepEqual(blocked.events, ["session-expired"]);
  console.log("PASS: password changes revoke existing/legacy credential JWTs, protected APIs and sockets; new login and OAuth preserved; stamps remain private");
})().catch(error => { console.error(error); process.exitCode = 1; });
