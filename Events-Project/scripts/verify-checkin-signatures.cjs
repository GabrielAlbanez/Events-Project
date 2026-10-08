const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const { createHmac } = require("node:crypto");
const key = "shared-checkin-test-key-".repeat(3);
const legacy = "legacy-web-session-key-".repeat(3);
process.env.CHECKIN_SIGNING_SECRET = key;
process.env.NEXTAUTH_SECRET = legacy;
const registration = { id: "registration", eventId: "event", status: "CONFIRMED", qrVersion: 1, user: { id: "attendee", name: "Attendee" } };
const db = {
  events: { findUnique: async () => ({ id: "event", status: "PUBLISHED", userId: "owner" }) },
  eventRegistration: { findUnique: async () => registration, update: async () => ({ ...registration, status: "CHECKED_IN" }) },
  $transaction: async operation => operation(db),
};
const mod = { exports: {} };
const source = ts.transpileModule(fs.readFileSync("lib/services/attendance.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
new Function("require", "module", "exports", source)(id => id === "@/lib/prisma" ? { __esModule: true, default: db } : id === "@/lib/eventTime" ? { eventInstant: () => null } : require(id), mod, mod.exports);
const { issueCheckInToken, checkInAttendee } = mod.exports;
function token(secret, overrides = {}) {
  const payload = Buffer.from(JSON.stringify({ registrationId: "registration", eventId: "event", qrVersion: 1, expiresAt: Date.now() + 60000, ...overrides })).toString("base64url");
  return payload + "." + createHmac("sha256", secret).update("eventmap-checkin-v1:" + payload).digest("base64url");
}
(async () => {
  const issued = await issueCheckInToken("event", "attendee");
  const [payload, signed] = issued.token.split(".");
  assert.equal(signed, createHmac("sha256", key).update("eventmap-checkin-v1:" + payload).digest("base64url"));
  for (const valid of [issued.token, token(key), token(legacy)]) assert.equal((await checkInAttendee("event", { id: "owner", role: "PROMOTER" }, valid)).status, "CHECKED_IN");
  for (const invalid of [token("untrusted-key-".repeat(4)), token(key, { expiresAt: Date.now() - 1 }), token(key, { eventId: "another" }), token(key, { qrVersion: 2 }), issued.token + ".extra"]) await assert.rejects(checkInAttendee("event", { id: "owner", role: "PROMOTER" }, invalid), error => error.status === 400);
  await assert.rejects(checkInAttendee("event", { id: "stranger", role: "BASIC" }, issued.token), error => error.status === 403);
  delete process.env.CHECKIN_SIGNING_SECRET;
  const fallback = await issueCheckInToken("event", "attendee");
  assert.equal((await checkInAttendee("event", { id: "owner", role: "PROMOTER" }, fallback.token)).status, "CHECKED_IN");
  console.log("PASS shared check-in signatures, legacy codes, expiry/version/event binding, authorization and fallback (mock persistence)");
})().catch(error => { console.error(error); process.exitCode = 1; });
