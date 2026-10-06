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
  const { eventChatSendSchema, eventChatHistorySchema } = load("schemas/eventChat.ts");
  const clientId = randomUUID();
  assert.equal(eventChatSendSchema.safeParse({ clientId, text: " " }).success, false);
  assert.equal(eventChatSendSchema.safeParse({ clientId, text: "x".repeat(1001) }).success, false);
  assert.equal(eventChatSendSchema.safeParse({ clientId, text: "Olá\u0000" }).success, false);
  assert.equal(eventChatHistorySchema.safeParse({ before: 1, after: 2 }).success, false);
  assert.equal(eventChatHistorySchema.safeParse({ before: 0 }).success, false);
  assert.equal(eventChatSendSchema.parse({ clientId, text: " Olá " }).text, "Olá");
  const userId = randomUUID(), eventId = randomUUID(), ownerId = randomUUID();
  let role = "BASIC", status = "CONFIRMED", eventStatus = "PUBLISHED", alive = true, locks = 0, signals = 0;
  const messages = [];
  db = {
    $transaction: async work => work(db),
    $executeRaw: async (strings, id) => { assert.equal(id, eventId); assert.match(strings.join("?"), /pg_advisory_xact_lock/); locks++; return 1; },
    user: { findUnique: async () => alive ? { id: userId, role } : null },
    events: { findUnique: async args => args.where.id === eventId ? { id: eventId, nome: "Festa", userId: ownerId, status: eventStatus } : null },
    eventRegistration: { findUnique: async args => { assert.equal(args.where.eventId_userId.eventId, eventId); return status ? { status } : null; } },
    communitySignal: { create: async args => { assert.equal(args.data.room, `chat:${eventId}`); signals++; } },
    eventChatMessage: {
      findUnique: async args => { const key = args.where.eventId_authorId_clientId; return messages.find(m => m.eventId === key.eventId && m.authorId === key.authorId && m.clientId === key.clientId) || null; },
      count: async args => messages.filter(m => m.authorId === args.where.authorId && m.createdAt >= args.where.createdAt.gte).length,
      create: async args => { const row = { ...args.data, id: messages.length + 1, createdAt: new Date(), author: { id: userId, name: "Pessoa", image: null } }; messages.push(row); return row; },
      findMany: async args => {
        assert.deepEqual(args.include.author.select, { id: true, name: true, image: true });
        return messages.filter(m => m.eventId === args.where.eventId && (!args.where.id || (args.where.id.gt ? m.id > args.where.id.gt : m.id < args.where.id.lt))).sort((a, b) => args.orderBy.id === "asc" ? a.id - b.id : b.id - a.id).slice(0, args.take);
      },
    },
  };
  const { eventChatAccess } = load("lib/eventChat/access.ts");
  const { chatHistory, sendChatMessage } = load("lib/eventChat/service.ts");
  const actor = { id: userId, role: "ADMIN" };
  await assert.rejects(eventChatAccess(db, eventId, null), e => e.status === 401);
  for (const denied of [null, "CANCELLED", "WAITLISTED"]) { status = denied; await assert.rejects(eventChatAccess(db, eventId, actor), e => e.status === 403); }
  for (const allowed of ["CONFIRMED", "CHECKED_IN"]) { status = allowed; await eventChatAccess(db, eventId, actor); }
  eventStatus = "CANCELLED"; await assert.rejects(chatHistory(eventId, actor, {}), e => e.status === 403);
  role = "ADMIN"; await eventChatAccess(db, eventId, actor); role = "BASIC"; eventStatus = "PUBLISHED";
  const originalEventLookup = db.events.findUnique;
  db.events.findUnique = async () => ({ id: eventId, nome: "Festa", userId, status: "DRAFT" });
  status = null; await eventChatAccess(db, eventId, actor);
  db.events.findUnique = originalEventLookup; status = "CONFIRMED";
  await assert.rejects(chatHistory(randomUUID(), actor, {}), e => e.status === 404);
  const first = await sendChatMessage(eventId, actor, { clientId, text: "Olá" });
  assert.equal(first.duplicate, false); assert.equal(first.message.own, true); assert.equal("email" in first.message.author, false);
  const retry = await sendChatMessage(eventId, actor, { clientId, text: "Olá" });
  assert.equal(retry.message.id, first.message.id); assert.equal(retry.duplicate, true); assert.equal(signals, 1);
  await assert.rejects(sendChatMessage(eventId, actor, { clientId, text: "Outra" }), e => e.status === 409);
  status = "CANCELLED"; await assert.rejects(sendChatMessage(eventId, actor, { clientId, text: "Olá" }), e => e.status === 403); status = "CONFIRMED";
  for (let i = 0; i < 9; i++) await sendChatMessage(eventId, actor, { clientId: randomUUID(), text: `Msg ${i}` });
  await assert.rejects(sendChatMessage(eventId, actor, { clientId: randomUUID(), text: "Limite" }), e => e.status === 429);
  assert.ok(locks >= 13);
  messages.splice(0);
  for (let i = 0; i < 60; i++) messages.push({ authorId: userId, createdAt: new Date(Date.now() - 20000) });
  await assert.rejects(sendChatMessage(eventId, actor, { clientId: randomUUID(), text: "Minuto" }), e => e.status === 429);
  messages.splice(0);
  for (let i = 1; i <= 125; i++) messages.push({ id: i, eventId, authorId: userId, clientId: randomUUID(), text: `Mensagem ${i}`, createdAt: new Date(0), author: { id: userId, name: "Pessoa", image: null } });
  const latest = await chatHistory(eventId, actor, {});
  assert.equal(latest.messages[0].id, 76); assert.equal(latest.messages.at(-1).id, 125); assert.equal(latest.nextBefore, 76); assert.equal(latest.hasMore, true);
  const older = await chatHistory(eventId, actor, { before: latest.nextBefore });
  assert.equal(older.messages[0].id, 26); assert.equal(older.messages.at(-1).id, 75);
  const oldest = await chatHistory(eventId, actor, { before: older.nextBefore });
  assert.equal(oldest.messages.length, 25); assert.equal(oldest.hasMore, false);
  const reconnect1 = await chatHistory(eventId, actor, { after: 10 });
  assert.equal(reconnect1.messages[0].id, 11); assert.equal(reconnect1.messages.at(-1).id, 60); assert.equal(reconnect1.hasMore, true);
  const reconnect2 = await chatHistory(eventId, actor, { after: 60 });
  assert.equal(reconnect2.messages.at(-1).id, 110);
  const reconnect3 = await chatHistory(eventId, actor, { after: 110 }); assert.equal(reconnect3.messages.length, 15); assert.equal(reconnect3.hasMore, false);
  alive = false; await assert.rejects(chatHistory(eventId, actor, {}), e => e.status === 401);
  console.log("PASS event chat: bounded input, current DB authorization/revocation, private projection, idempotency, parameterized event lock, rate limit, stable history pages and reconnect drain (mock persistence; no database concurrency execution)");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
