const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const source = ts.transpileModule(fs.readFileSync("lib/storage/profileUploadQuota.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
class UploadError extends Error { constructor(status, message) { super(message); this.status = status; } }
(async () => {
  let now = Date.now(), locks = 0, unavailable = false;
  const originalNow = Date.now;
  Date.now = () => now;
  const rows = [];
  const tx = {
    $executeRaw: async (sql, identifier) => { assert.match(sql.join("?"), /pg_advisory_xact_lock/); assert.match(identifier, /^profile-upload-rate:[a-f0-9]{64}$/); locks++; },
    verificationToken: {
      deleteMany: async ({ where }) => { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].identifier === where.identifier && rows[i].expires <= where.expires.lte) rows.splice(i, 1); },
      count: async ({ where }) => rows.filter(row => row.identifier === where.identifier && row.expires > where.expires.gt).length,
      create: async ({ data }) => { assert.ok(data.expires > now); rows.push(data); },
    },
  };
  // Model serialized transactions; the helper must request the database lock before admission.
  let queue = Promise.resolve();
  const module = { exports: {} };
  new Function("require", "module", "exports", source)(name => {
    if (name === "@/lib/community/common") return { transact: work => {
      const result = queue.then(() => { if (unavailable) throw Error("unavailable"); return work(tx); });
      queue = result.catch(() => {}); return result;
    } };
    if (name === "./profileImages") return { UploadError };
    return require(name);
  }, module, module.exports);
  try {
    const { admitProfileUpload } = module.exports;
    const burst = await Promise.allSettled(Array.from({ length: 7 }, () => admitProfileUpload("owner")));
    assert.equal(burst.filter(result => result.status === "fulfilled").length, 6);
    assert.equal(burst[6].reason.status, 429); assert.equal(rows.length, 6); assert.equal(locks, 7);
    await admitProfileUpload("another-owner"); assert.equal(rows.length, 7);
    for (let minute = 0; minute < 4; minute++) {
      now += 60001;
      for (let i = 0; i < 6; i++) await admitProfileUpload("owner");
    }
    now += 60001;
    await assert.rejects(admitProfileUpload("owner"), error => error.status === 429);
    assert.equal(rows.length, 31);
    now += 24 * 60 * 60 * 1000;
    await admitProfileUpload("owner");
    assert.equal(rows.filter(row => row.identifier === rows.at(-1).identifier).length, 1);
    unavailable = true;
    const before = rows.length;
    await assert.rejects(admitProfileUpload("owner")); assert.equal(rows.length, before);
    console.log("PASS: persisted shared upload admission, concurrent burst, account isolation, rolling daily cap, expiry and fail-closed errors");
  } finally { Date.now = originalNow; }
})().catch(error => { console.error(error); process.exitCode = 1; });
