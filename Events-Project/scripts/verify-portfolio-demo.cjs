const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const compiled = ts.transpileModule(fs.readFileSync("lib/demoEvents.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
new Function("exports", "module", compiled)(loaded.exports, loaded);
for (const reference of ["2026-12-31T23:59:00Z", "2028-02-28T23:59:00Z"]) {
  const events = loaded.exports.createDemoEvents(new Date(reference));
  assert.equal(events.length, 6);
  assert.equal(new Set(events.map(event => event.id)).size, 6);
  for (const event of events) {
    assert.ok(event.id.startsWith("demo-"));
    assert.ok(event.location.includes("fictício"));
    assert.ok(new Date(event.startsAt) > new Date(reference));
    assert.ok(fs.existsSync("public" + event.cover));
  }
}
console.log("PASS portfolio fixtures: six isolated fictitious events, local covers and future dates across year/leap boundaries.");
