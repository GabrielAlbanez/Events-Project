const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(name) {
  const file = path.join(__dirname, "../server/", name + ".mts");
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  const localRequire = name => name === "../lib/auth/accountAccess.js" ? require("./load-account-access.cjs") : name === "../lib/auth/sessionCredential.js" ? require("./load-session-credential.cjs") : name === "../lib/auth/impersonation.js" ? require("./load-session-impersonation.cjs") : name.startsWith("./") ? load(name.slice(2).replace(/\.mjs$/, "")) : require(name);
  new Function("require", "module", "exports", output)(localRequire, mod, mod.exports);
  return mod.exports;
}

async function main() {
  const { communityRoom, canReadCommunityRoom } = load("communityAccess");
  assert.equal(communityRoom({ eventId: "event-1" }), "event:event-1");
  assert.equal(communityRoom({ roomId: "friends-1" }), "friends:friends-1");
  assert.equal(communityRoom({ eventId: "a", roomId: "b" }), null);
  assert.equal(communityRoom({ eventId: "../private" }), null);
  const roles = { owner: "PROMOTER", admin: "ADMIN", guest: "BASIC", team: "BASIC" };
  let status = "PUBLISHED";
  let member = true;
  const prisma = {
    user: { findUnique: async ({ where }) => roles[where.id] ? { role: roles[where.id], id: where.id } : null },
    events: { findUnique: async ({ where }) => where.id === "one" ? { status, userId: "owner" } : null },
    communityTeamMember: { findUnique: async ({ where }) => where.eventId_userId.userId === "team" ? { userId: "team" } : null },
    friendsRoomMember: { findUnique: async ({ where }) => member && where.roomId_userId.userId === "guest" ? { userId: "guest" } : null },
  };
  assert.equal(await canReadCommunityRoom(prisma, "event:one"), true);
  status = "ENDED";
  assert.equal(await canReadCommunityRoom(prisma, "event:one"), true);
  status = "DRAFT";
  assert.equal(await canReadCommunityRoom(prisma, "event:one"), false);
  for (const user of ["owner", "admin", "team"]) assert.equal(await canReadCommunityRoom(prisma, "event:one", user), true);
  assert.equal(await canReadCommunityRoom(prisma, "event:one", "guest"), false);
  assert.equal(await canReadCommunityRoom(prisma, "friends:one", "guest"), true);
  assert.equal(await canReadCommunityRoom(prisma, "friends:one"), false);
  member = false;
  assert.equal(await canReadCommunityRoom(prisma, "friends:one", "guest"), false);
  assert.equal(await canReadCommunityRoom(prisma, "user:owner", "guest"), false);
  assert.equal(await canReadCommunityRoom(prisma, "user:owner", "owner"), true);
  assert.equal(await canReadCommunityRoom(prisma, "event:missing", "admin"), false);

  const { createCommunityPoller } = load("communityWorker");
  const now = 1900000000000;
  const entries = Array.from({ length: 205 }, (_, index) => ({ id: index + 2, room: "event:" + index, createdAt: new Date(now), deliveredAt: null }));
  const sent = [];
  let fail = false;
  let retainedCutoff;
  const outbox = { communitySignal: {
    findFirst: async () => entries.filter(entry => entry.deliveredAt === null).sort((a, b) => b.id - a.id)[0] ?? null,
    findMany: async ({ where, take }) => { assert.equal(where.deliveredAt, null); return entries.filter(entry => entry.deliveredAt === null && entry.id > where.id.gt && entry.id <= where.id.lte).sort((a, b) => a.id - b.id).slice(0, take); },
    updateMany: async ({ where, data }) => { for (const entry of entries) if (where.id.in.includes(entry.id) && entry.deliveredAt === null) entry.deliveredAt = data.deliveredAt; return { count: where.id.in.length }; },
    deleteMany: async ({ where }) => { retainedCutoff = where.deliveredAt.lt; return { count: 0 }; },
  } };
  const worker = createCommunityPoller(outbox, async room => { if (fail) throw new Error("offline"); sent.push(room); }, () => now);
  await worker.poll();
  assert.equal(sent.length, 205, "all paginated startup signals replay");
  assert.equal(retainedCutoff.getTime(), now - 86400000);
  await worker.poll();
  assert.equal(sent.length, 205, "no repeated emissions for same committed row");
  entries.push({ id: 1, room: "event:late-commit", createdAt: new Date(now), deliveredAt: null });
  await worker.poll();
  assert.equal(sent.at(-1), "event:late-commit", "late lower sequence ID is not skipped");
  entries.push({ id: 999, room: "friends:new", createdAt: new Date(now), deliveredAt: null });
  fail = true;
  const log = console.error;
  console.error = () => {};
  try { await worker.poll(); } finally { console.error = log; }
  fail = false;
  await worker.poll();
  assert.equal(sent.at(-1), "friends:new", "failed send retries without advancing delivery");
  entries.push({ id: 1000, room: "event:restart-pending", createdAt: new Date(now - 2 * 86400000), deliveredAt: null });
  const replayed = [];
  await createCommunityPoller(outbox, async room => replayed.push(room), () => now).poll();
  assert.deepEqual(replayed, ["event:restart-pending"], "restart reads only pending signals, including old undelivered mutations");
  worker.stop();
  entries.push({ id: 1001, room: "event:after-stop", createdAt: new Date(now), deliveredAt: null });
  await worker.poll();
  assert.notEqual(sent.at(-1), "event:after-stop");
  let stoppingWorker;
  stoppingWorker = createCommunityPoller(outbox, async () => stoppingWorker.stop(), () => now);
  await stoppingWorker.poll();
  assert.equal(entries.find(entry => entry.id === 1001).deliveredAt, null, "stop during emission must not acknowledge unfinished delivery");
  entries.find(entry => entry.id === 1001).deliveredAt = new Date(now);
  entries.push({ id: 1002, room: "event:poison", deliveredAt: null }, { id: 1003, room: "event:healthy", deliveredAt: null });
  const isolated = [];
  const isolationWorker = createCommunityPoller(outbox, async room => { if (room === "event:poison") throw new Error("unavailable"); isolated.push(room); }, () => now);
  console.error = () => {};
  try { await isolationWorker.poll(); } finally { console.error = log; }
  assert.deepEqual(isolated, ["event:healthy"], "one failed room must not block the others");
  assert.equal(entries.find(entry => entry.id === 1002).deliveredAt, null);
  entries.find(entry => entry.id === 1002).deliveredAt = new Date(now);
  for (let i = 0; i < 1200; i++) entries.push({ id: 2000 + i, room: "event:backlog", deliveredAt: null });
  const bounded = createCommunityPoller(outbox, async () => {}, () => now);
  await bounded.poll();
  assert.equal(entries.filter(entry => entry.deliveredAt === null).length, 200, "poll processes at most five batches");
  await bounded.poll();
  assert.equal(entries.filter(entry => entry.deliveredAt === null).length, 0, "backlog resumes next poll");
  let clock = now;
  entries.push({ id: 4000, room: "event:slow", deliveredAt: null }, { id: 4001, room: "event:after-budget", deliveredAt: null });
  const budget = createCommunityPoller(outbox, async () => { clock += 1001; }, () => clock);
  await budget.poll();
  assert.equal(entries.find(entry => entry.id === 4001).deliveredAt, null, "budget yields between room deliveries");
  await budget.poll();
  assert.notEqual(entries.find(entry => entry.id === 4001).deliveredAt, null);

  const { registerCommunitySubscriptions, dispatchCommunitySignal } = load("communityGateway");
  function fakeSocket(userId, expiresAt) {
    const handlers = new Map(), messages = [], joined = new Set();
    return { data: { userId, expiresAt }, connected: true, handlers, messages, joined,
      on: (event, listener) => handlers.set(event, listener),
      emit: (event, payload) => messages.push({ event, payload }),
      join: async room => joined.add(room), leave: async room => joined.delete(room),
      disconnect() { this.connected = false; },
    };
  }
  member = true;
  const guest = fakeSocket("guest");
  registerCommunitySubscriptions(prisma, guest);
  let ack;
  await guest.handlers.get("community-subscribe")({ roomId: "one" }, reply => { ack = reply; });
  assert.equal(ack.ok, true);
  assert.equal(guest.joined.has("friends:one"), true);
  member = false;
  await guest.handlers.get("community-subscribe")({ roomId: "one" }, reply => { ack = reply; });
  assert.equal(ack.reason, "denied");
  assert.equal(guest.joined.has("friends:one"), false, "denied resubscription immediately leaves previous room");
  await guest.handlers.get("community-subscribe")({ user: true }, reply => { ack = reply; });
  assert.equal(ack.ok, true);
  guest.handlers.get("community-unsubscribe")({ user: true });
  assert.equal(guest.joined.has("user:guest"), true, "personal notification room survives unsubscribe");
  await guest.handlers.get("community-subscribe")({ user: true, roomId: "other" }, reply => { ack = reply; });
  assert.equal(ack.reason, "denied");
  const expired = fakeSocket("owner", Date.now() - 1000);
  const revoked = fakeSocket("guest"); revoked.joined.add("friends:one");
  const ownerSocket = fakeSocket("owner");
  const fakeIo = { sockets: { adapter: { rooms: new Map([["friends:one", new Set(["expired", "revoked"])] , ["user:owner", new Set(["owner"])]] ) }, sockets: new Map([["expired", expired], ["revoked", revoked], ["owner", ownerSocket]]) } };
  await dispatchCommunitySignal(prisma, fakeIo, "friends:one");
  assert.equal(expired.connected, false);
  assert.equal(expired.messages[0].event, "session-expired");
  assert.equal(revoked.joined.has("friends:one"), false);
  assert.ok(revoked.messages.some(message => message.event === "community-access-denied"));
  await dispatchCommunitySignal(prisma, fakeIo, "user:owner");
  assert.ok(ownerSocket.messages.some(message => message.event === "notification-updated"));
  assert.deepEqual(ownerSocket.messages.find(message => message.event === "community-updated").payload, { room: "user:owner" });
  console.log("Community Socket checks passed: permissions, gateway acknowledgments/revocation/expiry, personal notices, late commits, retry isolation, bounded polls, restart and stop.");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
