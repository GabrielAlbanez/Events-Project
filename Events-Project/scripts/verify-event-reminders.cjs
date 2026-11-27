// Offline checks for saved-event reminders: due window, idempotency, retry after failure. No database, no network.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const ts = require("typescript");

globalThis.fetch = async () => { throw new Error("real network is forbidden in offline tests"); };
let db;
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", source)((name) => {
    if (name === "@/lib/prisma") return { __esModule: true, get default() { return db; } };
    if (name.startsWith("@/")) return load(name.slice(2) + ".ts");
    if (name.startsWith("./")) return load(path.join(path.dirname(file), name.slice(2)) + ".ts");
    return require(name);
  }, mod, mod.exports);
  return mod.exports;
}

const NOW = new Date("2099-03-10T12:00:00.000Z"); // 09:00 in São Paulo
const event = (id, dataInicio, startTime, status = "PUBLISHED") => ({ id, nome: `Evento ${id}`, dataInicio, startTime, timezone: "America/Sao_Paulo", status });
function freshDb() {
  const events = [event("due", "2099-03-10", "09:30"), event("later", "2099-03-12", "20:00"), event("past", "2099-03-10", "08:00"), event("cancelled", "2099-03-10", "09:30", "CANCELLED")];
  const favorites = [
    { userId: "ana", eventId: "due", reminderMinutes: 60, reminderSentAt: null, createdAt: NOW },
    { userId: "bia", eventId: "due", reminderMinutes: 60, reminderSentAt: null, createdAt: NOW },
    { userId: "caio", eventId: "due", reminderMinutes: null, reminderSentAt: null, createdAt: NOW },
    { userId: "ana", eventId: "later", reminderMinutes: 60, reminderSentAt: null, createdAt: NOW },
    { userId: "ana", eventId: "past", reminderMinutes: 1440, reminderSentAt: null, createdAt: NOW },
    { userId: "ana", eventId: "cancelled", reminderMinutes: 60, reminderSentAt: null, createdAt: NOW },
  ];
  const notifications = [];
  const store = {
    failFor: null,
    favoriteRows: favorites, notificationRows: notifications,
    favorite: {
      findMany: async ({ where }) => favorites.filter((row) => {
        const item = events.find((candidate) => candidate.id === row.eventId);
        return row.reminderMinutes !== null && row.reminderSentAt === null && item.status === where.event.status && item.dataInicio >= where.event.dataInicio.gte && item.dataInicio <= where.event.dataInicio.lte;
      }).map((row) => ({ ...row, event: events.find((candidate) => candidate.id === row.eventId) })),
    },
    $transaction: async (fn) => {
      const snapshot = favorites.map((row) => ({ ...row }));
      const count = notifications.length;
      const tx = {
        favorite: { updateMany: async ({ where, data }) => { const hit = favorites.filter((row) => row.userId === where.userId && row.eventId === where.eventId && row.reminderSentAt === null); hit.forEach((row) => Object.assign(row, data)); return { count: hit.length }; } },
        notification: {
          findFirst: async ({ where }) => notifications.find((row) => row.userId === where.userId && row.groupKey === where.groupKey) ?? null,
          create: async ({ data }) => { if (store.failFor === data.userId) throw new Error("db down"); notifications.push(data); return data; },
        },
        communitySignal: { create: async () => ({}) },
      };
      try { return await fn(tx); } catch (error) {
        snapshot.forEach((row, index) => Object.assign(favorites[index], row));
        notifications.length = count;
        throw error;
      }
    },
  };
  return store;
}

(async () => {
  const warn = console.warn;
  console.warn = () => {};
  const { processDueEventReminders } = load("lib/services/eventReminders.ts");
  const now = () => NOW;
  db = freshDb();
  db.failFor = "bia";
  const first = await processDueEventReminders({ now });
  assert.deepEqual([first.sent, first.failed], [1, 1], "one failure does not stop the batch");
  assert.equal(db.favoriteRows.find((row) => row.userId === "bia" && row.eventId === "due").reminderSentAt, null, "a failed send is released for retry");
  db.failFor = null;
  const retry = await processDueEventReminders({ now });
  assert.deepEqual([retry.sent, retry.failed], [1, 0], "retried on the next run");
  assert.equal((await processDueEventReminders({ now })).sent, 0, "never sent twice");
  assert.deepEqual(db.notificationRows.map((row) => row.userId).sort(), ["ana", "bia"]);
  assert.ok(db.notificationRows.every((row) => row.type === "EVENT_REMINDER" && row.href === "/eventos/due"));
  assert.match(db.notificationRows[0].message, /Evento due começa em 1 hora/);
  assert.equal(db.favoriteRows.find((row) => row.eventId === "later").reminderSentAt, null, "not due yet");
  assert.equal(db.favoriteRows.find((row) => row.eventId === "past").reminderSentAt, null, "already started: no reminder");
  const later = await processDueEventReminders({ now: () => new Date("2099-03-12T22:30:00.000Z") });
  assert.equal(later.sent, 1, "sent when its window opens");
  const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  assert.ok(vercel.crons.some((job) => job.path === "/api/cron/event-reminders"), "cron registered");
  const route = fs.readFileSync("app/api/cron/event-reminders/route.ts", "utf8");
  assert.match(route, /verifyBearerSecret/);
  console.warn = warn;
  console.log("PASS event reminders: due window, no duplicates, retry after failure, cron protected.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
