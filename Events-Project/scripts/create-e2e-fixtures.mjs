import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const directory = fileURLToPath(new URL("../.e2e-auditoria/", import.meta.url));
export const fixtureFile = directory + "fixtures.json";
const modes = ["--dry-run", "--apply", "--teardown"].filter(mode => process.argv.includes(mode));
if (modes.length !== 1) throw new Error("Escolha --dry-run, --apply ou --teardown.");
if (!process.env.E2E_DATABASE_URL) throw new Error("Configure E2E_DATABASE_URL apenas no processo.");
const db = new PrismaClient({ datasourceUrl: process.env.E2E_DATABASE_URL });
const summary = {};
try {
  if (spawnSync("git", ["check-ignore", "--quiet", fixtureFile]).status !== 0) {
    throw new Error("A pasta de credenciais precisa estar ignorada pelo Git.");
  }
  if (modes[0] === "--dry-run") {
    await db.$queryRaw`SELECT 1`;
    console.log("DRY-RUN: conexão válida; criará 3 contas .invalid verificadas e 1 evento de teste. Nenhuma gravação.");
  } else if (modes[0] === "--apply") {
    const existing = await readFile(fixtureFile, "utf8").then(JSON.parse).catch(error => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (existing && existing.state !== "removed") throw new Error("Execute --teardown das fixtures anteriores antes de criar outras.");
    const run = randomUUID();
    const users = ["ORGANIZER", "ATTENDEE", "ADMIN"].map((role, index) => ({
      id: randomUUID(), role, email: `e2e-auditoria-${run}-${index}@example.invalid`,
      password: randomBytes(24).toString("base64url"),
    }));
    const fixture = { run, state: "prepared", eventId: randomUUID(), users };
    await mkdir(directory, { recursive: true, mode: 0o700 });
    // Save IDs before the transaction so teardown remains possible after interruption.
    await writeFile(fixtureFile, JSON.stringify(fixture), { mode: 0o600 });
    const hashes = await Promise.all(users.map(user => bcrypt.hash(user.password, 10)));
    const start = new Date(Date.now() + 2 * 3600_000);
    const end = new Date(start.getTime() + 24 * 3600_000);
    await db.$transaction(async tx => {
      for (const [index, user] of users.entries()) await tx.user.create({ data: {
        id: user.id, email: user.email, name: `TESTE-AUDITORIA ${user.role}`,
        password: hashes[index], emailVerified: true,
        role: user.role === "ORGANIZER" ? "PROMOTER" : user.role === "ADMIN" ? "ADMIN" : "BASIC",
      } });
      await tx.events.create({ data: {
        id: fixture.eventId, userId: users[0].id, nome: `TESTE-AUDITORIA ${run}`,
        descricao: "Evento temporário automatizado de auditoria. Será removido ao concluir os testes.",
        banner: "", carrossel: [], endereco: "TESTE-AUDITORIA — ambiente automatizado",
        linkParaCompra: "", status: "PUBLISHED", validate: true, category: "Outros", isFree: true,
        dataInicio: start.toISOString().slice(0, 10), startTime: start.toISOString().slice(11, 16),
        dataFim: end.toISOString().slice(0, 10), endTime: end.toISOString().slice(11, 16), timezone: "UTC",
      } });
    });
    fixture.state = "active";
    await writeFile(fixtureFile, JSON.stringify(fixture), { mode: 0o600 });
    console.log("APPLY: 3 contas e 1 evento criados. Credenciais no arquivo local ignorado; nenhum segredo exibido.");
  } else {
    const fixture = JSON.parse(await readFile(fixtureFile, "utf8"));
    if (!/^[0-9a-f-]{36}$/.test(fixture.run) || fixture.users.length !== 3 ||
        fixture.users.some(user => !user.email.startsWith(`e2e-auditoria-${fixture.run}-`) || !user.email.endsWith("@example.invalid"))) {
      throw new Error("Manifesto de teste inválido; limpeza recusada.");
    }
    const ids = fixture.users.map(user => user.id);
    await db.$transaction(async tx => {
      const accounts = await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, name: true } });
      if (accounts.some(account => !fixture.users.some(user => user.id === account.id && user.email === account.email) || !account.name?.startsWith("TESTE-AUDITORIA"))) {
        throw new Error("Identidade das fixtures mudou; limpeza recusada.");
      }
      const events = await tx.events.findMany({ where: { OR: [{ id: fixture.eventId }, { userId: { in: ids } }] }, select: { id: true, nome: true, userId: true } });
      if (events.some(event => !event.nome.startsWith("TESTE-AUDITORIA") || !ids.includes(event.userId))) {
        throw new Error("Evento fora do escopo; limpeza recusada.");
      }
      const eventIds = events.map(event => event.id);
      const whereEvent = { eventId: { in: eventIds } };
      const outsiders = await tx.eventRegistration.count({ where: { ...whereEvent, userId: { notIn: ids } } }) +
        await tx.eventChatMessage.count({ where: { ...whereEvent, authorId: { notIn: ids } } }) +
        await tx.favorite.count({ where: { ...whereEvent, userId: { notIn: ids } } }) +
        await tx.communityEntry.count({ where: { ...whereEvent, authorId: { notIn: ids } } });
      if (outsiders) throw new Error("Dados externos às fixtures encontrados; limpeza recusada.");
      summary.registrations = await tx.eventRegistration.count({ where: whereEvent });
      summary.messages = await tx.eventChatMessage.count({ where: whereEvent });
      summary.notifications = await tx.notification.count({ where: { userId: { in: ids } } });
      summary.sessions = (await tx.session.deleteMany({ where: { userId: { in: ids } } })).count;
      const quotaIds = ids.map(id => "profile-upload-rate:" + createHash("sha256").update(id).digest("hex"));
      summary.uploadQuotas = (await tx.verificationToken.deleteMany({ where: { identifier: { in: quotaIds } } })).count;
      summary.history = (await tx.eventHistory.deleteMany({ where: { eventId: { in: eventIds }, actorId: { in: [...ids, "system"] } } })).count;
      summary.events = (await tx.events.deleteMany({ where: { id: { in: eventIds } } })).count;
      summary.users = (await tx.user.deleteMany({ where: { id: { in: ids } } })).count;
      const remaining = await tx.user.count({ where: { id: { in: ids } } }) +
        await tx.events.count({ where: { id: { in: eventIds } } }) +
        await tx.notification.count({ where: { userId: { in: ids } } }) +
        await tx.eventRegistration.count({ where: whereEvent }) + await tx.eventChatMessage.count({ where: whereEvent });
      if (remaining) throw new Error("Limpeza incompleta.");
    });
    // Remove passwords from the receipt after database sessions and accounts are removed.
    await writeFile(fixtureFile, JSON.stringify({ ...fixture, state: "removed", users: fixture.users.map(({ password, ...user }) => user), summary }), { mode: 0o600 });
    console.log("TEARDOWN", JSON.stringify({ ...summary, remaining: 0 }));
  }
} catch (error) {
  console.error("Fixtures não concluídas:", error instanceof Error ? error.name : "Error", "Detalhes privados omitidos.");
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
