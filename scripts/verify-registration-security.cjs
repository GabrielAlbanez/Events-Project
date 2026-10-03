const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

async function run() {
  let reads = 0, transactions = 0, hashes = 0, mails = 0;
  let existing = null, failPersistence = false, failMail = false;
  let savedUser, savedToken;
  const database = {
    user: { findUnique: async ({ where, select }) => { reads++; assert.deepEqual(select, { id: true }); assert.equal(where.email, "test@example.invalid"); return existing; } },
    $transaction: async (work) => {
      transactions++;
      const temporary = {};
      await work({
        user: { create: async ({ data }) => { temporary.user = data; return data; } },
        verificationTokenEmail: { create: async ({ data }) => { if (failPersistence) throw new Error("private persistence detail"); temporary.token = data; return data; } },
      });
      savedUser = temporary.user; savedToken = temporary.token;
    },
  };
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
    const requireLocal = name => {
      if (name === "@/lib/prisma") return { __esModule: true, default: database };
      if (name === "bcrypt") return { hash: async (_password, rounds) => { hashes++; assert.equal(rounds, 10); return "test-hash"; } };
      if (name === "uuid") return { v4: () => "test-verification-token" };
      if (name === "@/lib/mail/verification") return { sendVerificationEmail: async (email, link) => { mails++; assert.equal(email, "test@example.invalid"); assert.equal(link.endsWith("/verifyEmail?token=test-verification-token"), true); if (failMail) throw new Error("private SMTP detail"); } };
      if (name.startsWith("@/")) return load(name.slice(2) + ".ts");
      return require(name);
    };
    new Function("require", "module", "exports", source)(requireLocal, module, module.exports);
    return module.exports;
  }
  const register = load("lib/services/registration.ts").registerUser;
  const input = { name: "Test User", email: "test@example.invalid", password: "test-password" };
  for (const invalid of [null, {}, { ...input, name: " " }, { ...input, name: "x".repeat(51) }, { ...input, email: "invalid" }, { ...input, password: "short" }, { ...input, password: "x".repeat(51) }, { ...input, password: "😀".repeat(20) }]) {
    assert.equal((await register(invalid)).status, "error");
  }
  assert.deepEqual([reads, transactions, hashes, mails], [0, 0, 0, 0]);
  existing = { id: "existing" };
  assert.equal((await register(input)).error, "O email já está registrado");
  assert.deepEqual([transactions, hashes, mails], [0, 0, 0]);
  existing = null;
  assert.equal((await register({ ...input, name: " Test User ", email: " test@example.invalid " })).status, "success");
  assert.deepEqual([transactions, hashes, mails], [1, 1, 1]);
  assert.equal(savedUser.name, "Test User"); assert.equal(savedUser.password, savedToken.password);
  assert.equal(savedUser.password, "test-hash"); assert.equal(savedToken.token, "test-verification-token");
  savedUser = undefined; savedToken = undefined; failPersistence = true;
  const failure = await register(input);
  assert.equal(failure.status, "error"); assert.equal(failure.error.includes("private"), false);
  assert.equal(savedUser, undefined); assert.equal(savedToken, undefined); assert.equal(mails, 1);
  failPersistence = false; failMail = true;
  const mailFailure = await register(input);
  assert.equal(mailFailure.status, "error"); assert.equal(mailFailure.error.includes("SMTP"), false);
  console.log("PASS: registration server validation, duplicate handling, one asynchronous hash, transactional persistence and safe errors");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
