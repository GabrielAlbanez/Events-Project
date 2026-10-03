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
  let actor = null, count = 1, rollback = 0, savedCount = 0, dbFailure = false;
  const route = load("app/api/upload/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => ({ body, status: init.status ?? 200 }) } },
    "@/lib/prisma": { __esModule: true, default: { user: { updateMany: async () => { if (dbFailure) throw Error("database failed"); return { count }; } } } },
    "@/lib/adminAuth": { getAuthenticatedUser: async () => actor },
    "@/lib/storage/profileImages": { ...storage, boundedMultipart: async () => ({ get: key => key === "userId" ? "u1" : file }), saveProfileImage: async () => { savedCount++; return { url: "/uploads/safe.jpg", remove: async () => { rollback++; } }; } },
  });
  const request = { headers: new Headers(), nextUrl: { origin: "http://localhost" } };
  assert.equal((await route.POST(request)).status, 401); assert.equal(savedCount, 0);
  actor = { id: "u1" }; count = 0;
  assert.equal((await route.POST(request)).status, 401); assert.equal(rollback, 1);
  count = 1; assert.equal((await route.POST(request)).status, 200);
  dbFailure = true; assert.equal((await route.POST(request)).status, 500); assert.equal(rollback, 2);
  request.headers.set("origin", "https://other.invalid"); assert.equal((await route.POST(request)).status, 403);
  console.log("PASS: upload signature validation, streamed size bound, exclusive UUID files, removed-account denial, origin and DB rollback");
})().catch(error => { console.error(error); process.exitCode = 1; });
