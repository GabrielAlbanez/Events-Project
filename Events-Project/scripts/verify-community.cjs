const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { randomUUID } = require("node:crypto");
let db;
const cache = new Map();
function load(filename) {
  filename = path.resolve(filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const localRequire = name => {
    if (name === "@/lib/prisma") return { __esModule: true, get default() { return db; } };
    if (name.startsWith("@/")) return load(name.slice(2) + ".ts");
    if (name.startsWith(".")) return load(path.resolve(path.dirname(filename), name) + ".ts");
    return require(name);
  };
  new Function("require", "module", "exports", output)(localRequire, module, module.exports);
  return module.exports;
}
async function run() {
  const { communityActionSchema: schema } = load("schemas/community.ts");
  assert.equal(schema.safeParse({ action: "poll.create", title: "Escolha", options: ["A", "A"] }).success, false);
  assert.equal(schema.safeParse({ action: "poll.vote", id: randomUUID(), option: -1 }).success, false);
  assert.equal(schema.safeParse({ action: "feedback.save", rating: 6 }).success, false);
  assert.equal(schema.safeParse({ action: "program.save", title: "Show", startsAt: "2026-01-01T15:00:00-03:00" }).success, true);
  assert.equal(schema.safeParse({ action: "question.ask", text: " ".repeat(10) }).success, false);
  const { NextRequest } = require("next/server");
  const { checkOrigin, readCommunityBody, communityError } = load("lib/community/http.ts");
  assert.throws(() => checkOrigin(new NextRequest("http://localhost:3000", { headers: { origin: "https://foreign.invalid" } })), error => error.status === 403);
  await assert.rejects(readCommunityBody(new NextRequest("http://localhost:3000", { method: "POST", body: "bad" })), error => error.status === 400);
  await assert.rejects(readCommunityBody(new NextRequest("http://localhost:3000", { method: "POST", body: "x".repeat(16001) })), error => error.status === 413);
  assert.equal(communityError(new Error("private secret")).status, 500);
  console.log("PASS community: input bounds, unique options, ratings, origin, malformed JSON and streamed body limits");
  const actorId = randomUUID(), mockEventId = randomUUID();
  const { eventSnapshot: mockSnapshot } = load("lib/community/events.ts");
  db = {
    $transaction: async work => work(db),
    user: { findUnique: async () => ({ id: actorId, role: "BASIC" }) },
    events: { findUnique: async () => ({ id: mockEventId, nome: "Mock event", userId: "other", status: "PUBLISHED", dataFim: "2026-01-01", timezone: "America/Sao_Paulo", endTime: null }) },
    communityTeamMember: { findUnique: async () => ({ userId: actorId }), findMany: async () => [] },
    eventRegistration: { findUnique: async () => null },
    communityEntry: { findMany: async args => {
      assert.deepEqual(args.include.votes.where, { userId: actorId }); assert.deepEqual(args.include.tickets.where, { userId: actorId });
      return [
        { id: "p1", kind: "program", data: { title: "Late", startsAt: "2026-01-01T12:00:00Z" }, votes: [], tickets: [], claims: [] },
        { id: "p2", kind: "program", data: { title: "Early", startsAt: "2026-01-01T13:00:00+03:00" }, votes: [], tickets: [], claims: [] },
        { id: "poll", kind: "poll", data: { title: "Choice", options: ["A", "B"] }, votes: [{ option: 1 }], tickets: [], claims: [] },
        { id: "queue", kind: "queue", data: { title: "Line" }, votes: [], tickets: [{ id: "mine", createdAt: new Date(), status: "WAITING" }], claims: [] },
        { id: "notice", kind: "announcement", createdAt: new Date("2026-01-01"), data: { title: "Official", message: "Welcome", archived: false }, votes: [], tickets: [], claims: [] },
        { id: "archived", kind: "announcement", createdAt: new Date("2026-01-01"), data: { title: "Old", message: "Old message", archived: true }, votes: [], tickets: [], claims: [] },
      ];
    } },
    communityVote: { groupBy: async () => [{ entryId: "poll", option: 0, _count: 80 }, { entryId: "poll", option: 1, _count: 20 }] },
    communityQueueTicket: { groupBy: async () => [{ entryId: "queue", _count: 50 }], count: async () => 2 },
    communityFeedback: { aggregate: async () => ({ _avg: { rating: 4 }, _count: 200 }), findUnique: async () => null, findMany: async () => { throw new Error("Collaborator must not read private comments"); } },
  };
  const mock = await mockSnapshot(mockEventId, { id: actorId, role: "ADMIN" });
  assert.equal(mock.permissions.manage, false); assert.equal(mock.feedback.comments.length, 0); assert.equal(mock.feedback.count, 200);
  assert.equal(mock.program[0].title, "Early"); assert.deepEqual(mock.polls[0].counts, [80, 20]); assert.equal(mock.queues[0].waiting, 50); assert.equal(mock.queues[0].mine.position, 3);
  assert.equal(mock.queues[0].state, "OPEN"); assert.equal(mock.announcements.length, 1); assert.equal(mock.announcements[0].createdAt, "2026-01-01T00:00:00.000Z");
  db.user.findUnique = async () => ({ id: actorId, role: "ADMIN" }); db.communityFeedback.findMany = async () => [];
  assert.equal((await mockSnapshot(mockEventId, { id: actorId, role: "ADMIN" })).announcements.length, 2);
  console.log("PASS community: snapshot rechecks roles, limits private comments, orders timezone offsets and reads aggregate votes/queue positions");
  const { handleAnnouncement } = load("lib/community/announcements.ts");
  const { handleQueue, queueState } = load("lib/community/queues.ts");
  const { notifyQuestionAnswer, notifyTaskHelp, notifyCommunityUser } = load("lib/community/notifications.ts");
  const changes = [], notices = [], signals = [], entryId = randomUUID();
  let state;
  const entries = {
    find: async () => ({ id: entryId, data: { title: "Workshop", state } }),
    create: async (kind, fields) => changes.push({ kind, fields }),
    update: async (id, kind, fields) => { changes.push({ id, kind, fields }); if (kind === "queue") state = fields.state; },
  };
  const tx = {
    user: { findUnique: async ({ where }) => where.id === "deleted" ? null : ({ id: where.id }) },
    notification: { create: async ({ data }) => notices.push(data) },
    communitySignal: { create: async ({ data }) => signals.push(data.room) },
    communityQueueTicket: { findUnique: async () => null, count: async () => 0, upsert: async () => changes.push({ join: true }), updateMany: async () => changes.push({ next: true }), findFirst: async () => null },
  };
  await assert.rejects(handleAnnouncement(schema.parse({ action: "announcement.publish", title: "A", message: "B" }), entries, false), error => error.status === 403);
  await handleAnnouncement(schema.parse({ action: "announcement.publish", title: "A", message: "B" }), entries, true);
  assert.deepEqual(changes.pop(), { kind: "announcement", fields: { title: "A", message: "B", archived: false } });
  await handleAnnouncement(schema.parse({ action: "announcement.archive", id: entryId }), entries, true);
  assert.equal(changes.pop().fields.archived, true);
  assert.equal(queueState(undefined), "OPEN");
  await handleQueue(schema.parse({ action: "queue.join", id: entryId }), tx, entries, mockEventId, actorId, { manage: false, team: false });
  assert.equal(changes.pop().join, true);
  await assert.rejects(handleQueue(schema.parse({ action: "queue.control", id: entryId, state: "PAUSED" }), tx, entries, mockEventId, actorId, { manage: false, team: false }), error => error.status === 403);
  await handleQueue(schema.parse({ action: "queue.control", id: entryId, state: "PAUSED" }), tx, entries, mockEventId, actorId, { manage: false, team: true });
  await assert.rejects(handleQueue(schema.parse({ action: "queue.join", id: entryId }), tx, entries, mockEventId, actorId, { manage: false, team: false }), error => error.status === 409);
  await handleQueue(schema.parse({ action: "queue.next", id: entryId }), tx, entries, mockEventId, actorId, { manage: false, team: true });
  state = "CLOSED";
  await assert.rejects(handleQueue(schema.parse({ action: "queue.next", id: entryId }), tx, entries, mockEventId, actorId, { manage: true, team: true }), error => error.status === 409);
  await handleQueue(schema.parse({ action: "queue.leave", id: entryId }), tx, entries, mockEventId, actorId, { manage: false, team: false });
  await notifyQuestionAnswer(tx, mockEventId, actorId, "Same", "Same"); assert.equal(notices.length, 0);
  await notifyQuestionAnswer(tx, mockEventId, actorId, "", "Answer"); assert.equal(notices.length, 1);
  await notifyTaskHelp(tx, mockEventId, "owner", "HELP", "HELP", "Task"); assert.equal(notices.length, 1);
  await notifyTaskHelp(tx, mockEventId, "owner", "TODO", "HELP", "Task"); assert.equal(notices.length, 2);
  await notifyCommunityUser(tx, mockEventId, "deleted", "Notice", "Text"); await notifyTaskHelp(tx, mockEventId, null, "TODO", "HELP", "Task"); assert.equal(notices.length, 2);
  assert.deepEqual(signals, [`user:${actorId}`, "user:owner"]); assert.equal(notices[0].href, `/eventos/${mockEventId}/comunidade`);
  console.log("PASS community: official notice permissions/archive visibility, legacy/open/paused/closed queues and private notification deduplication/deleted recipients");
  if (process.env.FEATURE_TEST_DATABASE !== "true") return;
  require("@next/env").loadEnvConfig(process.cwd());
  const { PrismaClient } = require("@prisma/client"); db = new PrismaClient();
  const userIds = [], eventIds = [];
  const prefix = "community-test-" + randomUUID();
  let phase = "fixtures";
  try {
    const users = [];
    for (const role of ["PROMOTER", "BASIC", "BASIC", "BASIC"]) { const user = await db.user.create({ data: { email: `${prefix}-${users.length}@example.invalid`, name: "Community Test", role } }); users.push(user); userIds.push(user.id); }
    const [owner, first, second, colleague] = users;
    const event = await db.events.create({ data: { nome: "Community Test", banner: "", carrossel: [], descricao: "Temporary test", dataInicio: "2026-01-01", dataFim: "2026-01-01", endereco: "Test", linkParaCompra: "", userId: owner.id, status: "PUBLISHED", validate: true } }); eventIds.push(event.id);
    const { eventSnapshot, mutateEvent } = load("lib/community/events.ts");
    const mutate = (actor, action) => mutateEvent(event.id, actor, schema.parse(action));
    phase = "authorization";
    await assert.rejects(mutate(first, { action: "poll.create", title: "Question", options: ["A", "B"] }), error => error.status === 403);
    await mutate(first, { action: "question.ask", text: "How?" });
    let snapshot = await eventSnapshot(event.id, null); assert.equal(snapshot.questions.length, 1);
    await mutate(owner, { action: "question.answer", id: snapshot.questions[0].id, answer: "Here", highlighted: true });
    phase = "poll concurrency";
    await mutate(owner, { action: "poll.create", title: "Choice", options: ["A", "B"] });
    const poll = (await eventSnapshot(event.id, first)).polls[0];
    const votes = await Promise.allSettled([mutate(first, { action: "poll.vote", id: poll.id, option: 0 }), mutate(first, { action: "poll.vote", id: poll.id, option: 1 })]);
    assert.equal(votes.filter(result => result.status === "fulfilled").length, 1);
    assert.equal((await eventSnapshot(event.id, first)).polls[0].counts.reduce((a, b) => a + b, 0), 1);
    phase = "queue concurrency";
    await mutate(owner, { action: "queue.create", title: "Workshop" });
    const queue = (await eventSnapshot(event.id, first)).queues[0];
    await mutate(first, { action: "queue.join", id: queue.id }); await mutate(second, { action: "queue.join", id: queue.id });
    await Promise.all([mutate(owner, { action: "queue.next", id: queue.id }), mutate(owner, { action: "queue.next", id: queue.id })]);
    assert.equal(await db.communityQueueTicket.count({ where: { entryId: queue.id, status: "CALLED" } }), 1);
    assert.equal(await db.notification.count({ where: { userId: { in: [first.id, second.id] }, title: "Chegou sua vez" } }), 2);
    phase = "team tasks";
    await mutate(owner, { action: "team.add", email: colleague.email });
    await mutate(owner, { action: "task.create", title: "Receive", assignedTo: colleague.id });
    const task = (await eventSnapshot(event.id, colleague)).tasks[0];
    await mutate(colleague, { action: "task.update", id: task.id, status: "HELP" });
    assert.equal((await eventSnapshot(event.id, first)).tasks.length, 0);
    await mutate(owner, { action: "team.remove", userId: colleague.id });
    await assert.rejects(mutate(colleague, { action: "task.update", id: task.id, status: "DONE" }), error => error.status === 403);
    phase = "program and claim privacy";
    await mutate(owner, { action: "program.save", title: "Opening", startsAt: "2026-01-01T12:00:00Z" });
    const program = (await eventSnapshot(event.id, owner)).program[0]; await mutate(owner, { action: "program.status", id: program.id, status: "LIVE" });
    await mutate(owner, { action: "program.save", title: "Earlier UTC", startsAt: "2026-01-01T13:00:00+03:00" });
    assert.equal((await eventSnapshot(event.id, first)).program[0].title, "Earlier UTC");
    await mutate(owner, { action: "program.update", id: program.id, title: "Updated opening", startsAt: "2026-01-01T14:00:00Z" });
    await mutate(owner, { action: "lost.create", title: "Bag", description: "A bag" });
    const item = (await eventSnapshot(event.id, first)).lostItems[0]; await mutate(first, { action: "lost.claim", id: item.id, message: "Private identifying detail" });
    assert.equal((await eventSnapshot(event.id, second)).lostItems[0].claims.length, 0);
    assert.equal((await eventSnapshot(event.id, null)).lostItems[0].claims.length, 0);
    const claim = (await eventSnapshot(event.id, owner)).lostItems[0].claims[0]; await mutate(owner, { action: "lost.resolve", claimId: claim.id });
    phase = "feedback eligibility";
    await assert.rejects(mutate(first, { action: "feedback.save", rating: 5, comment: "Great" }), error => error.status === 403);
    await db.eventRegistration.create({ data: { eventId: event.id, userId: first.id, status: "WAITLISTED" } });
    await assert.rejects(mutate(first, { action: "feedback.save", rating: 5 }), error => error.status === 403);
    await db.eventRegistration.update({ where: { eventId_userId: { eventId: event.id, userId: first.id } }, data: { status: "CONFIRMED" } });
    await mutate(first, { action: "feedback.save", rating: 5, comment: "Great" });
    assert.equal((await eventSnapshot(event.id, owner)).feedback.average, 5);
    assert.equal((await eventSnapshot(event.id, second)).feedback.comments.length, 0);
    await mutate(owner, { action: "team.add", email: colleague.email });
    const teamFeedback = (await eventSnapshot(event.id, colleague)).feedback;
    assert.equal(teamFeedback.average, 5); assert.equal(teamFeedback.comments.length, 0);
    phase = "private event"; await db.events.update({ where: { id: event.id }, data: { status: "DRAFT" } });
    await assert.rejects(eventSnapshot(event.id, first), error => error.status === 404);
    assert.equal((await eventSnapshot(event.id, owner)).permissions.manage, true);
    assert.equal((await eventSnapshot(event.id, owner)).feedback.eligible, false);
    console.log("PASS community database: permissions, questions, concurrent unique voting, serial queue advancement, notifications, team revocation, program, claim privacy and participant feedback");
  } catch (error) { console.error(`FAIL community database at ${phase}: ${error.code || error.name}`); throw new Error("Community database verification failed"); }
  finally {
    await db.communitySignal.deleteMany({ where: { room: { in: [...eventIds.map(id => `event:${id}`), ...userIds.map(id => `user:${id}`)] } } });
    await db.events.deleteMany({ where: { id: { in: eventIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  }
}
run().catch(() => { process.exitCode = 1; });
