const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { randomUUID } = require("node:crypto");
const cache = new Map();
let database = null;

function load(relative) {
  const filename = path.resolve(relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
  } }).outputText;
  const localRequire = name => {
    if (name === "@/lib/prisma") return { __esModule: true, default: database };
    if (name.startsWith("@/")) return load(name.slice(2) + ".ts");
    if (name.startsWith(".")) return load(path.join(path.dirname(filename), name + ".ts"));
    return require(name);
  };
  new Function("require", "module", "exports", source)(localRequire, module, module.exports);
  return module.exports;
}

async function run() {
  const policy = load("lib/authPolicy.ts");
  assert.equal(policy.isPublicPath("/eventos/test/comunidade"), true);
  assert.equal(policy.isPublicPath("/eventos/test/editar"), false);
  for (const role of ["ADMIN", "PROMOTER", "BASIC"]) {
    assert.equal(policy.canAccessPath(role, "/salas"), true);
    assert.equal(policy.canAccessPath(role, "/salas/test"), true);
  }
  assert.equal(policy.canAccessPath("GUEST", "/salas/test"), false);
  assert.equal(policy.canAccessPath("BASIC", "/salas/test/private/deeper"), false);
  let rooms = load("lib/community/rooms.ts");
  const actor = { id: randomUUID(), role: "BASIC" };
  const badRequest = error => error.status === 400;
  await assert.rejects(rooms.createRoom(actor, { action: "room.create", name: " " }), badRequest);
  await assert.rejects(rooms.mutateRoom(randomUUID(), actor, { action: "suggestion.vote", suggestionId: randomUUID(), voted: "true" }), badRequest);
  await assert.rejects(rooms.getRoom("invalid", actor), error => error.status === 404);
  console.log("PASS: community route access and room input validation before persistence");
  const memberId = randomUUID(), roomId = randomUUID();
  const memberships = new Set([actor.id]);
  const notices = [], signals = [];
  database = {
    $transaction: async work => work(database),
    friendsRoom: { findUnique: async () => ({ id: roomId, name: "Private test room", ownerId: actor.id, members: [{ userId: actor.id }] }) },
    user: { findFirst: async args => { assert.equal(args.where.email.mode, "insensitive"); return { id: memberId, emailVerified: true }; } },
    friendsRoomMember: {
      findUnique: async args => memberships.has(args.where.roomId_userId.userId) ? { userId: args.where.roomId_userId.userId } : null,
      count: async () => memberships.size,
      create: async args => { memberships.add(args.data.userId); },
    },
    notification: { create: async args => { notices.push(args.data); } },
    communitySignal: { create: async args => { signals.push(args.data.room); } },
  };
  cache.clear(); rooms = load("lib/community/rooms.ts");
  for (let attempt = 0; attempt < 2; attempt++) await rooms.mutateRoom(roomId, actor, { action: "member.add", email: "MEMBER@example.invalid" });
  assert.equal(notices.length, 1);
  assert.equal(notices[0].userId, memberId);
  assert.equal(notices[0].href, "/salas/" + roomId);
  assert.ok(signals.includes("user:" + memberId));
  assert.ok(signals.includes("friends:" + roomId));
  await assert.rejects(rooms.mutateRoom(roomId, { id: memberId, role: "BASIC" }, { action: "member.add", email: "other@example.invalid" }), error => error.status === 403);
  console.log("PASS: room invitation notification is private, transactional and not duplicated for an existing member");
  if (process.env.FEATURE_TEST_DATABASE !== "true") return;

  require("@next/env").loadEnvConfig(process.cwd());
  const { PrismaClient } = require("@prisma/client");
  database = new PrismaClient();
  cache.clear();
  rooms = load("lib/community/rooms.ts");
  const users = [], eventIds = [], roomIds = [];
  try {
    const prefix = "room-test-" + randomUUID();
    for (let i = 0; i < 3; i++) users.push(await database.user.create({ data: {
      name: "Room Test " + i, email: prefix + "-" + i + "@example.invalid", emailVerified: true,
    } }));
    const [owner, member, outsider] = users;
    const published = await database.events.create({ data: {
      nome: "Room Test Event", descricao: "Test fixture", banner: "", carrossel: [], endereco: "Test",
      dataInicio: "2030-01-01", dataFim: "2030-01-01", linkParaCompra: "", userId: owner.id, status: "PUBLISHED",
    } });
    eventIds.push(published.id);
    const draft = await database.events.create({ data: {
      nome: "Private Test Event", descricao: "Test fixture", banner: "", carrossel: [], endereco: "Test",
      dataInicio: "2030-01-01", dataFim: "2030-01-01", linkParaCompra: "", userId: owner.id, status: "DRAFT",
    } });
    eventIds.push(draft.id);
    const room = await rooms.createRoom(owner, { action: "room.create", name: "Amigos de teste" });
    roomIds.push(room.id);
    await assert.rejects(rooms.getRoom(room.id, outsider), error => error.status === 404);
    await rooms.mutateRoom(room.id, owner, { action: "member.add", email: member.email });
    await rooms.mutateRoom(room.id, owner, { action: "member.add", email: member.email });
    assert.equal(await database.notification.count({ where: { userId: member.id, href: "/salas/" + room.id } }), 1);
    await assert.rejects(rooms.mutateRoom(room.id, member, { action: "member.add", email: outsider.email }), error => error.status === 403);
    await assert.rejects(rooms.mutateRoom(room.id, member, { action: "suggestion.add", eventId: draft.id }), error => error.status === 404);
    await rooms.mutateRoom(room.id, member, { action: "suggestion.add", eventId: published.id });
    await rooms.mutateRoom(room.id, owner, { action: "suggestion.add", eventId: published.id });
    let snapshot = await rooms.getRoom(room.id, member);
    assert.equal(snapshot.suggestions.length, 1);
    assert.equal(snapshot.availableEvents.some(event => event.id === draft.id), false);
    assert.equal(snapshot.members.some(user => "email" in user || "password" in user), false);
    const suggestionId = snapshot.suggestions[0].id;
    await Promise.all([1, 2].map(() => rooms.mutateRoom(room.id, member, { action: "suggestion.vote", suggestionId, voted: true })));
    snapshot = await rooms.getRoom(room.id, member);
    assert.equal(snapshot.suggestions[0].votes, 1);
    assert.equal(snapshot.suggestions[0].mine, true);
    await rooms.mutateRoom(room.id, owner, { action: "member.remove", userId: member.id });
    await assert.rejects(rooms.getRoom(room.id, member), error => error.status === 404);
    await assert.rejects(rooms.mutateRoom(room.id, member, { action: "suggestion.vote", suggestionId, voted: true }), error => error.status === 404);
    assert.equal((await rooms.getRoom(room.id, owner)).suggestions[0].votes, 0);
    assert.ok(await database.communitySignal.count({ where: { room: "friends:" + room.id } }) > 0);
    console.log("PASS: persisted rooms, owner permissions, private membership, published suggestions, concurrent unique vote, removal and outbox");
  } finally {
    await database.communitySignal.deleteMany({ where: { room: { in: [...roomIds.map(id => "friends:" + id), ...users.map(user => "user:" + user.id)] } } });
    await database.friendsRoom.deleteMany({ where: { id: { in: roomIds } } });
    await database.events.deleteMany({ where: { id: { in: eventIds } } });
    await database.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
    await database.$disconnect();
  }
}

run().catch(error => { console.error("FAIL: friends rooms verification (" + (error.code || error.name || "error") + ")"); process.exitCode = 1; });
