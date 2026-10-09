const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const bcrypt = require("bcrypt");
const source = ts.transpileModule(fs.readFileSync("lib/services/profile.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;

async function run() {
  const originalHash = await bcrypt.hash("initial-test-password", 10);
  let user = { id: "owner", email: "owner@example.invalid", name: "Original", password: originalHash, sessionVersion: 0 };
  let reads = 0, writes = 0, conflict = false;
  const signals = [];
  const database = { user: {
    findUnique: async ({ where }) => { reads++; assert.deepEqual(where, { id: "owner" }); return user; },
    updateMany: async ({ where, data }) => {
      writes++;
      assert.deepEqual(where, { id: "owner", password: user.password });
      if (conflict) return { count: 0 };
      user = { ...user, ...data, sessionVersion: user.sessionVersion + (data.sessionVersion?.increment ?? 0) };
      return { count: 1 };
    },
  }, communitySignal: { create: async args => { signals.push(args.data.room); } } };
  database.$transaction = async work => {
    const previous = { ...user }, previousSignals = signals.length;
    try { return await work(database); }
    catch (error) { user = previous; signals.length = previousSignals; throw error; }
  };
  const module = { exports: {} };
  const requireLocal = name => name === "@/lib/prisma" ? { __esModule: true, default: database } : require(name);
  new Function("require", "module", "exports", source)(requireLocal, module, module.exports);
  const update = module.exports.resetDataProfile;
  const auth = async () => ({ id: "owner", role: "BASIC" });
  const input = { email: user.email, name: "Updated" };
  assert.equal((await update(input, async () => null)).status, "error");
  assert.equal(reads, 0); assert.equal(writes, 0);
  assert.equal((await update({ ...input, email: "victim@example.invalid" }, auth)).status, "error");
  assert.equal(writes, 0);
  for (const invalid of [null, { ...input, name: " " }, { ...input, name: "x".repeat(51) }, { ...input, password: "current-only" }, { ...input, newPassword: "new-only" }, { ...input, password: "initial-test-password", newPassword: "short" }, { ...input, password: "initial-test-password", newPassword: "😀".repeat(20) }]) {
    assert.equal((await update(invalid, auth)).status, "error");
  }
  assert.equal(writes, 0);
  assert.equal((await update({ ...input, password: "wrong", newPassword: "replacement-test-password" }, auth)).status, "error");
  assert.equal(writes, 0);
  assert.equal((await update({ ...input, password: "initial-test-password", newPassword: "initial-test-password" }, auth)).status, "error");
  assert.equal(writes, 0);
  assert.equal((await update(input, auth)).status, "success");
  assert.equal(user.name, "Updated"); assert.equal(user.password, originalHash);
  assert.equal(user.sessionVersion, 0); assert.deepEqual(signals, []);
  assert.equal((await update(input, auth)).status, "error");
  assert.equal((await update({ email: user.email, password: "initial-test-password", newPassword: "replacement-test-password" }, auth)).status, "success");
  assert.equal(await bcrypt.compare("replacement-test-password", user.password), true);
  assert.equal(user.sessionVersion, 1); assert.deepEqual(signals, ["user:owner"]);
  assert.equal(require("./load-account-access.cjs").accountSessionValid(0, user.sessionVersion), false);
  const changedHash = user.password;
  database.communitySignal.create = async () => { throw Error("signal unavailable"); };
  assert.equal((await update({ email: user.email, password: "replacement-test-password", newPassword: "rollback-test-password" }, auth)).status, "error");
  assert.equal(user.password, changedHash); assert.equal(user.sessionVersion, 1);
  database.communitySignal.create = async args => { signals.push(args.data.room); };
  user.password = null;
  assert.equal((await update({ email: user.email, password: "x", newPassword: "replacement-test-password" }, auth)).status, "error");
  assert.equal((await update({ email: user.email, name: "OAuth account" }, auth)).status, "success");
  conflict = true;
  assert.equal((await update({ email: user.email, name: "Conflict" }, auth)).status, "error");
  database.user.findUnique = async () => { throw new Error("private database detail"); };
  const failure = await update(input, auth);
  assert.equal(failure.status, "error"); assert.equal(failure.message.includes("private"), false);
  console.log("PASS: profile authentication, account isolation, validation, password checks, OAuth name updates, concurrency and safe errors");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
