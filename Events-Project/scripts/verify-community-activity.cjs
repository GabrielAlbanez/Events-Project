const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
let db, actor;
const cache = new Map();
function load(filename) {
  filename = path.resolve(filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const localRequire = name => {
    if (name === "@/lib/prisma") return { __esModule: true, get default() { return db; } };
    if (name === "@/lib/adminAuth") return { getAuthenticatedUser: async () => actor };
    if (name.startsWith("@/")) return load(name.slice(2) + ".ts");
    if (name.startsWith(".")) return load(path.resolve(path.dirname(filename), name) + ".ts");
    return require(name);
  };
  new Function("require", "module", "exports", source)(localRequire, module, module.exports);
  return module.exports;
}
async function run() {
  const queries = {};
  const event = { id: "event", nome: "My event" };
  db = {
    $transaction: async (work, options) => { assert.equal(options.isolationLevel, "RepeatableRead"); assert.equal(options.timeout, 15000); return work(db); },
    user: { findUnique: async () => ({ id: "me", role: "BASIC" }) },
    communityQueueTicket: {
      findMany: async args => { queries.queues = args; return Array.from({ length: 21 }, (_, i) => ({ id: `ticket-${i}`, entryId: `queue-${i}`, status: i === 0 ? "CALLED" : "WAITING", createdAt: new Date(), entry: { data: { title: "Queue", state: i === 0 ? "CLOSED" : "OPEN", secret: "must not return" }, event } })); },
      count: async args => { assert.equal(args.where.status, "WAITING"); assert.equal(args.where.OR.length, 2); return 2; },
    },
    communityEntry: { findMany: async args => { queries.tasks = args; return [{ id: "task", data: { title: "Assigned", assignedTo: "me", status: "HELP", private: "not returned" }, event }]; } },
    eventRegistration: { findMany: async args => { queries.registrations = args; return [
      { id: "future", status: "CONFIRMED", event: { ...event, banner: "/banner", dataInicio: "2099-12-30", dataFim: "2099-12-31", startTime: "20:00", endTime: "23:00", timezone: "America/Sao_Paulo" } },
      { id: "expired", status: "CONFIRMED", event: { ...event, banner: "", dataInicio: "2000-01-01", dataFim: "2000-01-02", timezone: "America/Sao_Paulo" } },
      { id: "invalid", status: "CONFIRMED", event: { ...event, banner: "", dataInicio: "invalid", dataFim: "invalid", timezone: "UTC" } },
    ]; } },
    friendsRoom: { findMany: async args => { queries.rooms = args; return [{ id: "room", name: "Friends", _count: { members: 3, suggestions: 2 } }]; } },
  };
  const { activitySnapshot } = load("lib/community/activity.ts");
  const result = await activitySnapshot({ id: "me", role: "ADMIN" });
  assert.equal(queries.queues.where.userId, "me");
  assert.deepEqual(queries.queues.orderBy, [{ status: "asc" }, { createdAt: "asc" }, { id: "asc" }], "called tickets precede waiting tickets in bounded results");
  assert.deepEqual(queries.queues.where.entry.event.OR[1], { OR: [{ userId: "me" }, { communityTeam: { some: { userId: "me" } } }] });
  assert.deepEqual(queries.tasks.where.AND[0], { data: { path: ["assignedTo"], equals: "me" } });
  assert.deepEqual(queries.tasks.where.event, queries.queues.where.entry.event.OR[1]);
  assert.equal(queries.registrations.where.userId, "me"); assert.equal(queries.registrations.where.event.status, "PUBLISHED");
  assert.deepEqual(queries.rooms.where, { members: { some: { userId: "me" } } });
  for (const query of Object.values(queries)) assert.ok(query.take <= 22);
  assert.equal(result.queues.length, 20); assert.equal(result.truncated.queues, true); assert.equal(result.queues[1].position, 3);
  assert.equal(result.counts.called, 0, "closed queue does not demand attention");
  assert.equal(result.tasks[0].status, "HELP"); assert.equal(result.registrations.length, 1);
  assert.equal(result.registrations[0].startsAt, "2099-12-30T23:00:00.000Z");
  assert.equal(JSON.stringify(result).includes("must not return"), false);
  assert.equal(JSON.stringify(result).includes("assignedTo"), false);
  assert.equal(JSON.stringify(result).includes("ticket-"), false);
  db.user.findUnique = async () => null;
  await assert.rejects(activitySnapshot({ id: "me", role: "ADMIN" }), error => error.status === 401);
  const { GET } = load("app/api/community/activity/route.ts");
  const { NextRequest } = require("next/server");
  actor = null;
  const unauthorized = await GET(new NextRequest("http://localhost:3000/api/community/activity"));
  assert.equal(unauthorized.status, 401); assert.equal(unauthorized.headers.get("Cache-Control"), "no-store");
  actor = { id: "me", role: "BASIC" };
  db.user.findUnique = async () => ({ id: "me", role: "ADMIN" });
  const response = await GET(new NextRequest("http://localhost:3000/api/community/activity"));
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(queries.tasks.where.event, {}, "current DB role governs access");
  db.$transaction = async () => { throw new Error("sensitive database detail"); };
  const failure = await GET(new NextRequest("http://localhost:3000/api/community/activity"));
  assert.equal(failure.status, 500); assert.equal((await failure.text()).includes("sensitive"), false);
  console.log("PASS activity: current-role access, own tickets/tasks/registrations/rooms, bounded queries, timezone dates, projection, no-store authentication and safe errors");
}
async function databaseReadCheck() {
  require("@next/env").loadEnvConfig(process.cwd());
  const { PrismaClient } = require("@prisma/client");
  db = new PrismaClient();
  const { randomUUID } = require("node:crypto");
  const ownerId = randomUUID(), participantId = randomUUID(), outsiderId = randomUUID();
  const fixtureIds = [ownerId, participantId, outsiderId];
  try {
    await db.user.createMany({ data: fixtureIds.map(id => ({ id, name: "Activity verification fixture", role: "BASIC" })) });
    const event = await db.events.create({ data: { nome: "Activity verification fixture", userId: ownerId, banner: "", carrossel: [], descricao: "Temporary isolated verification", dataInicio: "2099-12-30", dataFim: "2099-12-31", linkParaCompra: "", endereco: "", status: "PUBLISHED" } });
    await db.communityTeamMember.create({ data: { eventId: event.id, userId: participantId } });
    const queue = await db.communityEntry.create({ data: { eventId: event.id, authorId: ownerId, kind: "queue", data: { title: "Test queue", state: "OPEN" } } });
    await db.communityQueueTicket.createMany({ data: [{ entryId: queue.id, userId: ownerId, createdAt: new Date("2020-01-01T00:00:00Z") }, { entryId: queue.id, userId: participantId, createdAt: new Date("2020-01-01T00:00:01Z") }] });
    const task = await db.communityEntry.create({ data: { eventId: event.id, authorId: ownerId, kind: "task", data: { title: "Test task", assignedTo: participantId, status: "TODO" } } });
    const registration = await db.eventRegistration.create({ data: { eventId: event.id, userId: participantId } });
    const room = await db.friendsRoom.create({ data: { name: "Activity verification fixture", ownerId, members: { create: [{ userId: ownerId }, { userId: participantId }] } } });
    const { activitySnapshot } = load("lib/community/activity.ts");
    const participant = { id: participantId, role: "BASIC" };
    const mine = await activitySnapshot(participant);
    assert.equal(mine.queues.find(item => item.id === queue.id)?.position, 2);
    assert.ok(mine.tasks.some(item => item.id === task.id));
    assert.ok(mine.registrations.some(item => item.id === registration.id));
    assert.ok(mine.rooms.some(item => item.id === room.id));
    const unrelated = await activitySnapshot({ id: outsiderId, role: "ADMIN" });
    assert.equal(unrelated.queues.length + unrelated.tasks.length + unrelated.registrations.length + unrelated.rooms.length, 0, "DB BASIC role and own filters prevent cross-account leakage");
    await db.communityTeamMember.delete({ where: { eventId_userId: { eventId: event.id, userId: participantId } } });
    assert.equal((await activitySnapshot(participant)).tasks.some(item => item.id === task.id), false, "revoked team member cannot see former task");
    for (const user of fixtureIds.map(id => ({ id, role: "BASIC" }))) {
      const snapshot = await activitySnapshot(user);
      for (const section of ["queues", "tasks", "registrations", "rooms"]) assert.ok(snapshot[section].length <= 20);
      for (const queue of snapshot.queues) assert.ok(await db.communityQueueTicket.findUnique({ where: { entryId_userId: { entryId: queue.id, userId: user.id } } }));
      for (const registration of snapshot.registrations) assert.equal((await db.eventRegistration.findUnique({ where: { id: registration.id }, select: { userId: true } })).userId, user.id);
      for (const room of snapshot.rooms) assert.ok(await db.friendsRoomMember.findUnique({ where: { roomId_userId: { roomId: room.id, userId: user.id } } }));
      for (const task of snapshot.tasks) assert.equal((await db.communityEntry.findUnique({ where: { id: task.id }, select: { data: true } })).data.assignedTo, user.id);
    }
    console.log("PASS activity database: isolated queue ordering, assigned tasks, future registrations, private rooms, current DB role, cross-account isolation and revoked team access");
  } finally {
    try { await db.user.deleteMany({ where: { id: { in: fixtureIds }, name: "Activity verification fixture" } }); }
    finally { await db.$disconnect(); }
  }
}
(process.argv.includes("--database") ? databaseReadCheck() : run()).catch(error => {
  if (process.argv.includes("--database")) console.error("Activity database read check failed. Check local database configuration and migrations.");
  else console.error(error);
  process.exitCode = 1;
});
