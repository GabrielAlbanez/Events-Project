const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { createRequire } = require("node:module");
const ts = require("typescript");
const bcrypt = require("bcrypt");
const { io } = require("socket.io-client");
const { PrismaClient } = require("@prisma/client");
require("@next/env").loadEnvConfig(process.cwd());

const base = process.env.FEATURE_HTTP_URL || "http://localhost:3000";
const db = new PrismaClient();
const prefix = `event-extras-test-${randomUUID()}`;
const users = [];
const eventIds = [];
const seriesIds = [];
const sockets = [];
const moduleCache = new Map();
const nativeRequire = createRequire(path.join(process.cwd(), "package.json"));
let phase = "setup";

function load(relativePath) {
  const filename = path.resolve(relativePath);
  if (moduleCache.has(filename)) return moduleCache.get(filename).exports;
  const module = { exports: {} };
  moduleCache.set(filename, module);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const requireLocal = (name) => {
    if (name === "@/lib/prisma") return { __esModule: true, default: db };
    if (name.startsWith("@/")) return load(`${name.slice(2)}.ts`);
    return nativeRequire(name);
  };
  new Function("require", "module", "exports", source)(requireLocal, module, module.exports);
  return module.exports;
}

async function signIn(user, password) {
  const csrfResponse = await fetch(`${base}/api/auth/csrf`);
  const csrf = await csrfResponse.json();
  const csrfCookie = csrfResponse.headers.getSetCookie().find(value => value.startsWith("next-auth.csrf-token="))?.split(";")[0];
  assert.ok(csrfCookie);
  const response = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: csrfCookie },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, callbackUrl: `${base}/`, json: "true", email: user.email, password }),
    redirect: "manual",
  });
  const cookie = response.headers.getSetCookie().find(value => value.startsWith("next-auth.session-token="))?.split(";")[0];
  assert.ok(cookie, `login failed for ${user.role}`);
  return cookie;
}

async function api(url, options = {}) {
  const response = await fetch(`${base}${url}`, options);
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

function headers(cookie) { return { Cookie: cookie, Origin: base, "Content-Type": "application/json" }; }

async function connect(cookie) {
  const socket = io(base, { transports: ["websocket"], extraHeaders: { Cookie: cookie }, reconnection: false });
  sockets.push(socket);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Socket.IO connection timeout")), 10000);
    socket.once("connect", () => { clearTimeout(timer); resolve(); });
    socket.once("connect_error", error => { clearTimeout(timer); reject(error); });
  });
  socket.emit("register-user");
  return socket;
}

function notice(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("targeted notification timeout")), 15000);
    socket.once("notification-updated", value => { clearTimeout(timer); resolve(value); });
  });
}

async function createEvent(ownerId, overrides = {}) {
  const date = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const event = await db.events.create({ data: {
    nome: `${prefix} event`, descricao: "Temporary integration test event.", banner: "/favicon.ico", carrossel: [],
    dataInicio: date, dataFim: date, startTime: "10:00", endTime: "12:00", timezone: "America/Sao_Paulo",
    linkParaCompra: "", endereco: "Temporary test location", lat: -23.55, lng: -46.63,
    userId: ownerId, isFree: true, priceCents: 0, category: "Cultura", status: "PUBLISHED", validate: true,
    ...overrides,
  } });
  eventIds.push(event.id);
  return event;
}

