// Offline checks for organizer approval of registrations (promoter-created events only; imported events stay open).
// Runs the real attendance service against an in-memory store. No database, no network.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const ts = require("typescript");

globalThis.fetch = async () => { throw new Error("real network is forbidden in offline tests"); };

let db;
const cache = new Map();
class PrismaKnownError extends Error { constructor(code) { super("prisma " + code); this.code = code; } }
const stubs = {
  "@prisma/client": { Prisma: { PrismaClientKnownRequestError: PrismaKnownError, TransactionIsolationLevel: { Serializable: "Serializable" } } },
  "@/lib/notifications/create": { createNotification: async (store, input) => store.notification.create({ data: input }) },
  "@/lib/notifications/catalog": { notificationCopy: (input) => input },
  "@/lib/ticketSecurity": { ticketPaymentsConfigured: () => true },
};
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const resolve = (name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name === "@/lib/prisma") return { __esModule: true, get default() { return db; } };
    if (name.startsWith("@/")) return load(name.slice(2) + ".ts");
    return require(name);
  };
  new Function("require", "module", "exports", source)(resolve, mod, mod.exports);
  return mod.exports;
}

function cmp(actual, condition) {
  if (condition && typeof condition === "object" && !(condition instanceof Date)) {
    if ("in" in condition) return condition.in.includes(actual);
    if ("not" in condition) return actual !== condition.not;
    return true;
  }
  return actual === condition;
}
function matches(row, where) {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    if (key === "eventId_userId") return row.eventId === value.eventId && row.userId === value.userId;
    return cmp(row[key], value);
  });
}
function table(name, rows, relations = {}) {
  let sequence = 0;
  const hydrate = (row) => { const copy = { ...row }; for (const [rel, fn] of Object.entries(relations)) copy[rel] = fn(row); return copy; };
  return {
    rows,
    findUnique: async (q) => { const row = rows.find((item) => matches(item, q.where)); return row ? hydrate(row) : null; },
    findFirst: async (q = {}) => { const row = rows.find((item) => matches(item, q.where)); return row ? hydrate(row) : null; },
    findMany: async (q = {}) => rows.filter((row) => matches(row, q.where)).map(hydrate),
    count: async (q = {}) => rows.filter((row) => matches(row, q.where)).length,
    create: async (q) => { const row = { id: `${name}-${++sequence}`, createdAt: new Date(), qrVersion: 0, checkedInAt: null, ...q.data }; rows.push(row); return hydrate(row); },
    update: async (q) => {
      const row = rows.find((item) => matches(item, q.where));
      if (!row) throw new Error("not found");
      for (const [key, value] of Object.entries(q.data)) row[key] = value && typeof value === "object" && "increment" in value ? (row[key] ?? 0) + value.increment : value;
      return hydrate(row);
    },
    updateMany: async (q) => { const hit = rows.filter((row) => matches(row, q.where)); for (const row of hit) Object.assign(row, q.data); return { count: hit.length }; },
  };
}
function freshDb() {
  const base = { status: "PUBLISHED", dataInicio: "2099-05-10", startTime: "20:00", timezone: "America/Sao_Paulo", capacity: null, ticketsEnabled: false, isFree: true, priceCents: 0, nome: "Festa" };
  const events = [
    { ...base, id: "ev-approval", userId: "promoter", requiresApproval: true },
    { ...base, id: "ev-open", userId: "promoter", requiresApproval: false },
    { ...base, id: "ev-imported", userId: "promoter", requiresApproval: true, imported: true },
    { ...base, id: "ev-full", userId: "promoter", requiresApproval: true, capacity: 1 },
    { ...base, id: "ev-paid", userId: "promoter", requiresApproval: true, ticketsEnabled: true, isFree: false, priceCents: 3000 },
  ];
  const users = [{ id: "promoter", name: "Promo" }, { id: "ana", name: "Ana", email: "ana@example.test" }, { id: "bia", name: "Bia", email: "bia@example.test" }, { id: "caio", name: "Caio", email: "caio@example.test" }, { id: "admin", name: "Admin" }, { id: "team", name: "Equipe" }];
  const store = {
    events: table("event", events, { aiImport: (row) => (row.imported ? { id: "cand-" + row.id } : null) }),
    user: table("user", users),
    notification: table("notification", []),
    eventHistory: table("history", []),
    ticketOrder: table("order", []),
    communityTeamMember: table("team", [{ eventId: "ev-approval", userId: "team" }]),
  };
  store.eventRegistration = table("reg", [], { user: (row) => users.find((user) => user.id === row.userId) ?? null });
  store.$transaction = async (fn) => fn(store);
  return store;
}

