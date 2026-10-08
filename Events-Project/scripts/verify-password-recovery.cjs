const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
function load(file, dependencies) {
  const module = { exports: {} };
  new Function("require", "module", "exports", ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText)(name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name), module, module.exports);
  return module.exports;
}
(async () => {
  process.env.EMAIL_USER = "test"; process.env.EMAIL_PASS = "test";
  process.env.NEXTAUTH_URL = "http://localhost:3000";
  let user = { id: "u1", email: "member@example.invalid", password: "existing", emailVerified: false, name: "Member" };
  let stored = null, rate = 0, claimed = 1;
  const deliveries = [], updates = [];
  class CommunityError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const tx = {
    communitySignal: { create: async args => { assert.equal(args.data.room, "user:u1"); } },
    $executeRaw: async () => 1,
    user: { findFirst: async () => user, updateMany: async args => { updates.push(args); return { count: user ? 1 : 0 }; } },
    verificationToken: {
      count: async () => rate,
      create: async args => { if (args.data.identifier.startsWith("account-recovery:")) stored = args.data; },
      findUnique: async args => stored?.token === args.where.token ? stored : null,
      deleteMany: async args => { if (args.where.token) { const result = { count: claimed }; if (claimed) stored = null; return result; } return { count: 0 }; },
    },
    verificationTokenEmail: { deleteMany: async () => ({}), create: async args => { assert.equal(args.data.email, user.email); } },
  };
  const schemas = load("schemas/passwordRecovery.ts", {});
  const service = load("lib/services/passwordRecovery.ts", {
    "@/lib/publicUrl": require("./load-public-url.cjs"),
    "@/lib/prisma": { __esModule: true, default: {} },
    "@/lib/community/common": { transact: async work => work(tx), CommunityError },
    "@/lib/mail/recovery": { sendRecoveryEmail: async (email, link) => deliveries.push({ email, link }) },
    "@/lib/mail/verification": { sendVerificationEmail: async (email, link) => deliveries.push({ email, link }) },
    "@/schemas/passwordRecovery": schemas,
    bcrypt: { __esModule: true, default: { hash: async () => "hashed-new-password" } },
  });
  const known = await service.requestAccountLink(user.email, "recovery", "global");
  const token = new URL(deliveries[0].link).searchParams.get("token");
  assert.equal(token.length, 64); assert.notEqual(stored.token, token);
  await service.resetAccountPassword({ token, password: "new-password" });
  assert.deepEqual(updates[0].data, { password: "hashed-new-password" });
  await assert.rejects(service.resetAccountPassword({ token, password: "new-password" }));
  await service.requestAccountLink(user.email, "recovery", "global");
  const expiredToken = new URL(deliveries.at(-1).link).searchParams.get("token");
  stored.expires = new Date(0);
  await assert.rejects(service.resetAccountPassword({ token: expiredToken, password: "new-password" }));
  const before = deliveries.length; rate = 3;
  assert.deepEqual(await service.requestAccountLink(user.email, "recovery", "global"), known);
  assert.equal(deliveries.length, before); rate = 0;
  user = null;
  assert.deepEqual(await service.requestAccountLink("missing@example.invalid", "recovery", "global"), known);
  assert.equal(deliveries.length, before);
  user = { id: "oauth", email: "oauth@example.invalid", password: null };
  await service.requestAccountLink(user.email, "recovery", "global"); assert.equal(deliveries.length, before);
  await assert.rejects(service.resetAccountPassword({ token: "verification-token", password: "new-password" }));
  user = { id: "u1", email: "member@example.invalid", password: "existing", emailVerified: false };
  await service.requestAccountLink(user.email, "verification", "global");
  assert.ok(deliveries.at(-1).link.includes("/verifyEmail?token="));
  user.emailVerified = true;
  const verifiedCount = deliveries.length;
  await service.requestAccountLink(user.email, "verification", "global"); assert.equal(deliveries.length, verifiedCount);
  await service.requestAccountLink(user.email, "recovery", "global");
  const removedToken = new URL(deliveries.at(-1).link).searchParams.get("token");
  user = null;
  await assert.rejects(service.resetAccountPassword({ token: removedToken, password: "new-password" }));
  console.log("PASS: recovery hashed expiring single-use tokens, purpose isolation, private generic requests, persisted rate limits, OAuth exclusion and confirmation resend");
})().catch(error => { console.error(error); process.exitCode = 1; });
