import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { io } from "socket.io-client";

const required = [
  "E2E_ORGANIZER_EMAIL", "E2E_ORGANIZER_PASSWORD", "E2E_ATTENDEE_EMAIL",
  "E2E_ATTENDEE_PASSWORD", "E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD",
  "E2E_EVENT_ID", "E2E_DATABASE_URL",
];
const missing = required.filter(key => !process.env[key]);
if (missing.length || process.env.E2E_ALLOW_WRITES !== "true") {
  console.error("Configure E2E_ALLOW_WRITES=true e as variáveis:", missing.join(", "));
  process.exit(1);
}
const { chromium } = await import("playwright");
const origin = "https://events-project-lake.vercel.app";
const socketOrigin = "https://eventmap-socket.onrender.com";
const title = "TESTE-AUDITORIA " + randomUUID();
const db = new PrismaClient({ datasourceUrl: process.env.E2E_DATABASE_URL });
const browser = await chromium.launch();
const sockets = [];
let organizerId, attendeeId, registrationCreated = false, phase = "login";

async function login(role) {
  const context = await browser.newContext({ baseURL: origin });
  const page = await context.newPage();
  await page.goto("/login");
  await page.locator("#email").fill(process.env["E2E_" + role + "_EMAIL"]);
  await page.locator("#password").fill(process.env["E2E_" + role + "_PASSWORD"]);
  await page.locator("form button[type=submit]").click();
  await page.waitForURL(url => url.pathname !== "/login");
  const response = await context.request.get("/api/auth/session");
  const session = await response.json();
  assert.ok(session.user?.id, "Sessão autenticada ausente");
  return { context, page, user: session.user };
}

async function connect(context) {
  const response = await context.request.post("/api/socket-ticket", { headers: { Origin: origin } });
  assert.equal(response.status(), 200);
  const socket = io(socketOrigin, { auth: await response.json(), transports: ["websocket"], extraHeaders: { Origin: origin }, timeout: 45_000, reconnection: false });
  sockets.push(socket);
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  return socket;
}

function chatUpdate(socket, eventId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Sinal de chat não recebido")), 25_000);
    socket.on("community-updated", payload => {
      if (payload?.room !== "chat:" + eventId) return;
      clearTimeout(timer);
      resolve();
    });
  });
}

const fixtureId = process.env.E2E_EVENT_ID;
try {
  assert.equal(new Set(required.filter(key => key.endsWith("_EMAIL")).map(key => process.env[key].toLowerCase())).size, 3);
  const organizer = await login("ORGANIZER");
  const attendee = await login("ATTENDEE");
  const admin = await login("ADMIN");
  organizerId = organizer.user.id;
  attendeeId = attendee.user.id;
  assert.equal(admin.user.role, "ADMIN");
  assert.notEqual(organizer.user.role, "ADMIN");
  assert.notEqual(attendee.user.role, "ADMIN");
  await admin.page.goto("/admin");
  await admin.page.waitForURL(url => url.pathname === "/admin");
  await admin.page.getByLabel("Lista de usuários").waitFor();
  console.log("PASS três sessões independentes e painel admin");

  phase = "identificação do evento";
  const fixture = await db.events.findUnique({ where: { id: fixtureId } });
  assert.ok(fixture?.nome.startsWith("TESTE-AUDITORIA") && fixture.status === "PUBLISHED" && fixture.userId === organizerId);
  assert.equal(await db.eventRegistration.findUnique({ where: { eventId_userId: { eventId: fixtureId, userId: attendeeId } } }), null, "A inscrição de teste já existe");
  const catalog = await organizer.context.request.get("/api/AllEvents");
  assert.ok((await catalog.json()).some(event => event.id === fixtureId && event.nome === fixture.nome), "O evento não consta no catálogo publicado");

  phase = "inscrição e check-in";
  const eventPath = "/api/events/" + fixtureId;
  const headers = { Origin: origin };
  const registration = await attendee.context.request.post(eventPath + "/registration", { headers });
  assert.ok(registration.ok(), "A inscrição falhou");
  registrationCreated = true;
  const qr = await attendee.context.request.get(eventPath + "/check-in-token");
  assert.ok(qr.ok(), "O código de entrada falhou");
  const { token } = await qr.json();
  const checkIn = await organizer.context.request.post(eventPath + "/check-in", { headers, data: { token } });
  assert.ok(checkIn.ok(), "O check-in falhou");
  console.log("PASS inscrição e check-in");

  phase = "chat do evento";
  const [sender, peer] = await Promise.all([connect(organizer.context), connect(attendee.context)]);
  for (const socket of [sender, peer]) {
    const result = await socket.timeout(10_000).emitWithAck("community-subscribe", { chatEventId: fixtureId });
    assert.equal(result.ok, true);
  }
  const clientId = randomUUID();
  const signal = chatUpdate(peer, fixtureId);
  signal.catch(() => undefined);
  try {
    const message = await organizer.context.request.post("/api/event-chat/" + fixtureId, { headers, data: { clientId, text: title } });
    assert.ok(message.ok(), "O envio de chat falhou");
    await signal;
    const history = await attendee.context.request.get("/api/event-chat/" + fixtureId);
    assert.ok(history.ok() && (await history.json()).messages.some(message => message.text === title));
  } finally {
    await db.eventChatMessage.deleteMany({ where: { eventId: fixtureId, authorId: organizerId, clientId, text: title } });
  }
  console.log("PASS chat privado entre as duas sessões");

  phase = "criação de rascunho";
  await organizer.page.goto("/CriarEvento");
  await organizer.page.getByLabel(/Nome do evento/).fill(title);
  await organizer.page.getByRole("button", { name: "Salvar rascunho" }).click();
  await organizer.page.waitForURL(url => url.pathname === "/myEvents", { timeout: 30_000 });
  assert.equal(await db.events.count({ where: { nome: title, userId: organizerId, status: "DRAFT" } }), 1);
  console.log("PASS criação do rascunho de teste");
} catch (error) {
  const name = error instanceof Error && /^(Error|AssertionError|TimeoutError|TypeError|PrismaClient[A-Za-z]+Error)$/.test(error.name)
    ? error.name : "Error";
  const message = error instanceof Error ? error.message : "";
  const safeMessage = /^(Sessão autenticada ausente|A inscrição de teste já existe|O evento não consta no catálogo publicado|A inscrição falhou|O código de entrada falhou|O check-in falhou|O envio de chat falhou|Sinal de chat não recebido)$/.test(message)
    ? message
    : name === "TimeoutError" ? "Tempo limite excedido durante a etapa." : "Detalhes omitidos para proteger credenciais e dados.";
  console.error("FAIL na etapa", phase, name, safeMessage);
  process.exitCode = 1;
} finally {
  for (const socket of sockets) socket.disconnect();
  try {
    if (organizerId) await db.events.deleteMany({ where: { nome: title, userId: organizerId, status: "DRAFT" } });
    if (registrationCreated) await db.eventRegistration.deleteMany({ where: { eventId: fixtureId, userId: attendeeId } });
    console.log("PASS limpeza do rascunho e inscrição criados pelo teste");
  } finally {
    await db.$disconnect();
    await browser.close();
  }
}
