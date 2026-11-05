import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { io } from "socket.io-client";

if (process.env.E2E_ALLOW_WRITES !== "true" || !process.env.E2E_DATABASE_URL) throw new Error("Autorize as fixtures antes do teste.");
const origin = "https://events-project-lake.vercel.app";
const fixture = JSON.parse(await readFile(new URL("../.e2e-auditoria/fixtures.json", import.meta.url), "utf8"));
if (fixture.state !== "active" || fixture.users.some(user => !user.email.startsWith(`e2e-auditoria-${fixture.run}-`) || !user.email.endsWith("@example.invalid"))) throw new Error("Fixtures inválidas.");
const db = new PrismaClient({ datasourceUrl: process.env.E2E_DATABASE_URL });
const browser = await chromium.launch();
const sockets = [];
const blocked = new Set();
const mediaFile = new URL("../.e2e-auditoria/media.json", import.meta.url);
const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGQAAAABJRU5ErkJggg==", "base64");
let phase = "sessões";
let notificationId;
try {
  const contexts = {};
  for (const user of fixture.users) {
    phase = "sessão " + user.role;
    const context = await browser.newContext({ baseURL: origin });
    await context.addInitScript(() => {
      window.auditCspOrigins = [];
      document.addEventListener("securitypolicyviolation", event => { window.auditCspOrigins.push(event.blockedURI); });
    });
    const page = await context.newPage();
    await page.goto("/login", { timeout: 60000, waitUntil: "domcontentloaded" });
    await page.locator("#email").fill(user.email);
    await page.locator("#password").fill(user.password);
    await page.locator("form button[type=submit]").click();
    await page.waitForURL(url => url.pathname !== "/login", { timeout: 60000 });
    const session = await (await context.request.get("/api/auth/session")).json();
    assert.equal(session.user?.id, user.id);
    contexts[user.role] = { context, page, user };
  }
  const attendee = contexts.ATTENDEE;
  if (process.argv.includes("--verify-persistence")) {
    phase = "persistência após redeploy";
    const saved = JSON.parse(await readFile(mediaFile, "utf8"));
    assert.equal((await attendee.context.request.get(saved.profile)).status(), 200);
    assert.equal((await attendee.context.request.get(saved.chat)).status(), 200);
    console.log("PASS avatar e imagem privada persistem após redeploy");
  } else {
    phase = "upload do perfil";
    const upload = await attendee.context.request.post("/api/upload", { headers: { Origin: origin }, multipart: {
      userId: attendee.user.id, file: { name: "TESTE-AUDITORIA.png", mimeType: "image/png", buffer: image },
    } });
    assert.equal(upload.status(), 200);
    const { filePath } = await upload.json();
    await attendee.page.goto("/Profile");
    await attendee.page.reload();
    assert.equal((await attendee.context.request.get(filePath)).status(), 200);
    assert.equal((await db.user.findUnique({ where: { id: attendee.user.id } })).image, filePath);
    console.log("PASS upload de perfil e leitura após recarregar");

    phase = "imagem privada de chat";
    const pair = [contexts.ATTENDEE.user, contexts.ORGANIZER.user];
    for (const user of pair) {
      await db.eventRegistration.upsert({ where: { eventId_userId: { eventId: fixture.eventId, userId: user.id } }, update: {}, create: { eventId: fixture.eventId, userId: user.id, status: "CONFIRMED" } });
      await db.partyProfile.create({ data: { eventId: fixture.eventId, userId: user.id, displayName: "TESTE-AUDITORIA", interests: [], intent: "FRIENDSHIP" } });
    }
    const match = await db.partyMatch.create({ data: { eventId: fixture.eventId, userAId: pair[0].id, userBId: pair[1].id } });
    const imageBase = `/api/party-connections/${fixture.eventId}/matches/${match.id}/images`;
    const attached = await attendee.context.request.post(imageBase, { headers: { Origin: origin }, multipart: { file: { name: "TESTE-AUDITORIA.png", mimeType: "image/png", buffer: image } } });
    assert.equal(attached.status(), 200);
    const chat = await attached.json();
    const row = await db.communityEntry.findUnique({ where: { id: chat.id } });
    const message = await db.partyMessage.create({ data: { matchId: match.id, authorId: attendee.user.id, clientId: randomUUID(), text: "TESTE-AUDITORIA imagem privada" } });
    await db.communityEntry.update({ where: { id: chat.id }, data: { data: { ...row.data, messageId: message.id } } });
    assert.equal((await attendee.context.request.get(chat.url)).status(), 200);
    assert.equal((await contexts.ORGANIZER.context.request.get(chat.url)).status(), 200);
    assert.ok([401, 403, 404].includes((await contexts.ADMIN.context.request.get(chat.url)).status()));
    const anonymous = await browser.newContext({ baseURL: origin });
    assert.ok([401, 403, 404].includes((await anonymous.request.get(chat.url)).status()));
    await anonymous.close();
    await writeFile(mediaFile, JSON.stringify({ profile: filePath, chat: chat.url, blobKeys: [filePath.slice(1), "private/chat/" + row.data.filename] }), { mode: 0o600 });
    console.log("PASS imagem de chat restrita aos dois participantes, inclusive contra admin externo e anônimo");

    phase = "worker de notificações";
    const ticket = await attendee.context.request.post("/api/socket-ticket", { headers: { Origin: origin } });
    assert.equal(ticket.status(), 200);
    const socket = io("https://eventmap-socket.onrender.com", { auth: await ticket.json(), transports: ["websocket"], extraHeaders: { Origin: origin }, timeout: 45000, reconnection: false });
    sockets.push(socket);
    await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); });
    let received = 0;
    const start = Date.now();
    const signal = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Worker sem sinal em 60 s")), 60000);
      socket.on("notification-updated", () => { received++; clearTimeout(timer); resolve(); });
    });
    signal.catch(() => undefined);
    const notification = await db.notification.create({ data: { userId: attendee.user.id, title: "TESTE-AUDITORIA worker", message: "TESTE-AUDITORIA entrega única", href: `/eventos/${fixture.eventId}` } });
    notificationId = notification.id;
    await signal;
    const elapsed = Date.now() - start;
    await new Promise(resolve => setTimeout(resolve, 11000));
    assert.equal(received, 1);
    console.log("PASS worker: sinal único em", elapsed, "ms, sem repetição nas duas consultas seguintes");

    phase = "reconexão";
    socket.disconnect();
    socket.auth = await (await attendee.context.request.post("/api/socket-ticket", { headers: { Origin: origin } })).json();
    const reconnect = new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); });
    socket.connect();
    await reconnect;
    console.log("PASS reconexão com novo ticket; hibernação real medida separadamente");
  }
  phase = "console e páginas";
  for (const path of ["/", "/login", "/#home-discovery", "/EventsCreated", `/eventos/${fixture.eventId}`, `/eventos/${fixture.eventId}/chat`, "/Profile", "/admin"]) {
    const actor = path === "/admin" ? contexts.ADMIN : attendee;
    const response = await actor.page.goto(path);
    assert.ok(response && response.status() < 400);
    await actor.page.waitForLoadState("domcontentloaded");
    for (const uri of await actor.page.evaluate(() => window.auditCspOrigins || [])) blocked.add(uri.startsWith("https:") || uri.startsWith("wss:") ? new URL(uri).origin : uri);
  }
  console.log("PASS páginas principais e painel admin; origens CSP reportadas:", JSON.stringify([...blocked]));
} catch (error) {
  const name = error instanceof Error && /^(Error|TimeoutError|AssertionError|PrismaClient[A-Za-z]+Error)$/.test(error.name) ? error.name : "Error";
  const actual = typeof error?.actual === "number" ? error.actual : undefined;
  const expected = typeof error?.expected === "number" ? error.expected : undefined;
  console.error("FAIL auditoria complementar na etapa", phase, name, { actual, expected }, "Detalhes privados omitidos.");
  process.exitCode = 1;
} finally {
  for (const socket of sockets) socket.disconnect();
  if (notificationId) await db.notification.deleteMany({ where: { id: notificationId, userId: fixture.users.find(user => user.role === "ATTENDEE").id } });
  await browser.close();
  await db.$disconnect();
}
