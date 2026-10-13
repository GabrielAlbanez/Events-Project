const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
function load(file, dependencies) {
  const module = { exports: {} };
  new Function("require", "module", "exports", ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText)(name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name), module, module.exports);
  return module.exports;
}
(async () => {
  let written = 0, removed = 0;
  const storage = load("lib/storage/profileImages.ts", { "node:fs/promises": { __esModule: true, default: {
    mkdir: async () => {}, writeFile: async (target, bytes, options) => { assert.equal(options.flag, "wx"); assert.match(target, /[a-f0-9-]{36}\.jpg$/); written++; }, unlink: async () => { removed++; },
  } } });
  assert.equal(storage.imageExtension(Buffer.from([255,216,255,224]), "image/jpeg"), ".jpg");
  assert.throws(() => storage.imageExtension(Buffer.from("<script>bad</script>"), "image/png"));
  await assert.rejects(storage.saveProfileImage({ size: 0 }));
  await assert.rejects(storage.saveProfileImage({ size: storage.maximumImageBytes + 1 }));
  const file = { size: 4, type: "image/jpeg", arrayBuffer: async () => Buffer.from([255,216,255,224]) };
  const saved = await storage.saveProfileImage(file); await saved.remove(); assert.equal(written, 1); assert.equal(removed, 1);
  const huge = new Request("http://localhost", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=x" }, body: new Uint8Array(storage.maximumMultipartBytes + 1) });
  await assert.rejects(storage.boundedMultipart(huge), error => error.status === 413);
  let actor = null, count = 1, rollback = 0, savedCount = 0, dbFailure = false, notifications = [];
  const prisma = {
    $transaction: async callback => callback({
      user: { updateMany: async () => { if (dbFailure) throw Error("database failed"); return { count }; } },
      $queryRaw: async (query, ...values) => {
        notifications.push({ sql: query.join("$PARAM"), values });
        return [{ "?column?": true }];
      },
    }),
  };
  let admitted = 0, quotaFailure = false;
  const route = load("app/api/upload/route.ts", {
    "@/lib/publicUrl": require("./load-public-url.cjs"),
    "next/server": { NextResponse: { json: (body, init) => ({ body, status: init.status ?? 200 }) } },
    "@/lib/prisma": { __esModule: true, default: prisma },
    "@/lib/storage/profileUploadQuota": { admitProfileUpload: async id => { assert.equal(id, "u1"); if (quotaFailure) throw new storage.UploadError(429, "quota"); admitted++; } },
    "@/lib/adminAuth": { getAuthenticatedUser: async () => actor },
    "@/lib/storage/profileImages": { ...storage, boundedMultipart: async () => ({ get: key => key === "userId" ? "u1" : file }), saveProfileImage: async () => { savedCount++; return { url: "/uploads/safe.jpg", remove: async () => { rollback++; } }; } },
  });
  const request = { headers: new Headers(), nextUrl: { origin: "http://localhost", searchParams: new URLSearchParams() } };
  assert.equal((await route.POST(request)).status, 401); assert.equal(savedCount, 0);
  actor = { id: "u1" }; count = 0;
  quotaFailure = true;
  assert.equal((await route.POST(request)).status, 429); assert.equal(savedCount, 0);
  quotaFailure = false;
  assert.equal((await route.POST(request)).status, 401); assert.equal(rollback, 1);
  count = 1; assert.equal((await route.POST(request)).status, 200);
  assert.deepEqual(notifications, [{
    sql: "SELECT pg_notify('eventmap_profile_image_updated', $PARAM) IS NULL",
    values: ["u1"],
  }]);
  dbFailure = true;
  const errors = [];
  const originalError = console.error;
  console.error = (...values) => errors.push(values);
  try { assert.equal((await route.POST(request)).status, 500); } finally { console.error = originalError; }
  assert.equal(rollback, 2);
  assert.equal(errors[0][0], "Profile image upload failed.");
  assert.equal(errors[0][1].stage, "database");
  assert.equal(errors[0][1].errorName, "Error");
  request.nextUrl.searchParams.set("purpose", "party");
  assert.equal((await route.POST(request)).status, 200); // No profile write even when user update fails.
  const beforeQuota = savedCount;
  quotaFailure = true;
  assert.equal((await route.POST(request)).status, 429); assert.equal(savedCount, beforeQuota);
  assert.equal(admitted, 4);
  request.nextUrl.searchParams.set("purpose", "other");
  assert.equal((await route.POST(request)).status, 400);
  request.headers.set("origin", "https://other.invalid"); assert.equal((await route.POST(request)).status, 403);
  console.log("PASS: upload signature validation, streamed size bound, exclusive UUID files, removed-account denial, origin, DB rollback and realtime notification");
})().catch(error => { console.error(error); process.exitCode = 1; });
