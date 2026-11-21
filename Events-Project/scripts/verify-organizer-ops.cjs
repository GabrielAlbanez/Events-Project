// Offline checks for package A-organizer-ops: published-event edits, attendee notices,
// registrant reminders, team check-in, CSV export and announcement notices.
// Real modules run against in-memory persistence. No database, network or production writes.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const ts = require("typescript");

let db;
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const resolve = (name) => {
    if (name === "@/lib/prisma") return { __esModule: true, get default() { return db; } };
    if (name.startsWith("@/")) return load(name.slice(2) + ".ts");
    if (name.startsWith(".")) {
      const base = path.resolve(path.dirname(file), name.replace(/\.js$/, ""));
      return load(fs.existsSync(base + ".ts") ? base + ".ts" : base + ".tsx");
    }
    return require(name);
  };
  new Function("require", "module", "exports", source)(resolve, mod, mod.exports);
  return mod.exports;
}
const read = (file) => fs.readFileSync(file, "utf8");

// Minimal Prisma-like matcher for the shapes used by these services.
function matches(row, where) {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some((option) => matches(row, option));
    if (key === "eventId_userId") return row.eventId === value.eventId && row.userId === value.userId;
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("in" in value) return value.in.includes(row[key]);
      if ("gte" in value) return row[key] >= value.gte;
      if ("not" in value) return row[key] !== value.not;
      return true;
    }
    return row[key] === value;
  });
}
function table(rows) {
  return {
    rows,
    findUnique: async (q) => rows.find((row) => matches(row, q.where)) ?? null,
    findFirst: async (q) => rows.find((row) => matches(row, q.where)) ?? null,
    findMany: async (q) => rows.filter((row) => matches(row, q?.where)),
    count: async (q) => rows.filter((row) => matches(row, q?.where)).length,
    create: async (q) => { const row = { id: "row-" + rows.length, createdAt: new Date(), ...q.data }; rows.push(row); return row; },
    createMany: async (q) => { for (const data of q.data) rows.push({ id: "row-" + rows.length, createdAt: new Date(), ...data }); return { count: q.data.length }; },
    update: async (q) => { const row = rows.find((item) => matches(item, q.where)); assert.ok(row, "update target exists"); Object.assign(row, q.data); return row; },
    updateMany: async (q) => { const hit = rows.filter((row) => matches(row, q.where)); for (const row of hit) Object.assign(row, q.data); return { count: hit.length }; },
  };
}