(async () => {
  const attendance = load("lib/services/attendance.ts");
  db = freshDb();
  const reg = (eventId, userId) => db.eventRegistration.rows.find((row) => row.eventId === eventId && row.userId === userId);
  const owner = { id: "promoter", role: "PROMOTER" };

  // Request on a promoter event with approval: PENDING, no seat taken, organizer notified.
  const pending = await attendance.registerForEvent("ev-approval", "ana");
  assert.equal(pending.status, "PENDING");
  assert.equal((await attendance.getRegistrationState("ev-approval", "ana")).confirmedCount, 0, "a pending request takes no seat");
  assert.equal((await attendance.getRegistrationState("ev-approval", "ana")).requiresApproval, true);
  assert.ok(db.notification.rows.some((row) => row.userId === "promoter" && /Aprove ou recuse/.test(row.message)), "organizer told about the request");
  assert.equal((await attendance.registerForEvent("ev-approval", "ana")).status, "PENDING", "asking again keeps one request");
  assert.equal(db.eventRegistration.rows.filter((row) => row.eventId === "ev-approval" && row.userId === "ana").length, 1);

  // Open promoter event and imported events keep the direct flow.
  assert.equal((await attendance.registerForEvent("ev-open", "ana")).status, "CONFIRMED");
  assert.equal((await attendance.registerForEvent("ev-imported", "ana")).status, "CONFIRMED", "imported events never wait for approval");
  assert.equal((await attendance.getRegistrationState("ev-imported", "ana")).requiresApproval, false);

  // Only owner and admins see and decide requests; the check-in team cannot.
  await assert.rejects(attendance.listRegistrationRequests("ev-approval", { id: "team", role: "BASIC" }), (error) => error.status === 403);
  await assert.rejects(attendance.listRegistrationRequests("ev-approval", { id: "bia", role: "BASIC" }), (error) => error.status === 403);
  const requests = await attendance.listRegistrationRequests("ev-approval", owner);
  assert.deepEqual(requests.map((row) => [row.user.name, row.status]), [["Ana", "PENDING"]]);
  await assert.rejects(attendance.reviewRegistration("ev-approval", { id: "team", role: "BASIC" }, pending.id, "APPROVE"), (error) => error.status === 403);

  // Approve (free): CONFIRMED and the attendee is notified; it now counts as a seat.
  const approved = await attendance.reviewRegistration("ev-approval", owner, pending.id, "APPROVE");
  assert.equal(approved.status, "CONFIRMED");
  assert.equal((await attendance.getRegistrationState("ev-approval", null)).confirmedCount, 1);
  assert.ok(db.notification.rows.some((row) => row.userId === "ana" && /aprovad/i.test(row.title)));
  await assert.rejects(attendance.reviewRegistration("ev-approval", owner, pending.id, "REJECT"), (error) => error.status === 409, "only pending requests are decided");

  // Reject: REJECTED, attendee notified, cannot ask again.
  const second = await attendance.registerForEvent("ev-approval", "bia");
  const rejected = await attendance.reviewRegistration("ev-approval", { id: "admin", role: "ADMIN" }, second.id, "REJECT");
  assert.equal(rejected.status, "REJECTED");
  assert.ok(db.notification.rows.some((row) => row.userId === "bia" && /não foi aprovad/i.test(row.title + row.message)));
  await assert.rejects(attendance.registerForEvent("ev-approval", "bia"), (error) => error.status === 409, "a rejected person cannot ask again");
  assert.equal(reg("ev-approval", "bia").status, "REJECTED");
  await assert.rejects(attendance.reviewRegistration("ev-open", owner, second.id, "APPROVE"), (error) => error.status === 404, "request from another event");

  // Full event: approval puts the person on the waiting list.
  await attendance.registerForEvent("ev-full", "ana");
  await attendance.reviewRegistration("ev-full", owner, reg("ev-full", "ana").id, "APPROVE");
  await attendance.registerForEvent("ev-full", "bia");
  assert.equal((await attendance.reviewRegistration("ev-full", owner, reg("ev-full", "bia").id, "APPROVE")).status, "WAITLISTED");

  // Withdrawing a pending request is allowed.
  await attendance.registerForEvent("ev-approval", "caio");
  assert.equal((await attendance.cancelRegistration("ev-approval", "caio")).status, "CANCELLED");
  assert.equal(reg("ev-approval", "caio").status, "CANCELLED");
  assert.equal((await attendance.registerForEvent("ev-approval", "caio")).status, "PENDING", "can ask again after withdrawing");

  // Paid promoter event: request first, approval unlocks the purchase (APPROVED), payment confirms later.
  const paid = await attendance.registerForEvent("ev-paid", "ana");
  assert.equal(paid.status, "PENDING", "paid events with approval accept a request instead of refusing");
  assert.equal((await attendance.reviewRegistration("ev-paid", owner, paid.id, "APPROVE")).status, "APPROVED");
  assert.ok(db.notification.rows.some((row) => row.userId === "ana" && /compr/i.test(row.message)), "told the purchase is unlocked");

  // Pending/approved/rejected never appear in the door roster.
  const roster = await attendance.getCheckInRoster("ev-paid", owner);
  assert.equal(roster.length, 0);

  // Wiring: route, statuses in schema and migration, event form flag, event cancel covers requests.
  const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
  assert.match(schema, /enum RegistrationStatus \{[^}]*PENDING[^}]*APPROVED[^}]*REJECTED/s);
  assert.match(schema, /requiresApproval\s+Boolean\s+@default\(false\)/);
  const migration = fs.readdirSync("prisma/migrations").find((name) => name.endsWith("_registration_approval"));
  assert.ok(migration, "approval migration");
  const sql = fs.readFileSync(`prisma/migrations/${migration}/migration.sql`, "utf8");
  assert.doesNotMatch(sql, /\bUPDATE\b|\bDROP\b|\bDELETE\b/i, "migration is additive only");
  const route = fs.readFileSync("app/api/events/[id]/registration-requests/route.ts", "utf8");
  assert.match(route, /isAllowedRequestOrigin/);
  assert.match(route, /reviewRegistration/);
  assert.match(route, /listRegistrationRequests/);
  const events = fs.readFileSync("lib/services/events.ts", "utf8");
  assert.match(events, /requiresApproval/);
  assert.match(events, /status: \{ in: \["CONFIRMED", "WAITLISTED", "PENDING", "APPROVED"\] \}/, "cancelling an event also cancels open requests");
  console.log("PASS registration approval: pending requests, owner/admin review, imported events stay open, waitlist on approval, rejected cannot re-ask, paid events approve before purchase.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
