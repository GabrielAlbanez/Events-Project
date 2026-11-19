import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { isAccountSuspended } from "../auth/accountAccess";
import { eventInstant } from "../eventTime";
import { parseEventInput } from "../../schemas/eventInput";
import type { AiEventAction } from "../../schemas/aiEvents";
import { aiConfigured, canonicalSourceUrl, discoverAllSources, discoverEventSources, inspectEventSource, publicCatalogUrl, readBudget, type DiscoveredSource, type VerifiedEventImport } from "./provider";
import { platformOf } from "./sources";

export interface AiEventsDependencies {
  configured: typeof aiConfigured;
  discover: typeof discoverEventSources;
  discoverAll: typeof discoverAllSources;
  inspect: typeof inspectEventSource;
  now: () => Date;
}
const defaults: AiEventsDependencies = { configured: aiConfigured, discover: discoverEventSources, discoverAll: discoverAllSources, inspect: inspectEventSource, now: () => new Date() };
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

export type ImportOutcome = "created" | "already_imported" | "previously_rejected" | "possible_duplicate" | "invalid" | "failed";
export interface ImportItem { url: string; platform: string; outcome: ImportOutcome; name?: string; eventId?: string }
export interface ImportReport { created: number; items: ImportItem[]; sourceErrors: { platform: string; message: string }[]; partial: boolean }

const comparable = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const LIVE_STATUSES = ["DRAFT", "PENDING", "CHANGES_REQUESTED", "PUBLISHED", "ENDED"] as const;

/**
 * Importa fontes já descobertas: cada evento oficial vira um evento PENDING na fila normal de validação,
 * vinculado ao seu AiEventCandidate. Nunca publica nem notifica o público.
 */
export async function importSources(db: PrismaClient, actorId: string, runId: string, sources: DiscoveredSource[], city: string | undefined, deps: AiEventsDependencies, deadline?: number): Promise<Omit<ImportReport, "sourceErrors">> {
  const items: ImportItem[] = [];
  let partial = false;
  for (const source of sources) {
    // Sem tempo para o próximo: devolve o que já criou em vez de passar do limite da rota.
    if (deadline !== undefined && Date.now() >= deadline) { partial = true; break; }
    const platform = source.platform || platformOf(source.url).label;
    const existing = await db.aiEventCandidate.findUnique({ where: { sourceUrl: source.url }, select: { status: true } });
    if (existing) { items.push({ url: source.url, platform, outcome: existing.status === "REJECTED" ? "previously_rejected" : "already_imported" }); continue; }
    let verified: VerifiedEventImport;
    try { verified = source.verified ?? await deps.inspect(source.url, city, deadline === undefined ? undefined : readBudget(deadline)); }
    catch { items.push({ url: source.url, platform, outcome: "failed" }); continue; }
    let data: ReturnType<typeof validatedEvent>;
    try { data = validatedEvent(verified, deps.now()); }
    catch { items.push({ url: source.url, platform, outcome: "invalid", name: verified.name }); continue; }
    // Mesmo evento vindo de outra plataforma ou já cadastrado por um promotor: não cria de novo.
    const sameDay = await db.events.findMany({ where: { dataInicio: data.dataInicio, status: { in: [...LIVE_STATUSES] } }, select: { nome: true, endereco: true } });
    if (sameDay.some(event => comparable(event.nome) === comparable(data.nome) && (!city || comparable(event.endereco).includes(comparable(city))))) {
      items.push({ url: source.url, platform, outcome: "possible_duplicate", name: data.nome }); continue;
    }
    try {
      const eventId = await transaction(db, async tx => {
        await lock(tx); await admin(tx, actorId);
        if (await tx.aiEventCandidate.findUnique({ where: { sourceUrl: verified.sourceUrl }, select: { id: true } })) return null;
        const event = await tx.events.create({ data: { ...data, userId: actorId, status: "PENDING", validate: false } });
        await tx.aiEventCandidate.create({ data: { runId, sourceUrl: verified.sourceUrl, sourceHash: verified.sourceHash, sourceVerifiedAt: deps.now(), name: verified.name, startDate: new Date(verified.startDate), address: verified.address, data, status: "PENDING", eventId: event.id } });
        await tx.eventHistory.create({ data: { eventId: event.id, eventName: event.nome, promoterId: actorId, actorId, action: "CREATED", note: "Importado de " + platform } });
        await signalAdmins(tx);
        return event.id;
      });
      items.push(eventId ? { url: source.url, platform, outcome: "created", name: data.nome, eventId } : { url: source.url, platform, outcome: "already_imported", name: data.nome });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") { items.push({ url: source.url, platform, outcome: "already_imported", name: data.nome }); continue; }
      if (error instanceof AiEventsError && error.status === 403) throw error;
      items.push({ url: source.url, platform, outcome: "failed", name: data.nome });
    }
  }
  return { created: items.filter(item => item.outcome === "created").length, items, partial };
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

export async function aiEventsAction(db: PrismaClient, actorId: string, input: AiEventAction, deps: AiEventsDependencies = defaults): Promise<ImportReport | null> {
  await admin(db, actorId);
  const city = input.action === "settings" || input.action === "run" ? input.city : undefined;
  if (city) {
    try { publicCatalogUrl(city); }
    catch { throw new AiEventsError(400, "Selecione uma cidade com catálogo disponível."); }
  }
  if (input.action === "approve") { await approve(db, actorId, input.id, deps); return null; }
  if (input.action === "run" || input.action === "inspect") return importNow(db, actorId, input, deps);
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
    }
    await signalAdmins(tx);
  });
  return null;
}

