const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const source = ts.transpileModule(fs.readFileSync("app/sitemap.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
const moduleObject = { exports: {} };
const db = { events: { async findMany(query) {
  assert.deepEqual(query.where, { status: "PUBLISHED" });
  return [{ id: "event-1", userId: "organizer", user: { role: "PROMOTER" } }, { id: "event-2", userId: "organizer", user: { role: "PROMOTER" } }, { id: "event-3", userId: "basic", user: { role: "BASIC" } }];
} } };
new Function("require", "module", "exports", source)(name => {
  if (name === "@/lib/prisma") return db;
  if (name === "@/lib/publicUrl") return { publicSiteUrl: () => new URL("https://example.invalid") };
  throw new Error("Unexpected sitemap dependency");
}, moduleObject, moduleObject.exports);

(async () => {
  const result = await moduleObject.exports.default();
  const paths = result.map(entry => new URL(entry.url).pathname);
  assert.equal(result.length, 9);
  assert.equal(paths.filter(path => path === "/promotores/organizer").length, 1);
  assert.ok(!paths.includes("/promotores/basic"));
  for (const id of ["event-1", "event-2", "event-3"]) {
    assert.ok(paths.includes(`/eventos/${id}`));
    assert.ok(paths.includes(`/eventos/${id}/comunidade`));
  }
  assert.ok(result.every(entry => entry.url.startsWith("https://example.invalid/")));
  assert.ok(paths.every(path => !/admin|api|Profile|chat|conexoes/.test(path)));
  console.log("PASS sitemap: only published events, public communities and unique organizers, canonical URLs.");
})().catch(error => { console.error(error); process.exitCode = 1; });
