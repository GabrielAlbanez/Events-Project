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

  // Credentials login now runs through lib/services/credentials.ts (rate limit, case-insensitive
  // lookup, password check before account state). Wrong credentials return null; a correct
  // password on an unverified account raises the whitelisted EmailNotVerified code.
  let user = { id: "test", email: "temporary@example.invalid", emailVerified: false, password: "placeholder" }, comparisons = 0;
  const rateRows = [];
  const credentialsPrisma = {
    user: { findMany: async () => (user ? [user] : []) },
    verificationToken: {
      count: async ({ where }) => rateRows.filter(row => row === where.identifier).length,
      create: async ({ data }) => { rateRows.push(data.identifier); return data; },
      deleteMany: async () => ({ count: 0 }),
    },
  };
  const bcryptMock = { __esModule: true, default: { compare: async (password, hash) => { comparisons++; return password === hash; } } };
  const accountAccess = require("./load-account-access.cjs");
  const credentialsService = load("lib/services/credentials.ts", {
    "@/lib/prisma": { __esModule: true, default: credentialsPrisma },
    bcrypt: bcryptMock,
    "@prisma/client": {},
    "@/lib/auth/accountAccess": accountAccess,
    "@/lib/auth/errorMessages": load("lib/auth/errorMessages.ts", {}),
    "@/lib/rateLimit": load("lib/rateLimit.ts", { "node:crypto": require("node:crypto") }),
  });
  const { authOptions } = load("lib/auth/options.ts", {
    "@/lib/auth/accountAccess": accountAccess,
    "@/lib/auth/impersonation": require("./load-impersonation.cjs"),
    "@/lib/auth/googleProfileImage": require("./load-google-profile-image.cjs"),
    "@/lib/auth/sessionCredential": require("./load-session-credential.cjs"),
    "@/lib/prisma": { __esModule: true, default: { user: { findUnique: async () => user } } },
    "@next-auth/prisma-adapter": { PrismaAdapter: () => ({}) },
    "@/lib/services/credentials": credentialsService,
    "@/lib/rateLimit": load("lib/rateLimit.ts", { "node:crypto": require("node:crypto") }),
  });
  const authorize = authOptions.providers.find(provider => provider.options?.name === "Credentials").options.authorize;
  await assert.rejects(authorize({ email: "temporary@example.invalid", password: "placeholder" }), error => error.message === "EmailNotVerified");
  assert.equal(await authorize({ email: "temporary@example.invalid", password: "wrong" }), null);
  user.emailVerified = true;
  assert.equal((await authorize({ email: "Temporary@Example.invalid", password: "placeholder" })).id, "test");
  user = null;
  assert.equal(await authorize({ email: "temporary@example.invalid", password: "placeholder" }), null);
  console.log("PASS: email verification expiry, single consumption, safe response and direct unverified-login denial (whitelisted code)");
})().catch(() => { console.error("FAIL: account security verification"); process.exitCode = 1; });
