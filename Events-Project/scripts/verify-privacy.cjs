const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const load = (file, dependencies) => {
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
};
const response = { NextResponse: { json: (body, options = {}) => {
  const result = { body, status: options.status ?? 200, writes: [] };
  result.cookies = { set: (...args) => result.writes.push(args) };
  return result;
} } };
let databaseReads = 0, increments = 0;
const prisma = {
  events: { findFirst: async () => { databaseReads++; return { id: "event" }; }, update: async () => { increments++; } },
  eventMetric: { upsert: async () => undefined },
  $transaction: async operations => Promise.all(operations),
};
const origin = { isAllowedRequestOrigin: (request, required) => request.origin === "https://eventmap.test" || (!required && !request.origin) };
const dependencies = {
  "next/server": response, "@/lib/publicUrl": origin,
  "@/lib/prisma": { default: prisma },
  "@/lib/metricConsent": { METRIC_CONSENT_COOKIE: "eventmap_metrics" },
};
const request = (consent, action = "view", values = []) => ({
  origin: "https://eventmap.test", json: async () => ({ action }),
  cookies: { get: name => name === "eventmap_metrics" ? { value: consent } : undefined, getAll: () => values },
});
(async () => {
  const { POST } = load("app/api/event-engagement/[id]/route.ts", dependencies);
  for (const value of [undefined, "no", "true", ""]) {
    const result = await POST(request(value), { params: { id: "event" } });
    assert.equal(result.body.measured, false);
    assert.deepEqual(result.writes, []);
  }
  assert.equal(databaseReads, 0, "no optional analytics database access before affirmative choice");
  const foreign = request("yes"); foreign.origin = "https://foreign.test";
  assert.equal((await POST(foreign, { params: { id: "event" } })).status, 403);
  assert.equal(databaseReads, 0);
  const enabled = await POST(request("yes"), { params: { id: "event" } });
  assert.equal(increments, 1);
  assert.equal(enabled.writes[0][0], "eventmap_metric_event");
  const { DELETE } = load("app/api/privacy/metrics/route.ts", dependencies);
  const revoked = await DELETE(request("yes", "view", [{ name: "eventmap_metric_event" }, { name: "next-auth.session-token" }]));
  assert.equal(revoked.writes[0][0], "eventmap_metric_event");
  assert.equal(revoked.writes[0][2].maxAge, 0);
  assert.equal(revoked.writes.length, 1, "cleanup preserves authentication and cannot overwrite a newer preference");
  assert.equal((await DELETE(foreign)).status, 403);
  const noOrigin = request("yes"); noOrigin.origin = null;
  assert.equal((await DELETE(noOrigin)).status, 403);
  console.log("PASS privacy: optional metrics denied by default, origin enforcement, opt-in counting and scoped cookie revocation.");
})().catch(error => { console.error(error); process.exitCode = 1; });