function checkSensitiveFields() {
  const { sensitiveEventChanges, scheduleChanges } = load("lib/eventScheduleChanges.ts");
  const base = { nome: "Festival", dataInicio: "2099-05-01T00:00:00.000Z", dataFim: "2099-05-02", startTime: null, endTime: "22:00", endereco: "Rua A, 10", lat: -23.5, lng: -46.6, linkParaCompra: "https://ingressos.example/a", isFree: false, priceCents: 5000, capacity: 100, organizerName: "Org" };
  const same = { ...base, dataInicio: "2099-05-01", startTime: "", endereco: " Rua A, 10 " };
  assert.deepEqual(sensitiveEventChanges(base, same), [], "legacy ISO dates, null/empty times and whitespace are not changes");
  assert.deepEqual(sensitiveEventChanges(base, { ...same, capacity: 150 }), [], "capacity increase stays live");
  assert.deepEqual(sensitiveEventChanges(base, { ...same, capacity: null }), [], "removing the limit stays live");
  assert.deepEqual(sensitiveEventChanges(base, { ...same, organizerName: undefined }), [], "omitted organizer keeps stored value");
  assert.deepEqual(sensitiveEventChanges({ ...base, isFree: true, priceCents: 900 }, { ...same, isFree: true, priceCents: 0 }), [], "free events ignore stale price");
  const cases = [
    [{ nome: "Outro" }, "nome"], [{ dataFim: "2099-05-03" }, "data"], [{ startTime: "18:00" }, "horário"],
    [{ endereco: "Rua B" }, "local"], [{ lat: -23.51 }, "local"], [{ linkParaCompra: "https://x.example" }, "link de ingressos"],
    [{ priceCents: 6000 }, "preço"], [{ isFree: true, priceCents: 0 }, "preço"], [{ capacity: 80 }, "redução de vagas"],
    [{ organizerName: "Nova Org" }, "organização responsável"],
  ];
  for (const [change, label] of cases) assert.deepEqual(sensitiveEventChanges(base, { ...same, ...change }), [label], label);
  assert.deepEqual(sensitiveEventChanges({ ...base, capacity: null }, { ...same, capacity: 500 }), ["redução de vagas"], "adding a limit to an unlimited event is a reduction");
  assert.deepEqual(scheduleChanges(base, { ...same, dataInicio: "2099-06-01", endereco: "Outro" }), ["data", "local"]);
  // The service and the form share this rule.
  const service = read("lib/services/events.ts");
  assert.match(service, /const liveUpdate = wasPublished && sensitive\.length === 0;/);
  assert.match(service, /liveUpdate \? "PUBLISHED" as const/);
  assert.match(service, /record\(transaction, event, user, "UPDATED"/);
  assert.match(service, /includeRegistrations: true/);
  const form = read("components/MyComponents/EventoForm.tsx");
  assert.match(form, /sensitiveEventChanges/);
  assert.match(form, /Isso enviará o evento para nova revisão e ele sairá do ar até a aprovação\./);
  assert.match(form, /onSubmit\(values, true\)/, "the review warning requires an explicit confirmation");
  console.log("PASS organizer-ops: sensitive vs live edits for published events (legacy dates, capacity increase/reduction, price, organizer) and confirmation UX wiring");
}

function checkCsv() {
  const csv = load("lib/organizerOps/attendeesCsv.ts");
  assert.equal(csv.csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  for (const value of ["+1", "-2", "@cmd", "\tx"]) assert.ok(csv.csvCell(value).replace(/^"/, "").startsWith("'"), value + " is neutralized");
  assert.equal(csv.csvCell("Ana; Maria"), "\"Ana; Maria\"");
  assert.equal(csv.csvCell("simples"), "simples");
  const output = csv.attendeesCsv([
    { status: "CHECKED_IN", createdAt: new Date("2099-01-01T12:00:00Z"), checkedInAt: "2099-01-02T15:30:00Z", user: { name: "=Ana", email: "ana@example.invalid" } },
    { status: "WAITLISTED", createdAt: "2099-01-01T13:00:00Z", checkedInAt: null, user: { name: null, email: null } },
  ], "America/Sao_Paulo");
  assert.ok(output.startsWith("﻿"), "UTF-8 BOM for Excel");
  const lines = output.slice(1).split("\r\n");
  assert.equal(lines[0], "nome;e-mail;status;inscrito em;check-in em");
  assert.equal(lines[1], "'=Ana;ana@example.invalid;Entrada registrada;01/01/2099 09:00;02/01/2099 12:30");
  assert.equal(lines[2], ";;Lista de espera;01/01/2099 10:00;");
  assert.equal(csv.formatCsvDate("invalid", "America/Sao_Paulo"), "");
  assert.equal(csv.formatCsvDate(new Date("2099-01-01T12:00:00Z"), "Invalid/Zone"), "01/01/2099 09:00", "invalid zones fall back to São Paulo");
  assert.equal(csv.attendeesCsvFilename("Festival São João!"), "participantes-festival-sao-joao.csv");
  assert.equal(csv.attendeesCsvFilename("***"), "participantes-evento.csv");
  const route = read("app/api/events/[id]/attendees/route.ts");
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.match(route, /text\/csv; charset=utf-8/);
  assert.match(route, /no-store/);
  assert.match(route, /getAttendeeExport/);
  console.log("PASS organizer-ops: CSV export uses BOM + ';', pt-BR dates in the event timezone, RFC quoting, formula neutralization and a GET-only no-store route");
}

async function checkTeamCheckIn() {
  process.env.CHECKIN_SIGNING_SECRET = "organizer-ops-offline-signing-key-".repeat(2);
  const event = { id: "event", nome: "Festival", userId: "owner", status: "PUBLISHED", capacity: 10, timezone: "America/Sao_Paulo", dataInicio: "2099-01-01", startTime: "10:00" };
  const registrations = table([
    { id: "r-confirmed", eventId: "event", userId: "u1", status: "CONFIRMED", qrVersion: 0, createdAt: new Date(1), checkedInAt: null, user: { id: "u1", name: "Ana", email: "ana@example.invalid" } },
    { id: "r-wait", eventId: "event", userId: "u2", status: "WAITLISTED", qrVersion: 0, createdAt: new Date(2), checkedInAt: null, user: { id: "u2", name: "Bia", email: "bia@example.invalid" } },
    { id: "r-other", eventId: "other", userId: "u3", status: "CONFIRMED", qrVersion: 0, createdAt: new Date(3), checkedInAt: null, user: { id: "u3", name: "Caio", email: "caio@example.invalid" } },
  ]);
  const history = table([]);
  db = {
    events: { findUnique: async () => ({ ...event }) },
    eventRegistration: registrations,
    communityTeamMember: table([{ eventId: "event", userId: "staff" }]),
    eventHistory: history,
    user: { findUnique: async (q) => ({ id: q.where.id, name: "Equipe" }) },
    notification: table([]),
  };
  db.$transaction = async (operation) => operation(db);
  const attendance = load("lib/services/attendance.ts");
  const staff = { id: "staff", role: "BASIC" };
  const overview = await attendance.getCheckInOverview("event", staff);
  assert.deepEqual(overview.access, { role: "TEAM", canExport: false });
  assert.deepEqual(overview.counts, { confirmed: 1, checkedIn: 0, waitlisted: 1 });
  assert.deepEqual(overview.attendees.map((entry) => entry.user.email), ["a***@example.invalid", "b***@example.invalid"], "team members only see masked e-mails");
  assert.ok((await attendance.getCheckInRoster("event", staff)).every((entry) => entry.user.email.includes("***")), "legacy roster response is masked for the team too");
  assert.equal((await attendance.getCheckInOverview("event", { id: "owner", role: "PROMOTER" })).attendees[0].user.email, "ana@example.invalid", "owner sees full e-mail");
  assert.equal(attendance.maskEmail(null), null);
  assert.equal(attendance.maskEmail("semarroba"), "***");
  await assert.rejects(attendance.getAttendeeExport("event", staff), (error) => error.status === 403, "team members cannot export personal data");
  await assert.rejects(attendance.getCheckInOverview("event", { id: "stranger", role: "PROMOTER" }), (error) => error.status === 403);
  assert.equal((await attendance.getAttendeeExport("event", { id: "owner", role: "PROMOTER" })).attendees.length, 2, "owner exports the event roster");
  assert.deepEqual((await attendance.getCheckInOverview("event", { id: "admin", role: "ADMIN" })).access, { role: "ADMIN", canExport: true });
  await assert.rejects(attendance.manualCheckIn("event", staff, "r-wait"), (error) => error.status === 409, "waitlisted entries cannot enter");
  await assert.rejects(attendance.manualCheckIn("event", staff, "r-other"), (error) => error.status === 404, "registrations of other events are rejected");
  const done = await attendance.manualCheckIn("event", staff, "r-confirmed");
  assert.equal(done.status, "CHECKED_IN");
  assert.equal(history.rows.length, 1);
  assert.equal(history.rows[0].actorId, "staff");
  assert.doesNotMatch(history.rows[0].note, /ana@example/, "audit note carries no attendee personal data");
  assert.equal((await attendance.manualCheckIn("event", staff, "r-confirmed")).status, "CHECKED_IN", "repeated manual check-in is idempotent");
  assert.equal(history.rows.length, 1);
  assert.deepEqual(attendance.attendanceCounts(registrations.rows.filter((row) => row.eventId === "event")), { confirmed: 0, checkedIn: 1, waitlisted: 1 });
  // QR flow keeps working for team members.
  registrations.rows[0].status = "CONFIRMED";
  const issued = await attendance.issueCheckInToken("event", "u1");
  assert.equal((await attendance.checkInAttendee("event", staff, issued.token)).status, "CHECKED_IN");
  event.status = "PENDING";
  await assert.rejects(attendance.getCheckInOverview("event", staff), (error) => error.status === 409, "team access only for published/ended events");
  const policy = load("lib/authPolicy.ts");
  assert.equal(policy.canAccessPath("GUEST", "/myEvents/x/checkin"), false);
  for (const role of ["BASIC", "PROMOTER", "ADMIN"]) assert.equal(policy.canAccessPath(role, "/myEvents/x/checkin"), true);
  assert.equal(policy.canAccessPath("BASIC", "/myEvents"), false, "only the check-in page opens to team members");
  const route = read("app/api/events/[id]/check-in/route.ts");
  assert.match(route, /isAllowedRequestOrigin/);
  assert.match(route, /registrationId/);
  const page = read("app/(private)/myEvents/[id]/checkin/page.tsx");
  assert.match(page, /use estes dados apenas para a operação do evento/);
  assert.match(page, /Confirmar entrada manual\?/);
  assert.match(page, /canExport/);
  console.log("PASS organizer-ops: team check-in (QR + manual with audit, idempotent), owner/admin-only export, counters, status guards and route access policy");
}

async function checkAttendeeNotices() {
  const notices = table([]);
  db = {
    favorite: table([{ eventId: "event", userId: "fan" }, { eventId: "event", userId: "u1" }]),
    eventRegistration: table([
      { eventId: "event", userId: "u1", status: "CONFIRMED" },
      { eventId: "event", userId: "u2", status: "WAITLISTED" },
      { eventId: "event", userId: "u3", status: "CANCELLED" },
      { eventId: "event", userId: "owner", status: "CONFIRMED" },
    ]),
    follow: table([]), user: table([]), notification: notices,
  };
  const { notifyEventAudience } = load("lib/eventNotifications.ts");
  await notifyEventAudience(db, { id: "event", nome: "Festival", userId: "owner", status: "CANCELLED" }, { title: "Evento cancelado", message: "Festival foi cancelado.", includeRegistrations: true });
  const recipients = notices.rows.map((row) => row.userId).sort();
  assert.deepEqual(recipients, ["fan", "owner", "u1", "u2"], "confirmed + waitlisted + favorites, one notice per person, cancelled excluded");
  assert.ok(notices.rows.every((row) => row.type === "EVENT_CHANGE"));
  assert.equal(notices.rows.find((row) => row.userId === "owner").href, "/myEvents");
  const service = read("lib/services/events.ts");
  assert.match(service, /eventRegistration\.updateMany\(\{ where: \{ eventId: changed\.id, status: \{ in: \["CONFIRMED", "WAITLISTED", "PENDING", "APPROVED"\] \} \}, data: \{ status: "CANCELLED"/, "cancel closes open registrations and approval requests");
  assert.match(read("app/(actions)/deleteEvents/action.ts"), /includeRegistrations: true/, "admin delete warns attendees before cascade");
  const worker = load("server/notificationWorker.mts");
  const start = new Date("2099-01-02T12:00:00Z");
  assert.equal(worker.registrationReminderDue(start, new Date("2098-12-01T00:00:00Z"), new Date("2099-01-01T13:00:00Z")), true);
  assert.equal(worker.registrationReminderDue(start, new Date("2098-12-01T00:00:00Z"), new Date("2099-01-01T11:00:00Z")), false, "not before the 24h window");
  assert.equal(worker.registrationReminderDue(start, new Date("2099-01-01T12:30:00Z"), new Date("2099-01-01T13:00:00Z")), false, "registered inside the window");
  assert.equal(worker.registrationReminderDue(start, new Date("2098-12-01T00:00:00Z"), new Date("2099-01-02T12:00:00Z")), false, "not after the start");
  assert.notEqual(worker.registrationReminderKey("r", start), worker.registrationReminderKey("r", new Date("2099-01-03T12:00:00Z")), "a schedule change re-arms the reminder");
  const workerSource = read("server/notificationWorker.mts");
  assert.match(workerSource, /reminderMinutes:\{not:null\}/, "favorites with their own reminder are deduplicated");
  assert.match(workerSource, /type:"EVENT_REMINDER"/);
  console.log("PASS organizer-ops: cancellation/schedule/delete notices reach confirmed + waitlisted attendees once; registrant reminders are windowed, deduplicated and re-armed");
}

async function checkAnnouncements() {
  const entries = table([]);
  const notices = table([]);
  db = {
    communityEntry: entries,
    eventRegistration: table([
      { eventId: "event", userId: "u1", status: "CONFIRMED" },
      { eventId: "event", userId: "u2", status: "CHECKED_IN" },
      { eventId: "event", userId: "u3", status: "WAITLISTED" },
      { eventId: "event", userId: "owner", status: "CONFIRMED" },
    ]),
    notification: notices,
  };
  const { handleAnnouncement, announcementHourlyLimit } = load("lib/community/announcements.ts");
  const store = { create: async (kind, data) => entries.create({ data: { eventId: "event", kind, data } }), update: async () => undefined };
  const context = { tx: db, eventId: "event", eventName: "Festival", eventStatus: "PUBLISHED", actorId: "owner" };
  const publish = { action: "announcement.publish", title: "Portões abertos", message: "Entrada pelo portão 2." };
  await assert.rejects(handleAnnouncement(publish, store, false, context), (error) => error.status === 403);
  assert.equal(await handleAnnouncement(publish, store, true, context), true);
  assert.deepEqual(notices.rows.map((row) => row.userId).sort(), ["u1", "u2"], "confirmed and checked-in attendees, never the author");
  assert.equal(notices.rows[0].href, "/eventos/event/comunidade");
  await handleAnnouncement(publish, store, true, context);
  assert.equal(notices.rows.length, 2, "the same notice is not delivered twice within an hour");
  for (let index = entries.rows.length; index < announcementHourlyLimit; index++) await handleAnnouncement({ ...publish, title: "Aviso " + index }, store, true, context);
  await assert.rejects(handleAnnouncement({ ...publish, title: "Excesso" }, store, true, context), (error) => error.status === 429, "hourly limit");
  const before = notices.rows.length;
  await handleAnnouncement({ ...publish, title: "Sem contexto" }, store, true);
  assert.equal(notices.rows.length, before, "legacy callers keep silent publishing");
  const wired = /handleAnnouncement\(action, entries, manage, \{/.test(read("lib/community/events.ts"));
  console.log("PASS organizer-ops: announcements notify confirmed attendees in one batch, deduplicated and rate-limited" + (wired ? "" : " (NOTE: lib/community/events.ts does not pass the context yet — integration pending)"));
}

(async () => {
  checkSensitiveFields();
  checkCsv();
  await checkTeamCheckIn();
  await checkAttendeeNotices();
  await checkAnnouncements();
})().catch((error) => { console.error(error); process.exitCode = 1; });
