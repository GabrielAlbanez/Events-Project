const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), ts = require("typescript"), { randomUUID } = require("node:crypto");
let db;
const cache = new Map();
function load(filename) {
  filename = path.resolve(filename); if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const req = name => name === "@/lib/prisma" ? { __esModule: true, get default() { return db; } } : name.startsWith("@/") ? load(name.slice(2) + ".ts") : name.startsWith(".") ? load(path.resolve(path.dirname(filename), name) + ".ts") : require(name);
  new Function("require", "module", "exports", output)(req, module, module.exports); return module.exports;
}
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some(clause => matches(row, clause));
    if (key === "AND") return value.every(clause => matches(row, clause));
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if (key.includes("_") && !(key in row)) return matches(row, value);
      return Object.entries(value).every(([op, v]) => op === "in" ? v.includes(row[key]) : op === "not" ? row[key] !== v : op === "gte" ? row[key] >= v : op === "gt" ? row[key] > v : op === "lt" ? row[key] < v : false);
    }
    return row[key] === value;
  });
}
async function run() {
  const a = randomUUID(), b = randomUUID(), outsider = randomUUID(), eventId = randomUUID();
  const store = {}, queries = {};
  function table(name, rows = []) {
    store[name] = rows; queries[name] = 0;
    const list = args => {
      queries[name]++; let items = store[name].filter(row => matches(row, args?.where));
      if (args?.orderBy) { const [key, direction] = Object.entries(args.orderBy)[0]; items = items.sort((x, y) => (x[key] > y[key] ? 1 : x[key] < y[key] ? -1 : 0) * (direction === "asc" ? 1 : -1)); }
      return items.slice(0, args?.take ?? items.length);
    };
    return {
      findUnique: async args => { const row = list(args)[0] || null; return row && args.include?.match ? { ...row, match: store.partyMatch.find(m => m.id === row.matchId) } : row; },
      findFirst: async args => list(args)[0] || null, findMany: async args => list(args), count: async args => list(args).length,
      create: async args => { const row = { id: name === "partyMessage" ? store[name].length + 1 : randomUUID(), createdAt: new Date(), active: true, ...(name === "partyReport" ? { status: "PENDING" } : {}), ...args.data }; store[name].push(row); return row; },
      upsert: async args => { let row = list({ where: args.where })[0]; if (row) Object.assign(row, args.update); else { row = { id: randomUUID(), createdAt: new Date(), active: true, ...args.create }; store[name].push(row); } return row; },
      groupBy: async args => { const items = list(args); const counts = new Map(); for (const row of items) counts.set(row.matchId, (counts.get(row.matchId) || 0) + 1); return Array.from(counts, ([matchId, count]) => ({ matchId, _count: { _all: count } })); },
      updateMany: async args => { const rows = list(args); rows.forEach(row => Object.assign(row, args.data)); return { count: rows.length }; },
      deleteMany: async args => { const rows = list(args); store[name] = store[name].filter(row => !rows.includes(row)); return { count: rows.length }; },
    };
  }
  db = { $transaction: async work => work(db), $executeRaw: async () => 1 };
  db.user = table("user", [a, b, outsider].map(id => ({ id, role: id === outsider ? "ADMIN" : "BASIC" })));
  db.events = table("events", [{ id: eventId, nome: "Festa", status: "PUBLISHED" }]);
  db.eventRegistration = table("eventRegistration", [a, b].map(userId => ({ eventId, userId, status: "CONFIRMED" })));
  for (const name of ["partyProfile", "partyLike", "partyMatch", "partyBlock", "partyMessage", "partyReport", "notification", "communitySignal", "communityEntry"]) db[name] = table(name);
  const { privateControl } = load("lib/partyConnections/receipts.ts");
  const { connectionsAction } = load("lib/partyConnections/actions.ts"), { connectionsSnapshot } = load("lib/partyConnections/snapshot.ts"), { privateHistory, privateSend } = load("lib/partyConnections/messages.ts"), { partyReports, reviewPartyReport } = load("lib/partyConnections/reports.ts"), { compatible } = load("lib/partyConnections/access.ts"), { partyActionSchema } = load("schemas/partyConnections.ts");
  const actorA = { id: a, role: "BASIC" }, actorB = { id: b, role: "BASIC" }, admin = { id: outsider, role: "ADMIN" };
  const profile = { action: "profile.save", displayName: "Pessoa", photoUrl: "", bio: "Oi", interests: ["Música"], intent: "FRIENDSHIP", adultDeclared: false };
  assert.equal(partyActionSchema.safeParse({ ...profile, photoUrl: `/uploads/${randomUUID()}.webp` }).success, true);
  for (const photoUrl of ["/uploads/../.env", "/uploads/------------------------------------.jpg", "/uploads/photo.svg"]) assert.equal(partyActionSchema.safeParse({ ...profile, photoUrl }).success, false);
  for (const photoUrl of ["http://example.com/a", "https://user:password@example.com/a", "https://127.0.0.1/a", "https://localhost/a", "https://example.local/a"]) assert.equal(partyActionSchema.safeParse({ ...profile, photoUrl }).success, false);
  assert.equal(compatible({ intent: "UNKNOWN", adultDeclared: true }, profile), false);
  await assert.rejects(connectionsAction(eventId, admin, profile), e => e.status === 403);
  await assert.rejects(connectionsAction(eventId, actorA, { ...profile, intent: "DATING" }), e => e.status === 403);
  await connectionsAction(eventId, actorA, profile); await connectionsAction(eventId, actorB, { ...profile, intent: "COMPANY" });
  await connectionsAction(eventId, actorA, { action: "like", userId: b });
  assert.equal(store.partyMatch.length, 0); assert.equal(store.notification.length, 0);
  const before = await connectionsSnapshot(eventId, actorB); assert.equal(before.profiles[0].liked, false); assert.equal("adultDeclared" in before.profiles[0], false); assert.equal(JSON.stringify(before).includes("email"), false);
  await connectionsAction(eventId, actorB, { action: "like", userId: a }); await connectionsAction(eventId, actorA, { action: "like", userId: b });
  assert.equal(store.partyMatch.length, 1); assert.equal(store.notification.length, 2);
  const matchId = store.partyMatch[0].id, clientId = randomUUID();
  const sent = await privateSend(eventId, matchId, actorA, { clientId, text: "Olá" }); assert.equal(sent.duplicate, false);
  assert.ok(store.communitySignal.some(row => row.room === `user:${b}`), "conversation lists receive private message invalidations");
  assert.equal((await privateHistory(eventId, matchId, actorA, {})).event.partnerId, b);
  assert.equal((await privateHistory(eventId, matchId, actorB, {})).event.partnerId, a);
  assert.equal((await privateSend(eventId, matchId, actorA, { clientId, text: "Olá" })).duplicate, true); assert.equal(store.partyMessage.length, 1);
  await assert.rejects(privateHistory(eventId, matchId, admin, {}), e => e.status === 403);
  await assert.rejects(privateHistory(randomUUID(), matchId, actorB, {}), e => e.status === 403);
  await assert.rejects(privateSend(eventId, matchId, actorA, { clientId, text: "Outra" }), e => e.status === 409);
  await connectionsAction(eventId, actorB, { action: "report", userId: a, reason: "HARASSMENT", messageId: sent.message.id });
  await assert.rejects(partyReports(actorA), e => e.status === 403);
  const reports = await partyReports(admin); assert.equal(reports.reports[0].evidence, "Olá");
  await assert.rejects(connectionsAction(eventId, actorA, { action: "report", userId: b, reason: "OTHER", messageId: sent.message.id }), e => e.status === 403);
  await reviewPartyReport(admin, reports.reports[0].id, "DISMISSED"); assert.equal(store.partyReport[0].status, "DISMISSED");
  await connectionsAction(eventId, actorB, { action: "block", userId: a });
  assert.equal(store.partyMatch[0].active, false); assert.equal((await connectionsSnapshot(eventId, actorA)).profiles.length, 0);
  await assert.rejects(privateHistory(eventId, matchId, actorA, {}), e => e.status === 403);
  await assert.rejects(connectionsAction(eventId, actorA, { action: "like", userId: b }), e => e.status === 403);
  await connectionsAction(eventId, actorB, { action: "unblock", userId: a });
  assert.equal(store.partyMatch[0].active, false);
  await connectionsAction(eventId, actorA, { action: "like", userId: b }); await connectionsAction(eventId, actorB, { action: "like", userId: a });
  assert.equal(store.partyMatch.length, 1); assert.equal(store.partyMatch[0].active, true);
  const receiptMessage = await privateSend(eventId, matchId, actorA, { clientId: randomUUID(), text: "Confirmacao privada" });
  await assert.rejects(privateControl(eventId, matchId, admin, { action: "typing", active: true }), e => e.status === 403);
  await assert.rejects(privateControl(randomUUID(), matchId, actorB, { action: "typing", active: true }), e => e.status === 403);
  assert.equal((await connectionsSnapshot(eventId, actorB)).matches[0].unreadCount, 2);
  await privateControl(eventId, matchId, actorB, { action: "receipt", messageId: receiptMessage.message.id, read: true });
  assert.equal((await privateHistory(eventId, matchId, actorA, {})).partnerReceipt.readThrough, receiptMessage.message.id);
  assert.equal((await connectionsSnapshot(eventId, actorB)).matches[0].unreadCount, 0);
  await privateControl(eventId, matchId, actorB, { action: "receipt", messageId: sent.message.id, read: true });
  assert.equal((await privateHistory(eventId, matchId, actorA, {})).partnerReceipt.readThrough, receiptMessage.message.id, "late receipts never roll back the read cursor");
  await assert.rejects(privateControl(eventId, matchId, actorB, { action: "receipt", messageId: 987654, read: true }), e => e.status === 400);
  await privateControl(eventId, matchId, actorB, { action: "typing", active: true });
  assert.ok((await privateHistory(eventId, matchId, actorA, {})).partnerReceipt.typingUntil > Date.now());
  await privateControl(eventId, matchId, actorB, { action: "typing", active: false });
  assert.equal((await privateHistory(eventId, matchId, actorA, {})).partnerReceipt.typingUntil, 0);
  await assert.rejects(privateControl(eventId, matchId, actorA, { action: "receipt", messageId: receiptMessage.message.id, read: true }), e => e.status === 400);
  store.eventRegistration.find(row => row.userId === a).status = "CANCELLED";
  await assert.rejects(privateControl(eventId, matchId, actorB, { action: "typing", active: true }), e => e.status === 403);
  await assert.rejects(privateControl(eventId, matchId, actorB, { action: "receipt", messageId: receiptMessage.message.id, read: true }), e => e.status === 403);
  await assert.rejects(privateHistory(eventId, matchId, actorB, {}), e => e.status === 403);
  assert.equal((await connectionsSnapshot(eventId, actorB)).profiles.length, 0);
  await connectionsAction(eventId, actorA, { action: "profile.leave" }); assert.equal(store.partyLike.length, 0); assert.equal(store.partyProfile.find(row => row.userId === a).active, false);
  store.eventRegistration.find(row => row.userId === a).status = "CHECKED_IN";
  await connectionsAction(eventId, actorA, { ...profile, intent: "DATING", adultDeclared: true });
  assert.equal((await connectionsSnapshot(eventId, actorA)).profiles.length, 0);
  await connectionsAction(eventId, actorB, { ...profile, intent: "DATING", adultDeclared: true });
  const countsBefore = { ...queries }; const snapshot = await connectionsSnapshot(eventId, actorA);
  assert.equal(snapshot.profiles.length, 1); assert.equal(snapshot.mine.adultDeclared, true);
  assert.equal("adultDeclared" in snapshot.profiles[0], false);
  const queryCount = Object.keys(queries).reduce((sum, name) => sum + queries[name] - countsBefore[name], 0); assert.ok(queryCount <= 13, `Snapshot query bound: ${queryCount}`);
  await connectionsAction(eventId, actorA, { action: "like", userId: b }); await connectionsAction(eventId, actorB, { action: "like", userId: a });
  store.partyMessage = [];
  for (let i = 1; i <= 125; i++) store.partyMessage.push({ id: i, matchId, authorId: a, clientId: randomUUID(), text: `Mensagem ${i}`, createdAt: new Date(0) });
  const latest = await privateHistory(eventId, matchId, actorB, {}); assert.equal(latest.messages[0].id, 76); assert.equal(latest.nextBefore, 76); assert.equal(latest.messages[0].own, false);
  const reconnect = await privateHistory(eventId, matchId, actorB, { after: 10 }); assert.equal(reconnect.messages[0].id, 11); assert.equal(reconnect.messages.at(-1).id, 60); assert.equal(reconnect.hasMore, true);
  for (let i = 0; i < 10; i++) await privateSend(eventId, matchId, actorA, { clientId: randomUUID(), text: `Agora ${i}` });
  await assert.rejects(privateSend(eventId, matchId, actorA, { clientId: randomUUID(), text: "Limite" }), e => e.status === 429);
  store.events[0].status = "DRAFT"; await assert.rejects(connectionsSnapshot(eventId, actorA), e => e.status === 404);
  console.log("PASS party connections: opt-in, participant-only/admin exclusion, private likes, mutual match idempotency, explicit adult declaration, blocking/unblocking, opt-out after revocation, cross-event DM denial, deduplicated send, evidence-only/admin review and bounded bulk snapshot (mock persistence)");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