/** Orçamento da busca imediata: cabe no maxDuration de 60 s da rota, com margem. */
const IMMEDIATE_BUDGET_MS = 45_000;

function runMessage(report: ImportReport): string {
  const count = (outcome: ImportOutcome) => report.items.filter(item => item.outcome === outcome).length;
  const parts = [`${report.created} evento(s) criado(s) e aguardando validação`];
  const extra: [ImportOutcome, string][] = [["already_imported", "já importado(s)"], ["previously_rejected", "rejeitado(s) antes"], ["possible_duplicate", "possível(is) duplicado(s)"], ["invalid", "sem dados suficientes"], ["failed", "com falha"]];
  for (const [outcome, label] of extra) if (count(outcome)) parts.push(`${count(outcome)} ${label}`);
  if (report.sourceErrors.length) parts.push(report.sourceErrors.map(error => error.message).join(" "));
  if (report.partial) parts.push("interrompida pelo tempo limite");
  return parts.join(" · ") + ".";
}

/** Busca por cidade ou verificação de link executada na própria requisição do admin. */
async function importNow(db: PrismaClient, actorId: string, input: Extract<AiEventAction, { action: "run" | "inspect" }>, deps: AiEventsDependencies): Promise<ImportReport> {
  if (input.action === "run" && !deps.configured()) throw new AiEventsError(503, "As fontes públicas estão temporariamente indisponíveis.");
  let sourceUrl: string | null = null;
  if (input.action === "inspect") {
    try { sourceUrl = canonicalSourceUrl(input.url); } catch { throw new AiEventsError(400, "Use uma página HTTPS de uma das fontes oficiais permitidas."); }
  }
  const run = await transaction(db, async tx => {
    await lock(tx); await admin(tx, actorId);
    const now = deps.now();
    const config = await tx.aiEventAutomation.upsert({ where: { id: CONFIG_ID }, create: { id: CONFIG_ID }, update: {} });
    if (await tx.aiEventRun.count({ where: { status: "RUNNING", startedAt: { gte: new Date(now.getTime() - LEASE) } } }) >= 3) throw new AiEventsError(429, "Aguarde as buscas em andamento.");
    if (await tx.aiEventRun.count({ where: { requestedBy: actorId, createdAt: { gte: new Date(now.getTime() - HOUR) } } }) >= 10) throw new AiEventsError(429, "Limite de buscas por hora atingido.");
    const created = await tx.aiEventRun.create({ data: {
      automationId: config.id, requestedBy: actorId, trigger: input.action === "inspect" ? "SOURCE" : "MANUAL", sourceUrl,
      city: input.action === "run" ? input.city ?? config.city : config.city, maxPerRun: input.action === "run" ? input.maxPerRun ?? config.maxPerRun : 1,
      status: "RUNNING", startedAt: now,
    } });
    await signalAdmins(tx);
    return created;
  });
  let report: ImportReport;
  try {
    const deadline = Date.now() + IMMEDIATE_BUDGET_MS;
    const discovery = sourceUrl
      ? { sources: [{ url: sourceUrl, platform: platformOf(sourceUrl).label }], sourceErrors: [], partial: false }
      : await deps.discoverAll(run.city, run.maxPerRun, { deadline, alreadyKnown: async url => Boolean(await db.aiEventCandidate.findUnique({ where: { sourceUrl: url }, select: { id: true } })) });
    const imported = await importSources(db, actorId, run.id, discovery.sources, sourceUrl ? undefined : run.city, deps, deadline);
    report = { ...imported, sourceErrors: discovery.sourceErrors, partial: discovery.partial || imported.partial };
  } catch (error) {
    await closeRun(db, run.id, "FAILED", 0, "Não foi possível consultar as fontes agora. Tente novamente em alguns minutos.", deps);
    if (error instanceof AiEventsError) throw error;
    throw new AiEventsError(502, "Não foi possível consultar as fontes agora. Tente novamente em alguns minutos.");
  }
  const status = report.sourceErrors.length && !report.items.length ? "FAILED" : report.partial ? "PARTIAL" : "SUCCEEDED";
  await closeRun(db, run.id, status, report.created, runMessage(report), deps);
  return report;
}