async function run() {
  try {
    const password = randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);
    for (const role of ["ADMIN", "PROMOTER", "BASIC", "BASIC"]) {
      users.push(await db.user.create({ data: {
        name: "Temporary Event Test", email: `${prefix}-${users.length}@example.invalid`, password: passwordHash,
        role, emailVerified: true,
      } }));
    }
    const [admin, promoter, first, second] = users;
    const [adminCookie, promoterCookie, firstCookie, secondCookie] = await Promise.all(users.map(user => signIn(user, password)));
    assert.equal((await api("/api/auth/session")).data?.user, undefined);

    phase = "registration, waitlist, and check-in";
    const event = await createEvent(promoter.id, { capacity: 1 });
    const registrationUrl = `/api/events/${event.id}/registration`;
    assert.equal((await api(registrationUrl, { method: "POST", headers: headers(firstCookie) })).data.status, "CONFIRMED");
    assert.equal((await api(registrationUrl, { method: "POST", headers: headers(secondCookie) })).data.status, "WAITLISTED");
    const state = await api(registrationUrl, { headers: headers(secondCookie) });
    assert.equal(state.status, 200);
    assert.equal(state.data.confirmedCount, 1);
    assert.equal(state.data.waitingCount, 1);
    assert.equal(state.data.registration.status, "WAITLISTED");
    const tokenUrl = `/api/events/${event.id}/check-in-token`;
    assert.equal((await api(tokenUrl, { headers: headers(secondCookie) })).status, 403);
    const tokenResponse = await api(tokenUrl, { headers: headers(firstCookie) });
    assert.equal(tokenResponse.status, 200);
    assert.ok(tokenResponse.data.token);
    const checkInUrl = `/api/events/${event.id}/check-in`;
    assert.equal((await api(checkInUrl, { method: "POST", headers: headers(secondCookie), body: JSON.stringify({ token: tokenResponse.data.token }) })).status, 403);
    const checkedIn = await api(checkInUrl, { method: "POST", headers: headers(promoterCookie), body: JSON.stringify({ token: tokenResponse.data.token }) });
    assert.equal(checkedIn.status, 200);
    assert.equal(checkedIn.data.status, "CHECKED_IN");
    assert.equal((await api(checkInUrl, { method: "POST", headers: headers(promoterCookie), body: JSON.stringify({ token: tokenResponse.data.token }) })).data.status, "CHECKED_IN");
    assert.equal((await api(registrationUrl, { method: "DELETE", headers: headers(firstCookie) })).status, 409);
    assert.equal((await api(checkInUrl, { headers: headers(promoterCookie) })).data.filter(item => item.status === "CHECKED_IN").length, 1);
    console.log("PASS: authenticated RSVP, capacity, waitlist, QR issuance, owner-only check-in, idempotence");

    phase = "waitlist promotion";
    const promotionEvent = await createEvent(promoter.id, { capacity: 1 });
    const promotionUrl = `/api/events/${promotionEvent.id}/registration`;
    assert.equal((await api(promotionUrl, { method: "POST", headers: headers(firstCookie) })).data.status, "CONFIRMED");
    assert.equal((await api(promotionUrl, { method: "POST", headers: headers(secondCookie) })).data.status, "WAITLISTED");
    const secondSocket = await connect(secondCookie);
    const liveNotice = notice(secondSocket);
    assert.equal((await api(promotionUrl, { method: "DELETE", headers: headers(firstCookie) })).status, 200);
    assert.equal((await api(promotionUrl, { headers: headers(secondCookie) })).data.registration.status, "CONFIRMED");
    assert.ok(await db.notification.count({ where: { userId: second.id, title: "Sua presença foi confirmada" } }));
    await liveNotice;
    console.log("PASS: cancellation promotes first waitlisted attendee and delivers a targeted Socket.IO notice");

    phase = "report and moderation";
    const reportUrl = `/api/events/${event.id}/reports`;
    const reportBody = JSON.stringify({ reason: "INCORRECT_INFORMATION", details: "Temporary test report details" });
    assert.equal((await api(reportUrl, { method: "POST", headers: headers(firstCookie), body: reportBody })).status, 201);
    assert.equal((await api(reportUrl, { method: "POST", headers: headers(firstCookie), body: reportBody })).status, 409);
    assert.equal((await api("/api/admin/reports", { headers: headers(firstCookie) })).status, 403);
    const adminReports = await api("/api/admin/reports", { headers: headers(adminCookie) });
    assert.equal(adminReports.status, 200);
    const report = adminReports.data.reports.find(item => item.event.id === event.id && item.reporter.id === first.id);
    assert.ok(report);
    const reviewUrl = `/api/admin/reports/${report.id}`;
    const reviewBody = JSON.stringify({ status: "RESOLVED", resolutionNote: "Reviewed in integration test" });
    assert.equal((await api(reviewUrl, { method: "PATCH", headers: headers(firstCookie), body: reviewBody })).status, 403);
    assert.equal((await api(reviewUrl, { method: "PATCH", headers: headers(adminCookie), body: reviewBody })).data.report.status, "RESOLVED");
    assert.equal((await api(reviewUrl, { method: "PATCH", headers: headers(adminCookie), body: reviewBody })).status, 409);
    console.log("PASS: authenticated report, duplicate protection, admin moderation, role isolation");

    phase = "recurring event series";
    const source = await createEvent(promoter.id, { status: "DRAFT", validate: false, capacity: 7 });
    const { criarSerieRecorrente } = load("lib/services/recurrence.ts");
    const denied = await criarSerieRecorrente(source.id, { frequency: "WEEKLY", interval: 1, count: 3 }, async () => first);
    assert.equal(denied.success, false);
    const created = await criarSerieRecorrente(source.id, { frequency: "WEEKLY", interval: 1, count: 3 }, async () => promoter);
    assert.equal(created.success, true, created.message);
    const dates = await db.events.findMany({ where: { recurrenceSeriesId: { not: null }, id: { in: created.eventIds } }, orderBy: { recurrenceIndex: "asc" } });
    assert.equal(dates.length, 3);
    assert.ok(dates.every(item => item.capacity === 7 && item.status === "DRAFT"));
    for (const item of dates) if (!eventIds.includes(item.id)) eventIds.push(item.id);
    seriesIds.push(dates[0].recurrenceSeriesId);
    console.log("PASS: recurrence ownership, three persisted dates, capacity and draft isolation");
  } catch (error) {
    console.error(`FAIL at ${phase}: ${error?.code || error?.message || "error"}`);
    throw error;
  } finally {
    for (const socket of sockets) socket.disconnect();
    try {
      await db.eventHistory.deleteMany({ where: { eventId: { in: eventIds } } });
      await db.events.deleteMany({ where: { id: { in: eventIds } } });
      await db.eventSeries.deleteMany({ where: { id: { in: seriesIds.filter(Boolean) } } });
      await db.notification.deleteMany({ where: { OR: [
        { userId: { in: users.map(user => user.id) } },
        { title: "Nova denúncia de evento", message: `O evento ${prefix} event recebeu uma denúncia.` },
      ] } });
      await db.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
    } finally {
      await db.$disconnect();
    }
  }
}

run().catch(() => { process.exitCode = 1; });
