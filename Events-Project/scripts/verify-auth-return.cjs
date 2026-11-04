const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const source = fs.readFileSync("lib/authReturn.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
new Function("exports", "module", compiled)(loaded.exports, loaded);
const { safeReturnPath, authPathWithReturn } = loaded.exports;

for (const unsafe of [null, "", "https://example.org", "//example.org", "/\\example.org", "/%5cexample.org", "/%2fexample.org", "/%0aexample.org", "/login", "/register?callbackUrl=//example.org", "/api/auth/signin", "/%61pi/auth", "/broken%ZZ", "/" + "a".repeat(2049)]) {
  assert.equal(safeReturnPath(unsafe), "/", `must reject unsafe return: ${unsafe}`);
}
const eventPath = "/eventos/portfolio-event?origem=agenda#participar";
assert.equal(safeReturnPath(eventPath), eventPath);
assert.equal(safeReturnPath("/salvos"), "/salvos");
assert.equal(authPathWithReturn("/login", eventPath), "/login?" + new URLSearchParams({ callbackUrl: eventPath }));
assert.equal(authPathWithReturn("/register", "/"), "/register");
assert.equal(authPathWithReturn("/login", "//example.org"), "/login");
console.log("PASS auth return: internal destinations preserved; external/encoded redirects and auth loops rejected.");