async function closeRun(db: PrismaClient, id: string, status: string, createdCount: number, message: string, deps: AiEventsDependencies): Promise<void> {
  await transaction(db, async tx => {
    await tx.aiEventRun.updateMany({ where: { id, status: "RUNNING" }, data: { status, createdCount, message, finishedAt: deps.now() } });
    await signalAdmins(tx);
  });
}

async function approve(db: PrismaClient, actorId: string, id: string, deps: AiEventsDependencies): Promise<void> {
  const candidate = await db.aiEventCandidate.findUnique({ where: { id } });
  // Só propostas antigas, nunca vinculadas a um evento. Aprovar não publica: cria o evento pendente de validação.
  if (!candidate || candidate.status !== "PENDING" || candidate.eventId) throw new AiEventsError(409, "A proposta já foi analisada ou não existe.");
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
    if (!current || current.status !== "PENDING" || current.eventId || current.sourceHash !== verified.sourceHash) throw new AiEventsError(409, "A proposta mudou. Atualize antes de aprovar.");
    const event = await tx.events.create({ data: { ...eventData, userId: actorId, status: "PENDING", validate: false } });
    await tx.aiEventCandidate.update({ where: { id }, data: { eventId: event.id, sourceVerifiedAt: deps.now() } });
    await tx.eventHistory.create({ data: { eventId: event.id, eventName: event.nome, promoterId: actorId, actorId, action: "CREATED", note: "Importado de " + platformOf(candidate.sourceUrl).label } });
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
    // Só runs travados: uma busca imediata em andamento (iniciada há menos de 10 min) continua RUNNING.
    await tx.aiEventRun.updateMany({ where: { status: "RUNNING", startedAt: { lt: new Date(now.getTime() - LEASE) } }, data: { status: "FAILED", finishedAt: now, message: "Busca interrompida. Solicite novamente se necessário." } });
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
  let createdCount = 0;
  try {
    await admin(db, claimed.requestedBy);
    // Mesmo pipeline da busca imediata: os eventos nascem PENDING na fila normal de validação.
    const deadline = Date.now() + IMMEDIATE_BUDGET_MS;
    const discovery = claimed.trigger === "SOURCE" && claimed.sourceUrl
      ? { sources: [{ url: claimed.sourceUrl, platform: platformOf(claimed.sourceUrl).label }], sourceErrors: [], partial: false }
      : await deps.discoverAll(claimed.city, claimed.maxPerRun, { deadline, alreadyKnown: async sourceUrl => Boolean(await db.aiEventCandidate.findUnique({ where: { sourceUrl }, select: { id: true } })) });
    const imported = await importSources(db, claimed.requestedBy, claimed.id, discovery.sources, claimed.trigger === "SOURCE" ? undefined : claimed.city, deps, deadline);
    const report: ImportReport = { ...imported, sourceErrors: discovery.sourceErrors, partial: discovery.partial || imported.partial };
    createdCount = report.created;
    await finish(report.sourceErrors.length && !report.items.length ? "FAILED" : report.partial ? "PARTIAL" : "SUCCEEDED", runMessage(report));
  } catch { await finish("FAILED", "Não foi possível consultar as fontes. Tente novamente mais tarde ou envie o link oficial de um evento."); }
  return true;
  async function finish(status: "SUCCEEDED" | "PARTIAL" | "FAILED", message: string) {
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
