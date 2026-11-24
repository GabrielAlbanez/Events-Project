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
  "@/lib/notifications/create": { createNotification: async (store, input) => store.notification.create({ data: input }), createNotificationOnce: async (store, input, scope = "ever") => (store.notification.rows.find((row) => row.userId === input.userId && row.groupKey === input.groupKey && (scope === "ever" || !row.readAt)) ?? store.notification.create({ data: input })) },
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
    createMany: async (q) => { rows.push(...q.data); return { count: q.data.length }; },
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
    { ...base, id: "ev-paid-legacy", userId: "promoter", requiresApproval: true, ticketsEnabled: true, isFree: false, priceCents: 3000 },
    { ...base, id: "ev-readmit", userId: "promoter", requiresApproval: false, capacity: 1 },
    { ...base, id: "ev-readmit-paid", userId: "promoter", requiresApproval: false, ticketsEnabled: true, isFree: false, priceCents: 3000 },
    { ...base, id: "ev-remove", userId: "promoter", requiresApproval: false, capacity: 1 },
    { ...base, id: "ev-paid-door", userId: "promoter", requiresApproval: false, ticketsEnabled: true, isFree: false, priceCents: 3000 },
  ];
  const users = [{ id: "promoter", name: "Promo" }, { id: "ana", name: "Ana", email: "ana@example.test" }, { id: "bia", name: "Bia", email: "bia@example.test" }, { id: "caio", name: "Caio", email: "caio@example.test" }, { id: "admin", name: "Admin" }, { id: "team", name: "Equipe" }, { id: "rm-a", name: "Remover A" }, { id: "rm-b", name: "Remover B" }, { id: "rm-paid", name: "Remover pago" }, { id: "rm-pix", name: "Remover Pix" }, { id: "rm-in", name: "Remover entrou" }, { id: "rd-a", name: "Readmitir A" }, { id: "rd-b", name: "Readmitir B" }, { id: "rd-paid", name: "Readmitir pago" }];
  const store = {
    events: table("event", events, { aiImport: (row) => (row.imported ? { id: "cand-" + row.id } : null) }),
    user: table("user", users),
    notification: table("notification", []),
    eventHistory: table("history", []),
    ticketOrder: table("order", []),
    communitySignal: table("signal", []),
    communityTeamMember: table("team", [{ eventId: "ev-approval", userId: "team" }]),
  };
  store.eventRegistration = table("reg", [], { user: (row) => users.find((user) => user.id === row.userId) ?? null });
  store.$queryRaw = async () => [];
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

  // A free RSVP from before the paid sale must become a request: the button works and the old QR stops being valid.
  for (const [userId, status] of [["old-confirmed", "CONFIRMED"], ["old-waiting", "WAITLISTED"]]) {
    await db.eventRegistration.create({ data: { eventId: "ev-paid-legacy", userId, status } });
    assert.equal((await attendance.registerForEvent("ev-paid-legacy", userId)).status, "PENDING", `${status} without payment becomes a request`);
    assert.equal(reg("ev-paid-legacy", userId).qrVersion, 1, "the unpaid QR is revoked");
  }
  await db.eventRegistration.create({ data: { eventId: "ev-paid-legacy", userId: "old-entered", status: "CHECKED_IN" } });
  await assert.rejects(attendance.registerForEvent("ev-paid-legacy", "old-entered"), (error) => error.status === 409 && /validada/.test(error.message), "a validated entry gets a visible answer");
  assert.equal(reg("ev-paid-legacy", "old-entered").status, "CHECKED_IN");
  await db.eventRegistration.create({ data: { eventId: "ev-paid-legacy", userId: "buyer-paid", status: "CONFIRMED" } });
  await db.ticketOrder.create({ data: { eventId: "ev-paid-legacy", buyerId: "buyer-paid", status: "PAID" } });
  assert.equal((await attendance.registerForEvent("ev-paid-legacy", "buyer-paid")).status, "CONFIRMED", "a paid ticket is never downgraded");
  assert.equal(reg("ev-paid-legacy", "buyer-paid").qrVersion, 0);
  assert.equal((await attendance.registerForEvent("ev-open", "ana")).status, "CONFIRMED", "free events keep the registration");
  // The door only admits a paid seat on a paid event: no QR, no scan and no manual entry without a PAID order.
  process.env.NEXTAUTH_SECRET = "offline-door-test-secret-".repeat(2);
  const doorSeat = (userId, status = "CONFIRMED") => db.eventRegistration.create({ data: { eventId: "ev-paid-door", userId, status } });
  const unpaid = await doorSeat("door-unpaid");
  await assert.rejects(attendance.issueCheckInToken("ev-paid-door", "door-unpaid"), (error) => error.status === 409 && /pagamento/i.test(error.message), "no QR without payment");
  await assert.rejects(attendance.manualCheckIn("ev-paid-door", owner, unpaid.id), (error) => error.status === 409 && /pagamento/i.test(error.message), "no manual entry without payment");
  assert.equal(reg("ev-paid-door", "door-unpaid").status, "CONFIRMED", "a refused entry changes nothing");
  await doorSeat("door-paid");
  const doorOrder = await db.ticketOrder.create({ data: { eventId: "ev-paid-door", buyerId: "door-paid", status: "PAID" } });
  const doorQr = await attendance.issueCheckInToken("ev-paid-door", "door-paid");
  db.ticketOrder.rows.find((row) => row.id === doorOrder.id).status = "REFUNDED";
  await assert.rejects(attendance.checkInAttendee("ev-paid-door", owner, doorQr.token), (error) => error.status === 409 && /pagamento/i.test(error.message), "a QR issued before the refund stops working");
  db.ticketOrder.rows.find((row) => row.id === doorOrder.id).status = "PAID";
  assert.equal((await attendance.checkInAttendee("ev-paid-door", owner, doorQr.token)).status, "CHECKED_IN", "a paid ticket enters");
  // A freed seat on a paid event is sold, never handed to the waiting list as a free confirmation.
  await doorSeat("door-waiting", "WAITLISTED");
  const noticesBefore = db.notification.rows.filter((row) => row.userId === "door-waiting").length;
  assert.equal(await attendance.reconcileEventWaitlist("ev-paid-door"), 0, "no free promotion on a paid event");
  await attendance.cancelRegistration("ev-paid-door", "door-unpaid");
  assert.equal(reg("ev-paid-door", "door-waiting").status, "WAITLISTED", "cancelling does not promote without payment");
  assert.equal(db.notification.rows.filter((row) => row.userId === "door-waiting").length, noticesBefore, "nobody is told a seat was confirmed");
  // Organizer removes a participant: QR revoked, person told, no way back in, next in line promoted, audited.
  const removable = await attendance.registerForEvent("ev-remove", "rm-a");
  await attendance.registerForEvent("ev-remove", "rm-b");
  assert.equal(reg("ev-remove", "rm-b").status, "WAITLISTED");
  await assert.rejects(attendance.removeAttendee("ev-remove", { id: "team", role: "BASIC" }, removable.id), (error) => error.status === 403, "only the organizer removes");
  await assert.rejects(attendance.removeAttendee("ev-open", owner, removable.id), (error) => error.status === 404, "registration of another event");
  assert.equal((await attendance.removeAttendee("ev-remove", owner, removable.id)).status, "REJECTED");
  assert.equal(reg("ev-remove", "rm-a").qrVersion, 1, "the QR stops working");
  assert.equal(reg("ev-remove", "rm-b").status, "CONFIRMED", "the next person gets the seat");
  assert.ok(db.notification.rows.some((row) => row.userId === "rm-a" && /removid/i.test(row.title + row.message)), "the person is told");
  assert.ok(db.eventHistory.rows.some((row) => row.eventId === "ev-remove" && /removid/i.test(row.note) && !/Remover A/.test(row.note)), "audited without personal data");
  assert.equal((await attendance.registerForEvent("ev-remove", "rm-a")).status, "REJECTED", "a removed person cannot sign up again");
  assert.equal((await attendance.removeAttendee("ev-remove", owner, removable.id)).status, "REJECTED", "repeating is harmless");
  for (const [userId, status] of [["rm-paid", "CONFIRMED"], ["rm-pix", "APPROVED"], ["rm-in", "CHECKED_IN"]]) await db.eventRegistration.create({ data: { eventId: "ev-paid-door", userId, status } });
  await db.ticketOrder.create({ data: { eventId: "ev-paid-door", buyerId: "rm-paid", status: "PAID" } });
  await db.ticketOrder.create({ data: { eventId: "ev-paid-door", buyerId: "rm-pix", status: "PENDING", expiresAt: new Date(Date.now() + 600000) } });
  await assert.rejects(attendance.removeAttendee("ev-paid-door", owner, reg("ev-paid-door", "rm-paid").id), (error) => error.status === 409 && /estorn/i.test(error.message), "a paid ticket needs a refund first");
  await assert.rejects(attendance.removeAttendee("ev-paid-door", owner, reg("ev-paid-door", "rm-pix").id), (error) => error.status === 409 && /Pix/.test(error.message), "an open Pix blocks removal");
  await assert.rejects(attendance.removeAttendee("ev-paid-door", owner, reg("ev-paid-door", "rm-in").id), (error) => error.status === 409 && /entrada/i.test(error.message), "a validated entry stays");
  assert.deepEqual(["rm-paid", "rm-pix", "rm-in"].map((id) => reg("ev-paid-door", id).status), ["CONFIRMED", "APPROVED", "CHECKED_IN"], "refused removals change nothing");
  // Readmit: the organizer undoes a removal or a refusal; the seat follows capacity and payment rules, and a new QR is issued.
  await db.communityTeamMember.create({ data: { eventId: "ev-readmit", userId: "team" } });
  const readmitted = await attendance.registerForEvent("ev-readmit", "rd-a");
  await attendance.removeAttendee("ev-readmit", owner, readmitted.id);
  const qrWhenRemoved = reg("ev-readmit", "rd-a").qrVersion;
  await assert.rejects(attendance.readmitAttendee("ev-readmit", { id: "team", role: "BASIC" }, readmitted.id), (error) => error.status === 403, "only the organizer readmits");
  await assert.rejects(attendance.readmitAttendee("ev-open", owner, readmitted.id), (error) => error.status === 404);
  await attendance.registerForEvent("ev-readmit", "rd-b");
  assert.equal(reg("ev-readmit", "rd-b").status, "CONFIRMED");
  assert.equal((await attendance.readmitAttendee("ev-readmit", owner, readmitted.id)).status, "WAITLISTED", "a full event puts the person on the waiting list");
  assert.ok(reg("ev-readmit", "rd-a").qrVersion > qrWhenRemoved, "an old QR never comes back");
  assert.ok(db.notification.rows.some((row) => row.userId === "rd-a" && /readmit/i.test(row.title + row.message)), "the person is told");
  assert.ok(db.eventHistory.rows.some((row) => row.eventId === "ev-readmit" && /readmitid/i.test(row.note) && !/Readmitir A/.test(row.note)), "audited without personal data");
  await assert.rejects(attendance.readmitAttendee("ev-readmit", owner, readmitted.id), (error) => error.status === 409, "only a removed or refused person is readmitted");
  await attendance.cancelRegistration("ev-readmit", "rd-b");
  assert.equal(reg("ev-readmit", "rd-a").status, "CONFIRMED", "the waiting list still works after readmission");
  const roomsFor = (id) => db.communitySignal.rows.filter((row) => row.room === `user:${id}`).length;
  for (const id of ["rd-a", "promoter", "team"]) assert.ok(roomsFor(id) > 0, `${id} is told in real time`);
  const beforeEntry = roomsFor("team");
  const entryQr = await attendance.issueCheckInToken("ev-readmit", "rd-a");
  await attendance.checkInAttendee("ev-readmit", owner, entryQr.token);
  assert.ok(roomsFor("team") > beforeEntry, "the door team sees an entry in real time");
  const paidReturn = await db.eventRegistration.create({ data: { eventId: "ev-readmit-paid", userId: "rd-paid", status: "REJECTED" } });
  await db.ticketOrder.create({ data: { id: "rd-refund", eventId: "ev-readmit-paid", buyerId: "rd-paid", status: "PAID" } });
  await assert.rejects(attendance.readmitAttendee("ev-readmit-paid", owner, paidReturn.id), (error) => error.status === 409 && /devolu/i.test(error.message), "not while a late Pix is being returned");
  db.ticketOrder.rows.find((row) => row.id === "rd-refund").status = "REFUNDED";
  assert.equal((await attendance.readmitAttendee("ev-readmit-paid", owner, paidReturn.id)).status, "APPROVED", "a paid event gets back the right to buy, never a free seat");
  // Withdrawing a pending request is allowed.
  await attendance.registerForEvent("ev-approval", "caio");
  assert.equal((await attendance.cancelRegistration("ev-approval", "caio")).status, "CANCELLED");
  assert.equal(reg("ev-approval", "caio").status, "CANCELLED");
  assert.equal((await attendance.registerForEvent("ev-approval", "caio")).status, "PENDING", "can ask again after withdrawing");
  assert.equal(db.notification.rows.filter((row) => row.userId === "promoter" && row.groupKey === "registration-request:ev-approval").length, 1, "asking again never floods the organizer while a notice is unread");

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
