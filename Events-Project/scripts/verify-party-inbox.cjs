// Global conversations inbox and new-message notifications, against mocked Prisma persistence.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), ts = require("typescript"), { randomUUID } = require("node:crypto");
let db;
const cache = new Map();
function load(filename) {
  filename = path.resolve(filename); if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const req = name => name === "@/lib/prisma" ? { __esModule: true, get default() { return db; } } : name.includes("notifications/") ? require("./load-notification-module.cjs")(name) : name.startsWith("@/") ? load(name.slice(2) + ".ts") : name.startsWith(".") ? load(path.resolve(path.dirname(filename), name) + ".ts") : require(name);
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
const store = {}, queries = {};
function table(name, rows = []) {
  store[name] = rows; queries[name] = 0;
  const list = args => {
    queries[name]++; let items = store[name].filter(row => matches(row, args?.where));
    if (args?.orderBy) { const [key, direction] = Object.entries(args.orderBy)[0]; items = items.sort((x, y) => (x[key] > y[key] ? 1 : x[key] < y[key] ? -1 : 0) * (direction === "asc" ? 1 : -1)); }
    return items.slice(0, args?.take ?? items.length);
  };
  return {
    findUnique: async args => list(args)[0] || null, findFirst: async args => list(args)[0] || null, findMany: async args => list(args), count: async args => list(args).length,
    create: async args => { const row = { id: name === "partyMessage" ? Math.max(0, ...store[name].map(item => item.id)) + 1 : randomUUID(), createdAt: new Date(), ...(name === "notification" ? { readAt: null } : {}), ...args.data }; store[name].push(row); return row; },
    createMany: async args => { for (const data of args.data) store[name].push({ id: randomUUID(), createdAt: new Date(), ...data }); return { count: args.data.length }; },
    groupBy: async args => { const groups = new Map(); for (const row of list(args)) { const group = groups.get(row.matchId) || { count: 0, id: null }; group.count++; group.id = Math.max(group.id ?? 0, row.id); groups.set(row.matchId, group); } return Array.from(groups, ([matchId, group]) => ({ matchId, _count: { _all: group.count }, _max: { id: group.id } })); },
  };
}
async function run() {
  const me = randomUUID(), [ana, bia, blockedUser, gone, unregistered, dating, stranger, removedAccount] = Array.from({ length: 8 }, () => randomUUID());
  const e1 = randomUUID(), e2 = randomUUID(), draft = randomUUID();
  db = { $transaction: async work => work(db), $executeRaw: async () => 1 };
  db.user = table("user", [me, ana, bia, blockedUser, gone, unregistered, dating, stranger].map(id => ({ id, role: "BASIC", email: `${id}@private.example`, image: null })));
  db.events = table("events", [{ id: e1, nome: "Festa Azul", dataInicio: "2026-12-05", status: "PUBLISHED" }, { id: e2, nome: "Show Verde", dataInicio: "2026-12-10", status: "ENDED" }, { id: draft, nome: "Rascunho", dataInicio: "2026-12-20", status: "PENDING" }]);
  const profile = (eventId, userId, extra = {}) => ({ eventId, userId, displayName: userId === me ? "Eu" : `Pessoa ${userId.slice(0, 4)}`, photoUrl: "", bio: "Oi", interests: ["Música"], intent: "FRIENDSHIP", adultDeclared: false, active: true, ...extra });
  db.partyProfile = table("partyProfile", [
    profile(e1, me), profile(e2, me), profile(draft, me), profile(e1, ana), profile(e2, bia), profile(e1, blockedUser), profile(e1, gone), profile(e1, unregistered), profile(e1, dating, { intent: "DATING", adultDeclared: true }), profile(e1, stranger), profile(e1, removedAccount), profile(draft, ana),
  ]);
  const registration = (eventId, userId) => ({ eventId, userId, status: "CONFIRMED" });
  db.eventRegistration = table("eventRegistration", [registration(e1, me), registration(e2, me), registration(draft, me), registration(e1, ana), { eventId: e2, userId: bia, status: "CHECKED_IN" }, registration(e1, blockedUser), registration(e1, gone), registration(e1, dating), registration(e1, stranger), registration(e1, removedAccount), registration(draft, ana), { eventId: e1, userId: unregistered, status: "CANCELLED" }]);
  const at = minutes => new Date(Date.UTC(2026, 10, 20, 12, minutes));
  const pair = (eventId, x, y, extra = {}) => { const [userAId, userBId] = [x, y].sort(); return { id: randomUUID(), eventId, userAId, userBId, active: true, createdAt: at(0), ...extra }; };
  const mAna = pair(e1, me, ana), mBia = pair(e2, me, bia, { createdAt: at(30) }), mBlocked = pair(e1, me, blockedUser), mGone = pair(e1, me, gone, { active: false }), mUnregistered = pair(e1, me, unregistered), mDating = pair(e1, me, dating), mOthers = pair(e1, ana, stranger), mRemoved = pair(e1, me, removedAccount), mDraft = pair(draft, me, ana);
  db.partyMatch = table("partyMatch", [mAna, mBia, mBlocked, mGone, mUnregistered, mDating, mOthers, mRemoved, mDraft]);
  db.partyBlock = table("partyBlock", [{ fromId: blockedUser, toId: me }]);
  db.partyMessage = table("partyMessage", [
    { id: 1, matchId: mAna.id, authorId: ana, clientId: randomUUID(), text: "Oi! Tudo bem?", createdAt: at(1) },
    { id: 2, matchId: mAna.id, authorId: ana, clientId: randomUUID(), text: "", createdAt: at(2) },
    { id: 3, matchId: mOthers.id, authorId: stranger, clientId: randomUUID(), text: "Segredo de outra conversa", createdAt: at(50) },
    { id: 4, matchId: mBlocked.id, authorId: blockedUser, clientId: randomUUID(), text: "Bloqueado", createdAt: at(55) },
  ]);
  db.communityEntry = table("communityEntry");
  for (const name of ["notification", "communitySignal"]) db[name] = table(name);

  const { connectionsInbox } = load("lib/partyConnections/inbox.ts");
  const { receiptKey } = load("lib/partyConnections/receipts.ts");
  const { privateSend } = load("lib/partyConnections/messages.ts");
  const { isNotificationHref } = require("./load-notification-module.cjs")("@/lib/notifications/catalog");
  const actor = { id: me, role: "BASIC" };

  // Only the actor's own, currently accessible matches; ordered by last activity.
  let inbox = await connectionsInbox(actor);
  assert.deepEqual(inbox.items.map(item => item.id), [mBia.id, mAna.id], "blocked, inactive, unregistered, incompatible, removed, unpublished and foreign matches stay hidden");
  const anaItem = inbox.items.find(item => item.id === mAna.id), biaItem = inbox.items.find(item => item.id === mBia.id);
  assert.deepEqual(anaItem.event, { id: e1, name: "Festa Azul", date: "2026-12-05" });
  assert.deepEqual(biaItem.event, { id: e2, name: "Show Verde", date: "2026-12-10" });
  assert.equal(anaItem.profile.userId, ana); assert.equal(biaItem.profile.userId, bia);
  assert.equal(anaItem.unreadCount, 2); assert.deepEqual(anaItem.lastMessage, { text: "Foto", createdAt: at(2).toISOString(), own: false });
  assert.equal(biaItem.unreadCount, 0); assert.equal(biaItem.lastMessage, undefined);
  for (const item of inbox.items) assert.deepEqual(Object.keys(item.profile).sort(), ["bio", "displayName", "intent", "interests", "liked", "photoUrl", "userId"], "public profile only");
  const serialized = JSON.stringify(inbox);
  assert.ok(!/email|private\.example|role|Segredo|Bloqueado/.test(serialized), "no account fields or foreign messages leak");

  // Own read receipt lowers the unread count; a reply becomes the latest own preview.
  store.communityEntry.push({ id: receiptKey(mAna.id, me), eventId: e1, authorId: me, kind: "party.receipt", data: { deliveredThrough: 2, readThrough: 1, typingUntil: 0, lastTypingAt: 0 } });
  store.partyMessage.push({ id: 5, matchId: mAna.id, authorId: me, clientId: randomUUID(), text: "Tudo ótimo, e você?", createdAt: at(40) });
  inbox = await connectionsInbox(actor);
  assert.deepEqual(inbox.items.map(item => item.id), [mAna.id, mBia.id], "latest message moves the conversation to the top");
  assert.equal(inbox.items[0].unreadCount, 1);
  assert.deepEqual(inbox.items[0].lastMessage, { text: "Tudo ótimo, e você?", createdAt: at(40).toISOString(), own: true });

  // Batched access checks: the query count does not grow with the number of matches.
  for (const key of Object.keys(queries)) queries[key] = 0;
  await connectionsInbox(actor);
  assert.ok(queries.partyProfile === 1 && queries.eventRegistration === 1 && queries.partyBlock === 1 && queries.events === 1, `no N+1 access queries: ${JSON.stringify(queries)}`);
  assert.deepEqual((await connectionsInbox({ id: stranger, role: "BASIC" })).items.map(item => item.id), [mOthers.id], "each person sees only their own matches");
  await assert.rejects(connectionsInbox({ id: randomUUID(), role: "BASIC" }), error => error.status === 401);
  console.log("PASS party inbox: own matches only, access rules (block/inactive/registration/intent/account/event), event per item, unread + last message, public profile only, batched queries");

  // New message notification for the other participant only, without the message text.
  store.notification.length = 0;
  const secret = "Meu telefone é 11 99999-0000";
  const clientId = randomUUID();
  await privateSend(e1, mAna.id, actor, { clientId, text: secret });
  assert.equal(store.notification.length, 1);
  const [notice] = store.notification;
  assert.equal(notice.userId, ana, "recipient is the other participant");
  assert.equal(notice.type, "CONNECTION");
  assert.equal(notice.title, "Nova mensagem de Eu");
  assert.equal(notice.message, "Vocês deram match em Festa Azul. Toque para responder.");
  assert.equal(notice.href, `/conversas/${mAna.id}`); assert.ok(isNotificationHref(notice.href));
  assert.equal(notice.groupKey, `party-message:${mAna.id}`);
  assert.ok(!JSON.stringify(notice).includes("99999") && !JSON.stringify(notice).includes("telefone"), "message text never goes into the notification");
  assert.ok(!store.notification.some(row => row.userId === me), "the author is never notified");
  await privateSend(e1, mAna.id, actor, { clientId: randomUUID(), text: "Outra mensagem" });
  assert.equal(store.notification.length, 1, "no stacking while the previous alert is unread");
  notice.readAt = new Date();
  assert.equal((await privateSend(e1, mAna.id, actor, { clientId, text: secret })).duplicate, true);
  assert.equal(store.notification.length, 1, "a duplicate clientId never notifies");
  await privateSend(e1, mAna.id, actor, { clientId: randomUUID(), text: "Depois de ler" });
  assert.equal(store.notification.length, 2, "a new alert after the previous one was read");
  await privateSend(e1, mAna.id, { id: ana, role: "BASIC" }, { clientId: randomUUID(), text: "Resposta" });
  const reply = store.notification.at(-1);
  assert.equal(reply.userId, me); assert.equal(reply.title, `Nova mensagem de ${store.partyProfile.find(row => row.eventId === e1 && row.userId === ana).displayName}`);
  await assert.rejects(privateSend(e1, mBlocked.id, actor, { clientId: randomUUID(), text: "x" }), error => error.status === 403);
  assert.equal(store.notification.filter(row => row.userId === blockedUser).length, 0, "denied sends never notify");
  console.log("PASS party message notification: other participant only, no message text, /conversas href, one unread per conversation, none on duplicates or denied sends");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
