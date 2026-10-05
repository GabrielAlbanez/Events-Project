const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

function load(file, dependencies) {
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const localRequire = name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name);
  new Function("require", "module", "exports", source)(localRequire, module, module.exports);
  return module.exports;
}

(async () => {
  let current = null, verified = false, calls = 0, claimed = true;
  const transaction = {
    verificationTokenEmail: {
      findUnique: async () => { calls++; return current; },
      deleteMany: async () => ({ count: claimed ? 1 : 0 }),
    },
    user: { updateMany: async () => { verified = true; return { count: 1 }; } },
  };
  const prisma = { $transaction: async callback => callback(transaction) };
  const { verifyEmailToken } = load("lib/services/emailVerification.ts", { "@/lib/prisma": { __esModule: true, default: prisma } });
  assert.equal((await verifyEmailToken(null)).status, "error");
  assert.equal(calls, 0);
  assert.equal((await verifyEmailToken("missing")).status, "error");
  current = { id: 1, email: "temporary@example.invalid", createdAt: new Date(Date.now() - 25 * 3600000) };
  assert.equal((await verifyEmailToken("expired")).status, "error");
  assert.equal(verified, false);
  current.createdAt = new Date();
  claimed = false;
  assert.equal((await verifyEmailToken("consumed-concurrently")).status, "error");
  assert.equal(verified, false);
  claimed = true;
  const result = await verifyEmailToken("valid");
  assert.equal(result.status, "success");
  assert.equal(verified, true);
  for (const name of ["user", "password", "email", "token"]) assert.equal(Object.hasOwn(result, name), false);

  let user = { id: "test", emailVerified: false, password: "placeholder" }, comparisons = 0;
  const { authOptions } = load("lib/auth/options.ts", {
    "@/lib/auth/accountAccess": require("./load-account-access.cjs"),
    "@/lib/auth/impersonation": require("./load-impersonation.cjs"),
    "@/lib/auth/googleProfileImage": require("./load-google-profile-image.cjs"),
    "@/lib/auth/sessionCredential": require("./load-session-credential.cjs"),
    "@/lib/prisma": { __esModule: true, default: { user: { findUnique: async () => user } } },
    "@next-auth/prisma-adapter": { PrismaAdapter: () => ({}) },
    bcrypt: { __esModule: true, default: { compare: async () => { comparisons++; return true; } } },
  });
  const authorize = authOptions.providers.find(provider => provider.options?.name === "Credentials").options.authorize;
  assert.equal(await authorize({ email: "temporary@example.invalid", password: "placeholder" }), null);
  assert.equal(comparisons, 0);
  user.emailVerified = true;
  assert.equal((await authorize({ email: "temporary@example.invalid", password: "placeholder" })).id, "test");
  user = null;
  assert.equal(await authorize({ email: "temporary@example.invalid", password: "placeholder" }), null);
  console.log("PASS: email verification expiry, single consumption, safe response and direct unverified-login denial");
})().catch(() => { console.error("FAIL: account security verification"); process.exitCode = 1; });
