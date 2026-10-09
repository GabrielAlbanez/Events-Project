const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function load(name) {
  const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../server/", name + ".mts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", output)(id => id === "../lib/auth/accountAccess.js" ? require("./load-account-access.cjs") : id === "../lib/auth/sessionCredential.js" ? require("./load-session-credential.cjs") : id === "../lib/auth/impersonation.js" ? require("./load-session-impersonation.cjs") : id.startsWith("./") ? load(id.slice(2).replace(/\.mjs$/, "")) : require(id), mod, mod.exports);
  return mod.exports;
}
function socket(userId, expiresAt) {
  return { data: { userId, expiresAt, effectiveRole: userId === "admin" ? "ADMIN" : "BASIC" }, connected: true, handlers: new Map(), messages: [], joined: new Set(),
    on(event, listener) { this.handlers.set(event, listener); }, emit(event, payload) { this.messages.push({ event, payload }); },
    async join(room) { this.joined.add(room); }, async leave(room) { this.joined.delete(room); }, disconnect() { this.connected = false; },
  };
}
async function main() {
  const { communityRoom, canReadCommunityRoom } = load("communityAccess");
  const { registerCommunitySubscriptions, dispatchCommunitySignal } = load("communityGateway");
  let eventStatus = "PUBLISHED", registrationStatus = "CONFIRMED", role = "BASIC";
  const db = {
    events: { findUnique: async ({ where }) => where.id === "party" ? { status: eventStatus, userId: "owner" } : null },
    user: { findUnique: async ({ where }) => ["owner", "member", "other", "admin"].includes(where.id) ? { id: where.id, role: where.id === "admin" ? role : "BASIC" } : null },
    eventRegistration: { findUnique: async ({ where }) => where.eventId_userId.eventId === "party" && where.eventId_userId.userId === "member" ? { status: registrationStatus } : null },
  };
  assert.equal(communityRoom({ chatEventId: "party" }), "chat:party");
  assert.equal(communityRoom({ chatEventId: "party", eventId: "party" }), null);
  assert.equal(communityRoom({ chatEventId: "../party" }), null);
  assert.equal(await canReadCommunityRoom(db, "chat:party"), false);
  assert.equal(await canReadCommunityRoom(db, "chat:party", "other"), false);
  for (const status of ["CONFIRMED", "CHECKED_IN"]) { registrationStatus = status; assert.equal(await canReadCommunityRoom(db, "chat:party", "member"), true); }
  for (const status of ["WAITLISTED", "CANCELLED"]) { registrationStatus = status; assert.equal(await canReadCommunityRoom(db, "chat:party", "member"), false); }
  registrationStatus = "CONFIRMED"; eventStatus = "DRAFT";
  assert.equal(await canReadCommunityRoom(db, "chat:party", "member"), false);
  assert.equal(await canReadCommunityRoom(db, "chat:party", "owner"), true);
  role = "ADMIN"; assert.equal(await canReadCommunityRoom(db, "chat:party", "admin"), true);
  role = "BASIC"; assert.equal(await canReadCommunityRoom(db, "chat:party", "admin"), false);
  eventStatus = "PUBLISHED";
  const participant = socket("member"), stranger = socket("other"), expired = socket("member", Date.now() - 1);
  for (const client of [participant, stranger, expired]) registerCommunitySubscriptions(db, client);
  let reply;
  await stranger.handlers.get("community-subscribe")({ chatEventId: "party", userId: "owner", role: "ADMIN" }, result => { reply = result; });
  assert.equal(reply.reason, "denied", "sender claims cannot grant access");
  await participant.handlers.get("community-subscribe")({ chatEventId: "party" }, result => { reply = result; });
  assert.equal(reply.ok, true);
  await expired.handlers.get("community-subscribe")({ chatEventId: "party" }, result => { reply = result; });
  assert.equal(reply.reason, "denied");
  const io = { sockets: { adapter: { rooms: new Map([["chat:party", new Set(["participant", "expired", "stranger"])]]) }, sockets: new Map([["participant", participant], ["expired", expired], ["stranger", stranger]]) } };
  await dispatchCommunitySignal(db, io, "chat:party");
  assert.deepEqual(participant.messages, [{ event: "community-updated", payload: { room: "chat:party" } }], "only invalidation, never message text or email");
  assert.equal(expired.connected, false);
  assert.ok(stranger.messages.some(item => item.event === "community-access-denied"));
  registrationStatus = "CANCELLED";
  await dispatchCommunitySignal(db, io, "chat:party");
  assert.equal(participant.joined.has("chat:party"), false);
  assert.ok(participant.messages.some(item => item.event === "community-access-denied"));
  await participant.handlers.get("community-subscribe")({ chatEventId: "party" }, result => { reply = result; });
  assert.equal(reply.reason, "denied");
  registrationStatus = "CONFIRMED";
  await participant.handlers.get("community-subscribe")({ chatEventId: "party" }, result => { reply = result; });
  assert.equal(reply.ok, true, "reconnection rechecks restored registration");
  participant.handlers.get("community-unsubscribe")({ chatEventId: "party" });
  assert.equal(participant.joined.has("chat:party"), false);
  console.log("Event chat Socket checks passed: registration, current roles, forgery, expiry, reconnect, revocation and private invalidation.");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
