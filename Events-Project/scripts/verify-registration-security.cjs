const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// Registration answers identically whether or not the e-mail exists (anti-enumeration),
// is rate limited per e-mail/client and stores new e-mails in lowercase.
async function run() {
  let transactions = 0, hashes = 0, mails = 0, notices = 0;
  let existing = null, failPersistence = false, failMail = false;
  let savedUser, savedToken;
  const rateRows = [];
  const database = {
    $transaction: async (work) => {
      transactions++;
      const temporary = {};
      const result = await work({
        $executeRaw: async () => 1,
        verificationToken: {
          count: async ({ where }) => rateRows.filter(row => row === where.identifier).length,
          create: async ({ data }) => { rateRows.push(data.identifier); return data; },
          deleteMany: async () => ({ count: 0 }),
        },
        user: {
          findFirst: async ({ where, select }) => { assert.equal(where.email.mode, "insensitive"); assert.equal(select.password, true); return existing; },
          create: async ({ data }) => { temporary.user = data; return data; },
        },
        verificationTokenEmail: {
          deleteMany: async () => ({ count: 0 }),
          create: async ({ data }) => { if (failPersistence) throw new Error("private persistence detail"); temporary.token = data; return data; },
        },
      });
      savedUser = temporary.user; savedToken = temporary.token;
      return result;
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
      if (name === "@/lib/mail/transport") return { isMailConfigured: () => true };
      if (name === "@/lib/mail/verification") return { sendVerificationEmail: async (email, link) => { mails++; assert.equal(email, "test@example.invalid"); assert.equal(link.endsWith("/verifyEmail?token=test-verification-token"), true); if (failMail) throw new Error("private SMTP detail"); } };
      if (name === "@/lib/mail/accountExists") return { sendAccountExistsEmail: async email => { notices++; assert.equal(email, "test@example.invalid"); } };
      if (name.startsWith("@/")) return load(name.slice(2) + ".ts");
      return require(name);
    };
    new Function("require", "module", "exports", source)(requireLocal, module, module.exports);
    return module.exports;
  }
  const { registerUser: register, REGISTER_SUCCESS_MESSAGE } = load("lib/services/registration.ts");
  const input = { name: "Test User", email: "test@example.invalid", password: "test-password" };
  for (const invalid of [null, {}, { ...input, name: " " }, { ...input, name: "x".repeat(51) }, { ...input, email: "invalid" }, { ...input, password: "short" }, { ...input, password: "x".repeat(51) }, { ...input, password: "😀".repeat(20) }]) {
    assert.equal((await register(invalid, "client-a")).status, "error");
  }
  assert.deepEqual([transactions, hashes, mails], [0, 0, 0]);

  existing = { email: "test@example.invalid", password: "stored", emailVerified: true, name: "Test User" };
  const duplicate = await register(input, "client-a");
  assert.deepEqual(duplicate, { status: "success", message: REGISTER_SUCCESS_MESSAGE }, "existing e-mail gets the same answer");
  assert.deepEqual([transactions, mails, notices], [1, 0, 1]);
  assert.equal(savedUser, undefined, "existing account is not overwritten");

  existing = null;
  assert.equal((await register({ ...input, name: " Test User ", email: " TEST@example.invalid " }, "client-b")).message, REGISTER_SUCCESS_MESSAGE);
  assert.deepEqual([transactions, mails], [2, 1]);
  assert.equal(hashes, 2, "one asynchronous bcrypt hash per valid attempt (existing or new e-mail)");
  assert.equal(savedUser.name, "Test User"); assert.equal(savedUser.email, "test@example.invalid");
  assert.equal(savedUser.password, savedToken.password);
  assert.equal(savedUser.password, "test-hash"); assert.equal(savedToken.token, "test-verification-token");

  savedUser = undefined; savedToken = undefined; failPersistence = true;
  const failure = await register(input, "client-c");
  assert.equal(failure.status, "error"); assert.equal(failure.error.includes("private"), false);
  assert.equal(savedUser, undefined); assert.equal(savedToken, undefined); assert.equal(mails, 1);

  failPersistence = false; failMail = true;
  rateRows.length = 0;
  const mailFailure = await register(input, "client-d");
  assert.equal(mailFailure.status, "error"); assert.equal(mailFailure.error.includes("SMTP"), false);

  failMail = false;
  for (let i = 0; i < 2; i++) await register(input, "client-e");
  assert.equal((await register(input, "client-f")).code, "rate_limited", "e-mail bucket limits repeated sign-ups");
  console.log("PASS: registration server validation, uniform duplicate handling, lowercase e-mail, rate limit, transactional persistence and safe errors");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
