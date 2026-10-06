const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

function load(file, dependencies) {
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)(name => Object.hasOwn(dependencies, name) ? dependencies[name] : name.startsWith("@/") ? load(`${name.slice(2)}.ts`, dependencies) : require(name), module, module.exports);
  return module.exports;
}

(async () => {
  let current = { id: "member", role: "BASIC" }, count = 1, failSignal = false;
  const committed = [];
  const prisma = {
    user: { findUnique: async () => current },
    $transaction: async callback => {
      const pending = [];
      const result = await callback({
        user: { deleteMany: async args => { assert.equal(args.where.role.not, "ADMIN"); pending.push("delete"); return { count }; } },
        communitySignal: { create: async args => { if (failSignal) throw Error("unavailable"); pending.push(args.data.room); } },
      });
      committed.push(...pending);
      return result;
    },
  };
  const { deleteUser } = load("lib/services/userAdministration.ts", { "@/lib/prisma": { __esModule: true, default: prisma }, "./userSuspension": require("./load-moderation-service.cjs")("lib/services/userSuspension.ts") });
  assert.equal((await deleteUser({ id: "member" }, async () => null)).status, "error");
  assert.equal((await deleteUser({ id: "admin" }, async () => "admin")).status, "error");
  current.role = "ADMIN";
  assert.equal((await deleteUser({ id: "member" }, async () => "admin")).status, "error");
  assert.deepEqual(committed, []);
  current.role = "BASIC";
  assert.equal((await deleteUser({ id: "member" }, async () => "admin")).status, "success");
  assert.deepEqual(committed, ["delete", "user:member"]);
  committed.length = 0; count = 0;
  assert.equal((await deleteUser({ id: "member" }, async () => "admin")).status, "error");
  assert.deepEqual(committed, ["delete"]);
  committed.length = 0; count = 1; failSignal = true;
  await assert.rejects(deleteUser({ id: "member" }, async () => "admin"));
  assert.deepEqual(committed, []);

  let unavailable = false;
  process.env.NEXTAUTH_SECRET = "test-only-session-signing-key";
  current.password = "password-hash";
  const credentials = require("./load-session-credential.cjs");
  const { authOptions } = load("lib/auth/options.ts", {
    "@/lib/auth/accountAccess": require("./load-account-access.cjs"),
    "@/lib/auth/impersonation": require("./load-impersonation.cjs"),
    "@/lib/auth/googleProfileImage": require("./load-google-profile-image.cjs"),
    "@/lib/auth/sessionCredential": credentials,
    "@/lib/prisma": { __esModule: true, default: { impersonationSession: { findFirst: async () => null }, user: { findUnique: async args => {
      assert.equal(args.select.password, true);
      if (unavailable) throw Error("database unavailable");
      return current;
    } } } },
    "@next-auth/prisma-adapter": { PrismaAdapter: () => ({}) },
  });
  const jwt = authOptions.callbacks.jwt, session = authOptions.callbacks.session;
  const claims = { id: "member", email: "private@example.invalid", role: "ADMIN", provider: "credentials", credentialStamp: credentials.credentialStamp(current.password) };
  let token = await jwt({ token: { ...claims } });
  assert.equal(token.role, "BASIC");
  current = null;
  token = await jwt({ token: { ...claims } });
  assert.deepEqual(token, { error: "AccountRemoved" });
  const revoked = await session({ session: {}, token });
  assert.equal(revoked.error, "AccountRemoved");
  assert.equal(revoked.user.id, "");
  assert.equal(revoked.user.email, null);
  assert.equal(revoked.user.role, null);
  unavailable = true;
  token = await jwt({ token: { ...claims } });
  assert.deepEqual(token, { error: "SessionUnavailable" });
  assert.equal((await session({ session: {}, token })).user.id, "");
  console.log("PASS: account removal authorization, atomic revocation signal, live JWT identity, removed-user session cleanup and fail-closed outages");
})().catch(error => { console.error(error); process.exitCode = 1; });
