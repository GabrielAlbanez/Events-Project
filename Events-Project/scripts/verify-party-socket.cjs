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
  const { registerChatSignals } = load("chatSignals");
  let eventStatus = "PUBLISHED", blocked = false, matchActive = true;
  const profiles = { a: { active: true, intent: "FRIENDSHIP", adultDeclared: false }, b: { active: true, intent: "COMPANY", adultDeclared: false } };
  const registrations = { a: "CONFIRMED", b: "CHECKED_IN", admin: "CONFIRMED" };
  const db = {
    user: { findUnique: async ({ where }) => ["a", "b", "admin"].includes(where.id) ? { id: where.id, role: where.id === "admin" ? "ADMIN" : "BASIC" } : null },
    events: { findUnique: async ({ where }) => where.id === "party" ? { status: eventStatus } : null },
    partyProfile: { findUnique: async ({ where }) => where.eventId_userId.eventId === "party" ? profiles[where.eventId_userId.userId] ?? null : null },
    eventRegistration: { findUnique: async ({ where }) => where.eventId_userId.eventId === "party" && registrations[where.eventId_userId.userId] ? { status: registrations[where.eventId_userId.userId] } : null },
    partyMatch: { findUnique: async ({ where }) => where.id === "pair" ? { eventId: "party", userAId: "a", userBId: "b", active: matchActive } : null },
    partyBlock: { findFirst: async ({ where }) => { assert.deepEqual(where.OR, [{ fromId: "a", toId: "b" }, { fromId: "b", toId: "a" }]); return blocked ? { fromId: "b" } : null; } },
  };
  assert.equal(communityRoom({ partyEventId: "party" }), "party:party");
  assert.equal(communityRoom({ matchId: "pair" }), "match:pair");
  for (const payload of [{ matchId: "pair", partyEventId: "party" }, { matchId: "pair", user: false }, { matchId: "pair", chatEventId: "party" }, { partyEventId: "../party" }]) assert.equal(communityRoom(payload), null);
  assert.equal(await canReadCommunityRoom(db, "party:party"), false);
  assert.equal(await canReadCommunityRoom(db, "party:party", "admin"), false, "admin has no opt-in override");
  assert.equal(await canReadCommunityRoom(db, "match:pair", "admin"), false, "admin cannot read private conversations");
  assert.equal(await canReadCommunityRoom(db, "match:pair", "a"), true);
  assert.equal(await canReadCommunityRoom(db, "match:pair", "b"), true);
  assert.equal(await canReadCommunityRoom(db, "party:other", "a"), false);
  profiles.a.intent = "DATING"; profiles.a.adultDeclared = true;
  assert.equal(await canReadCommunityRoom(db, "match:pair", "a"), false, "dating cannot pair with friendship");
  profiles.b.intent = "DATING";
  assert.equal(await canReadCommunityRoom(db, "match:pair", "a"), false, "both need explicit adult declaration");
  profiles.b.adultDeclared = true;
  assert.equal(await canReadCommunityRoom(db, "match:pair", "a"), true);
  profiles.a.adultDeclared = false;
  assert.equal(await canReadCommunityRoom(db, "party:party", "a"), false);
  profiles.a.intent = "FRIENDSHIP"; profiles.b.intent = "COMPANY";
  const a = socket("a"), b = socket("b"), admin = socket("admin");
  for (const client of [a, b, admin]) registerCommunitySubscriptions(db, client);
  let ack;
  await a.handlers.get("community-subscribe")({ matchId: "pair" }, reply => { ack = reply; }); assert.equal(ack.ok, true);
  await b.handlers.get("community-subscribe")({ matchId: "pair" }, reply => { ack = reply; }); assert.equal(ack.ok, true);
  await admin.handlers.get("community-subscribe")({ matchId: "pair", role: "ADMIN" }, reply => { ack = reply; }); assert.equal(ack.reason, "denied");
  await a.handlers.get("community-subscribe")({ user: true, partyEventId: "party" }, reply => { ack = reply; }); assert.equal(ack.reason, "denied");
  const io = { sockets: { adapter: { rooms: new Map([["match:pair", new Set(["a", "b"])]]) }, sockets: new Map([["a", a], ["b", b]]) } };
  await dispatchCommunitySignal(db, io, "match:pair");
  assert.deepEqual(a.messages, [{ event: "community-updated", payload: { room: "match:pair" } }]);
  for (const client of [a, b, admin]) registerChatSignals(db, io, client, () => ["b", "unrelated"]);
  await a.handlers.get("chat-presence")({ matchId: "pair" }, reply => { ack = reply; });
  assert.deepEqual(ack, { ok: true, online: true }, "only the authorized peer's presence is returned");
  await b.handlers.get("chat-presence")({ matchId: "pair" }, reply => { ack = reply; });
  assert.deepEqual(ack, { ok: true, online: false });
  await admin.handlers.get("chat-presence")({ matchId: "pair" }, reply => { ack = reply; });
  assert.deepEqual(ack, { ok: false }, "admin does not gain private presence access");
  await a.handlers.get("typing")({ matchId: "pair", active: true });
  const hint = b.messages.find(message => message.event === "typing");
  assert.equal(hint.payload.userId, "a"); assert.ok(hint.payload.until > Date.now());
  assert.equal(a.messages.some(message => message.event === "typing"), false, "typing is delivered only to the peer");
  const hintCount = b.messages.filter(message => message.event === "typing").length;
  await admin.handlers.get("typing")({ matchId: "pair", active: true });
  await a.handlers.get("typing")({ matchId: "pair", user: false, active: true });
  assert.equal(b.messages.filter(message => message.event === "typing").length, hintCount, "admin and forged payloads cannot emit hints");
  const signalCount = b.messages.filter(message => message.event === "community-updated").length;
  await a.handlers.get("chat-sync")({ matchId: "pair" });
  assert.equal(b.messages.filter(message => message.event === "community-updated").length, signalCount + 1);
  blocked = true;
  const blockedClient = socket("a"); registerChatSignals(db, io, blockedClient, () => ["b"]);
  await blockedClient.handlers.get("chat-presence")({ matchId: "pair" }, reply => { ack = reply; });
  assert.deepEqual(ack, { ok: false }, "blocking revokes private presence");
  await dispatchCommunitySignal(db, io, "match:pair");
  assert.equal(a.joined.size, 0); assert.equal(b.joined.size, 0);
  assert.ok(a.messages.some(message => message.event === "community-access-denied"));
  blocked = false;
  for (const invalidate of [() => { profiles.b.active = false; }, () => { registrations.b = "CANCELLED"; }, () => { matchActive = false; }, () => { eventStatus = "DRAFT"; }]) {
    profiles.b.active = true; registrations.b = "CHECKED_IN"; matchActive = true; eventStatus = "PUBLISHED";
    invalidate(); assert.equal(await canReadCommunityRoom(db, "match:pair", "a"), false);
  }
  eventStatus = "PUBLISHED"; matchActive = true; profiles.b.active = true; registrations.b = "CHECKED_IN";
  let resolveProfile;
  const original = db.partyProfile.findUnique;
  db.partyProfile.findUnique = args => args.where.eventId_userId.userId === "a" ? new Promise(resolve => { resolveProfile = resolve; }) : original(args);
  const pending = a.handlers.get("community-subscribe")({ partyEventId: "party" }, reply => { ack = reply; });
  await new Promise(resolve => setImmediate(resolve));
  a.handlers.get("community-unsubscribe")({ partyEventId: "party" });
  resolveProfile(profiles.a); await pending;
  assert.equal(ack.reason, "unavailable"); assert.equal(a.joined.has("party:party"), false, "late authorization cannot restore unsubscribed room");
  console.log("Party Socket checks passed: private rooms, opt-in, mutual consent, adult declarations, no admin override, blocks, revocation and late acknowledgments.");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

