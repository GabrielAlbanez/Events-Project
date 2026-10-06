const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { randomUUID } = require("node:crypto");
class CommunityError extends Error { constructor(status, message) { super(message); this.status = status; } }
let actor = { id: "a" }, permitted = true, origin = true, recent = 0, saved = 0, removed = 0, bodies = 0, authorizationCalls = 0;
const eventId = "event", matchId = "match", imageId = randomUUID();
let entry = { id: imageId, kind: "party.image", eventId, authorId: "a", createdAt: new Date(), data: { matchId, filename: `${imageId}.jpg`, messageId: null } };
let message = { id: 1, matchId, authorId: "a" };
const db = { $executeRaw: async () => 1, communityEntry: { findUnique: async () => entry, count: async () => recent, create: async () => {} }, partyMessage: { findUnique: async () => message } };
const cache = new Map();
function load(file) {
  file = path.resolve(file); if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const req = name => {
    if (name === "@/lib/adminAuth") return { getAuthenticatedUser: async () => actor };
    if (name === "@/lib/community/common") return { CommunityError, transact: async work => work(db) };
    if (name === "@/lib/community/http") return { communityError: error => Response.json({ message: error.message }, { status: error.status ?? 500, headers: { "Cache-Control": "private, no-store" } }) };
    if (name === "@/lib/partyConnections/access") return { matchAccess: async () => { authorizationCalls++; if (!permitted) throw new CommunityError(403, "Denied"); return { match: { eventId } }; } };
    if (name === "@/lib/publicUrl") return { isAllowedRequestOrigin: () => origin };
    if (name === "@/lib/storage/chatImages") return { readChatImage: async () => Buffer.from([255, 216, 255]), saveChatImage: async () => { saved++; return { id: imageId, filename: `${imageId}.jpg`, remove: async () => { removed++; } }; } };
    if (name === "@/lib/storage/profileImages") return { UploadError: CommunityError, boundedMultipart: async () => { bodies++; return new Map([["file", { size: 40000, type: "image/jpeg", arrayBuffer: async () => new ArrayBuffer(40000) }]]); } };
    if (name.startsWith("@/")) return load(name.slice(2) + ".ts");
    return require(name);
  };
  new Function("require", "module", "exports", output)(req, module, module.exports); return module.exports;
}
async function main() {
  const { GET } = load("app/api/party-connections/[eventId]/matches/[matchId]/images/[imageId]/route.ts");
  const { POST } = load("app/api/party-connections/[eventId]/matches/[matchId]/images/route.ts");
  const params = { eventId, matchId, imageId }, request = new Request("http://localhost:3000/api/image", { headers: { "Content-Length": "40000" } });
  actor = null; assert.equal((await GET(request, { params })).status, 401); assert.equal((await POST(request, { params })).status, 401);
  actor = { id: "a" }; permitted = false;
  assert.equal((await GET(request, { params })).status, 403); assert.equal((await POST(request, { params })).status, 403);
  assert.equal(bodies, 0, "unauthorized uploads never read or save the body");
  permitted = true; actor = { id: "b" }; assert.equal((await GET(request, { params })).status, 404, "unpublished attachment is not shared");
  actor = { id: "a" }; let result = await GET(request, { params }); assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "private, no-store"); assert.equal(result.headers.get("x-content-type-options"), "nosniff");
  entry.data.messageId = 1; actor = { id: "b" }; assert.equal((await GET(request, { params })).status, 200);
  assert.equal((await GET(request, { params: { ...params, eventId: "other" } })).status, 403);
  entry.data.matchId = "other"; assert.equal((await GET(request, { params })).status, 404); entry.data.matchId = matchId;
  message = { ...message, matchId: "other" }; assert.equal((await GET(request, { params })).status, 404); message.matchId = matchId;
  permitted = false; assert.equal((await GET(request, { params })).status, 403, "revocation is checked on every image read"); permitted = true;
  actor = { id: "a" }; origin = false; assert.equal((await POST(request, { params })).status, 403); origin = true;
  const calls = authorizationCalls; result = await POST(request, { params }); assert.equal(result.status, 200);
  assert.equal(authorizationCalls - calls, 2, "permissions rechecked before file read and before metadata persistence");
  assert.equal((await result.json()).id, imageId); assert.equal(saved, 1);
  recent = 6; assert.equal((await POST(request, { params })).status, 429); assert.equal(removed, 1, "rate limit failure removes only the new upload");
  console.log("PASS chat image handlers: authentication, origin, private preview, participant access, cross-event/match denial, revocation, private cache, multipart >16KB, quota and upload rollback (mock dependencies).");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
