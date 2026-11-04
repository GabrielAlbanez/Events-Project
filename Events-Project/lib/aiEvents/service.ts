import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { isAccountSuspended } from "../auth/accountAccess";
import { notifyEventAudience } from "../eventNotifications";
import { eventInstant } from "../eventTime";
import { parseEventInput } from "../../schemas/eventInput";
import type { AiEventAction } from "../../schemas/aiEvents";
import { aiConfigured, canonicalSourceUrl, discoverEventSources, inspectEventSource, publicCatalogUrl, type VerifiedEventImport } from "./provider";

export interface AiEventsDependencies {
  configured: typeof aiConfigured;
  discover: typeof discoverEventSources;
  inspect: typeof inspectEventSource;
  now: () => Date;
}
const defaults: AiEventsDependencies = { configured: aiConfigured, discover: discoverEventSources, inspect: inspectEventSource, now: () => new Date() };
const CONFIG_ID = "default";
const HOUR = 60 * 60 * 1000;
const LEASE = 10 * 60 * 1000;
export class AiEventsError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
async function admin(db: PrismaClient | Prisma.TransactionClient, id: string) {
  const user = await db.user.findUnique({ where: { id }, select: { id: true, role: true, suspendedAt: true, suspendedUntil: true } });
  if (!user || user.role !== "ADMIN" || isAccountSuspended(user)) throw new AiEventsError(403, "Acesso restrito ao administrador.");
  return user;
}
async function transaction<T>(db: PrismaClient, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000, maxWait: 10000 }); }
    catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code) && attempt < 2) continue; throw error; }
  }
}
async function lock(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('eventmap:ai-events'))::text`;
}
async function signalAdmins(tx: Prisma.TransactionClient): Promise<void> {
  const admins = await tx.user.findMany({ where: { role: "ADMIN" }, select: { id: true, suspendedAt: true, suspendedUntil: true } });
  const rooms = admins.filter(user => !isAccountSuspended(user)).map(user => ({ room: "user:" + user.id }));
  if (rooms.length) await tx.communitySignal.createMany({ data: rooms });
}
function validatedEvent(value: VerifiedEventImport, now: Date) {
  const start = new Date(value.startDate);
  if (!Number.isFinite(start.getTime()) || start <= now) throw new AiEventsError(422, "A fonte precisa informar um evento futuro.");
  const form = new FormData();
  for (const [key, field] of Object.entries(value.event)) {
    if (key !== "carrossel" && key !== "banner") form.set(key, field === null ? "" : String(field));
  }
  const result = parseEventInput(form, true);
  if (!result.success) throw new AiEventsError(422, "As informações oficiais estão incompletas para publicação.");
  const timezone = value.event.timezone || "America/Sao_Paulo";
  const parsedStart = eventInstant(result.data.dataInicio, result.data.startTime, timezone);
  if (!parsedStart || Math.abs(parsedStart.getTime() - start.getTime()) >= 60000) throw new AiEventsError(422, "A data da fonte precisa ser conferida novamente.");
  if (!value.event.banner || value.event.banner.length > 2048 || !/^(?:\/branding\/[a-z0-9-]+\.svg|https:\/\/)/i.test(value.event.banner)) throw new AiEventsError(422, "A fonte não possui uma imagem válida.");
  return { ...result.data, timezone, banner: value.event.banner, carrossel: [] as string[] };
}

export async function aiEventsSnapshot(db: PrismaClient, actorId: string, deps: AiEventsDependencies = defaults) {
  await admin(db, actorId);
  const [config, runs, candidates] = await Promise.all([
    db.aiEventAutomation.findUnique({ where: { id: CONFIG_ID } }),
    db.aiEventRun.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    db.aiEventCandidate.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return {
    configured: deps.configured(),
    config: config ? { city: config.city, maxPerRun: config.maxPerRun, approvalMode: "REVIEW" as const, enabled: config.enabled, authorizedAt: config.authorizedAt?.toISOString() ?? null, nextRunAt: config.nextRunAt?.toISOString() ?? null } : null,
    runs: runs.map(run => ({ id: run.id, status: run.status, createdCount: run.createdCount, message: run.message, startedAt: run.startedAt?.toISOString() ?? null, finishedAt: run.finishedAt?.toISOString() ?? null })),
    candidates: candidates.map(candidate => ({ id: candidate.id, status: candidate.status, sourceUrl: candidate.sourceUrl, name: candidate.name, startDate: candidate.startDate.toISOString(), address: candidate.address, eventId: candidate.eventId, createdAt: candidate.createdAt.toISOString() })),
  };
}

export async function aiEventsAction(db: PrismaClient, actorId: string, input: AiEventAction, deps: AiEventsDependencies = defaults): Promise<void> {
  await admin(db, actorId);
  const city = input.action === "settings" || input.action === "run" ? input.city : undefined;
  if (city) {
    try { publicCatalogUrl(city); }
    catch { throw new AiEventsError(400, "Selecione uma cidade com catálogo disponível."); }
  }
  if (input.action === "approve") return approve(db, actorId, input.id, deps);
  await transaction(db, async tx => {
    await lock(tx); await admin(tx, actorId);
    if (input.action === "settings") {
      if (input.enabled && !input.authorize) throw new AiEventsError(400, "Autorize expressamente a busca automática.");
      if (input.enabled && !deps.configured()) throw new AiEventsError(503, "As fontes públicas estão temporariamente indisponíveis.");
      const previous = await tx.aiEventAutomation.findUnique({ where: { id: CONFIG_ID } });
      const now = deps.now();
      const nextRunAt = input.enabled ? (previous?.enabled ? previous.nextRunAt ?? now : now) : null;
      const data = { city: input.city, maxPerRun: input.maxPerRun, enabled: input.enabled, authorizedBy: actorId, authorizedAt: input.enabled ? now : null, nextRunAt };
      await tx.aiEventAutomation.upsert({ where: { id: CONFIG_ID }, create: { id: CONFIG_ID, ...data }, update: data });
    } else if (input.action === "reject") {
      if (!(await tx.aiEventCandidate.updateMany({ where: { id: input.id, status: "PENDING" }, data: { status: "REJECTED" } })).count) throw new AiEventsError(409, "A proposta já foi analisada ou não existe.");
    } else {
      if (input.action === "run" && !deps.configured()) throw new AiEventsError(503, "As fontes públicas estão temporariamente indisponíveis.");
      if (input.action === "inspect") {
        try { canonicalSourceUrl(input.url); } catch { throw new AiEventsError(400, "Use uma página HTTPS de uma das fontes oficiais permitidas."); }
      }
      const config = await tx.aiEventAutomation.upsert({ where: { id: CONFIG_ID }, create: { id: CONFIG_ID }, update: {} });
      if (await tx.aiEventRun.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } }) >= 3) throw new AiEventsError(429, "Aguarde a fila atual antes de solicitar outra busca.");
      if (await tx.aiEventRun.count({ where: { requestedBy: actorId, createdAt: { gte: new Date(deps.now().getTime() - HOUR) } } }) >= 10) throw new AiEventsError(429, "Limite de buscas por hora atingido.");
      await tx.aiEventRun.create({ data: { automationId: config.id, requestedBy: actorId, trigger: input.action === "inspect" ? "SOURCE" : "MANUAL", sourceUrl: input.action === "inspect" ? input.url : null, city: input.action === "run" ? input.city ?? config.city : config.city, maxPerRun: input.action === "run" ? input.maxPerRun ?? config.maxPerRun : config.maxPerRun } });
    }
    await signalAdmins(tx);
  });
}

async function approve(db: PrismaClient, actorId: string, id: string, deps: AiEventsDependencies): Promise<void> {
  const candidate = await db.aiEventCandidate.findUnique({ where: { id } });
  if (!candidate || candidate.status !== "PENDING") throw new AiEventsError(409, "A proposta já foi analisada ou não existe.");
  // Re-read the official source outside a database transaction. Consent is to the reviewed facts.
  const verified = await deps.inspect(candidate.sourceUrl);
  const eventData = validatedEvent(verified, deps.now());
  if (verified.sourceHash !== candidate.sourceHash) {
    await transaction(db, async tx => {
      await admin(tx, actorId);
      await tx.aiEventCandidate.updateMany({ where: { id, status: "PENDING", sourceHash: candidate.sourceHash }, data: { sourceHash: verified.sourceHash, sourceVerifiedAt: deps.now(), name: verified.name, startDate: new Date(verified.startDate), address: verified.address, data: eventData } });
      await signalAdmins(tx);
    });
    throw new AiEventsError(409, "A fonte foi atualizada. Confira os novos dados e aprove novamente.");
  }
  await transaction(db, async tx => {
    await lock(tx); await admin(tx, actorId);
    const current = await tx.aiEventCandidate.findUnique({ where: { id } });
    if (!current || current.status !== "PENDING" || current.sourceHash !== verified.sourceHash) throw new AiEventsError(409, "A proposta mudou. Atualize antes de aprovar.");
    const event = await tx.events.create({ data: { ...eventData, userId: actorId, status: "PUBLISHED", validate: true, validatedBy: actorId, validatedAt: deps.now() } });
    await tx.aiEventCandidate.update({ where: { id }, data: { status: "PUBLISHED", eventId: event.id, approvedBy: actorId, approvedAt: deps.now(), sourceVerifiedAt: deps.now() } });
    await tx.eventHistory.createMany({ data: ["CREATED", "VALIDATED"].map(action => ({ eventId: event.id, eventName: event.nome, promoterId: actorId, actorId, action: action as "CREATED" | "VALIDATED", note: "Importação de fonte oficial aprovada individualmente pelo administrador." })) });
    await notifyEventAudience(tx, event, { title: "Evento publicado", message: "Um evento foi publicado após revisão administrativa.", includeFollowers: true, includeFavorites: false });
    await tx.$queryRaw`SELECT pg_notify('eventmap_events_updated', 'published')::text`;
    await signalAdmins(tx);
  });
}

/** One bounded sweep. A database lease serializes all worker processes. It never publishes. */
export async function pollAiEvents(db: PrismaClient, deps: AiEventsDependencies = defaults): Promise<boolean> {
  const token = randomUUID();
  const claimed = await transaction(db, async tx => {
    await lock(tx);
    const now = deps.now(), config = await tx.aiEventAutomation.findUnique({ where: { id: CONFIG_ID } });
    if (!config || config.leaseUntil && config.leaseUntil > now) return null;
    await tx.aiEventRun.updateMany({ where: { status: "RUNNING" }, data: { status: "FAILED", finishedAt: now, message: "Busca interrompida. Solicite novamente se necessário." } });
    if (config.enabled && config.nextRunAt && config.nextRunAt <= now && deps.configured() &&
        !await tx.aiEventRun.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } })) {
      try { if (!config.authorizedBy) throw new Error(); await admin(tx, config.authorizedBy); }
      catch { await tx.aiEventAutomation.update({ where: { id: CONFIG_ID }, data: { enabled: false, nextRunAt: null } }); await signalAdmins(tx); return null; }
      await tx.aiEventAutomation.update({ where: { id: CONFIG_ID }, data: { nextRunAt: new Date(now.getTime() + HOUR) } });
      await tx.aiEventRun.create({ data: { automationId: config.id, requestedBy: config.authorizedBy!, trigger: "HOURLY", city: config.city, maxPerRun: config.maxPerRun } });
    }
    const run = await tx.aiEventRun.findFirst({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" } });
    if (!run) return null;
    await tx.aiEventAutomation.update({ where: { id: CONFIG_ID }, data: { leaseToken: token, leaseUntil: new Date(now.getTime() + LEASE) } });
    await tx.aiEventRun.update({ where: { id: run.id }, data: { status: "RUNNING", startedAt: now } });
    await signalAdmins(tx);
    return run;
  });
  if (!claimed) return false;
  let createdCount = 0, skipped = 0;
  try {
    await admin(db, claimed.requestedBy);
    const urls = claimed.trigger === "SOURCE" && claimed.sourceUrl ? [claimed.sourceUrl] : await deps.discover(claimed.city, claimed.maxPerRun, async sourceUrl => Boolean(
      await db.aiEventCandidate.findUnique({ where: { sourceUrl }, select: { id: true } }),
    ));
    for (const url of Array.from(new Set(urls)).slice(0, claimed.maxPerRun)) {
      try {
        const verified = await deps.inspect(url, claimed.trigger === "SOURCE" ? undefined : claimed.city), data = validatedEvent(verified, deps.now());
        const created = await transaction(db, async tx => {
          await lock(tx); await admin(tx, claimed.requestedBy);
          const lease = await tx.aiEventAutomation.findUnique({ where: { id: CONFIG_ID } });
          if (lease?.leaseToken !== token || !lease.leaseUntil || lease.leaseUntil <= deps.now()) throw new AiEventsError(409, "A busca perdeu sua autorização de execução.");
          if (await tx.aiEventCandidate.findUnique({ where: { sourceUrl: verified.sourceUrl }, select: { id: true } })) return false;
          await tx.aiEventCandidate.create({ data: { runId: claimed.id, sourceUrl: verified.sourceUrl, sourceHash: verified.sourceHash, sourceVerifiedAt: deps.now(), name: verified.name, startDate: new Date(verified.startDate), address: verified.address, data } });
          await signalAdmins(tx); return true;
        });
        if (created) createdCount++;
      } catch (error) { if (error instanceof AiEventsError && [403, 409].includes(error.status)) throw error; skipped++; }
    }
    await finish("SUCCEEDED", createdCount ? `${createdCount} proposta(s) aguardando aprovação individual.${skipped ? ` ${skipped} fonte(s) não puderam ser verificadas.` : ""}` : "Nenhum novo evento verificável foi encontrado. Nenhum evento foi publicado.");
  } catch { await finish("FAILED", "Não foi possível consultar o catálogo público. Tente novamente mais tarde ou envie uma fonte oficial."); }
  return true;
  async function finish(status: "SUCCEEDED" | "FAILED", message: string) {
    await transaction(db, async tx => {
      await lock(tx);
      const lease = await tx.aiEventAutomation.findUnique({ where: { id: CONFIG_ID } });
      if (lease?.leaseToken !== token) return;
      await tx.aiEventRun.updateMany({ where: { id: claimed!.id, status: "RUNNING" }, data: { status, createdCount, message, finishedAt: deps.now() } });
      await tx.aiEventAutomation.update({ where: { id: CONFIG_ID }, data: { leaseToken: null, leaseUntil: null } });
      await signalAdmins(tx);
    });
  }
}
