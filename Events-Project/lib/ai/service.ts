import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { geminiEnabled } from "../gemini/client";
import { imageDimensions, eventRuleFindings } from "../moderation/rules";
import { consumeAiQuota, type AiFeature } from "./quota";
import * as features from "./features";
import type { AiResult, EventDraftSuggestion, EventSummary, EventTips, PromoCopy, SearchIntent } from "../../types/ai";

/**
 * Auth, quota and data access around the Gemini helpers. Callers (actions/routes) pass the
 * authenticated user; nothing here trusts client-provided ids or roles.
 */
export type AiActor = { id: string; role: string } | null;
export interface AiServiceDeps {
  db: PrismaClient;
  now?: () => Date;
  env?: Record<string, string | undefined>;
  readImage?: (url: string) => Promise<Buffer | null>;
  siteOrigin?: () => string;
  ai?: Partial<typeof features>;
}

export const AI_OFF = "A ajuda com IA não está disponível agora. Preencha manualmente.";
export const AI_BUSY = "A IA não respondeu agora. Tente de novo em instantes.";
export const AI_LIMIT = "Você usou a ajuda da IA muitas vezes seguidas. Tente de novo mais tarde.";
const NOT_ALLOWED = "Entre com uma conta de organizador para usar a ajuda da IA.";
// Server actions accept up to 4.45 MB (next.config.js), so the image stays under 4 MB.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const canCreateEvents = (actor: AiActor): actor is { id: string; role: string } => Boolean(actor && (actor.role === "PROMOTER" || actor.role === "ADMIN"));

function fn<K extends keyof typeof features>(deps: AiServiceDeps, name: K): typeof features[K] {
  return (deps.ai?.[name] ?? features[name]) as typeof features[K];
}
async function quota(deps: AiServiceDeps, feature: AiFeature, key: string): Promise<boolean> {
  return consumeAiQuota(deps.db as unknown as Pick<Prisma.TransactionClient, "verificationToken">, feature, key, deps.now?.() ?? new Date());
}
function enabled(deps: AiServiceDeps): boolean {
  return geminiEnabled(deps.env ?? process.env);
}

/** Accepts only real JPEG/PNG/WebP images up to 4 MB (checked by header bytes, not by the client's MIME). */
export async function imageFromFile(file: unknown): Promise<{ bytes: Buffer; mime: string } | null | "invalid"> {
  if (!file || typeof file !== "object" || typeof (file as Blob).arrayBuffer !== "function" || (file as Blob).size === 0) return null;
  const blob = file as Blob;
  if (blob.size > MAX_IMAGE_BYTES) return "invalid";
  const bytes = Buffer.from(await blob.arrayBuffer());
  const mime = bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg" : bytes.readUInt32BE(0) === 0x89504e47 ? "image/png" : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" ? "image/webp" : "";
  if (!IMAGE_MIME.has(mime) || !imageDimensions(bytes)) return "invalid";
  return { bytes, mime };
}

// ---------- 1 ----------
export async function draftEventWithAi(actor: AiActor, form: FormData, deps: AiServiceDeps): Promise<AiResult<EventDraftSuggestion>> {
  if (!canCreateEvents(actor)) return { ok: false, error: NOT_ALLOWED };
  if (!enabled(deps)) return { ok: false, error: AI_OFF };
  const text = typeof form.get("text") === "string" ? String(form.get("text")).slice(0, 4000) : "";
  const image = await imageFromFile(form.get("image"));
  if (image === "invalid") return { ok: false, error: "Use uma imagem JPG, PNG ou WebP de até 4 MB." };
  if (text.trim().length < 15 && !image) return { ok: false, error: "Cole um texto sobre o evento (pelo menos uma frase) ou envie o cartaz." };
  if (!await quota(deps, "draft", actor.id)) return { ok: false, error: AI_LIMIT };
  const draft = await fn(deps, "draftEvent")({ text, image }, deps.now?.() ?? new Date(), { env: deps.env });
  return draft ? { ok: true, data: draft } : { ok: false, error: AI_BUSY };
}

// ---------- 2 ----------
function dateLabel(event: { dataInicio: string; dataFim: string; startTime: string | null }): string {
  const format = (value: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(value + "T12:00:00Z"));
  try {
    const base = event.dataFim && event.dataFim !== event.dataInicio ? `${format(event.dataInicio)} a ${format(event.dataFim)}` : format(event.dataInicio);
    return event.startTime ? `${base}, às ${event.startTime}` : base;
  } catch { return event.dataInicio; }
}
function priceLabel(event: { isFree: boolean; priceCents: number }): string {
  return event.isFree || event.priceCents <= 0 ? "Gratuito" : "A partir de R$ " + (event.priceCents / 100).toFixed(2).replace(".", ",");
}

export async function promoCopyWithAi(actor: AiActor, eventId: string, deps: AiServiceDeps): Promise<AiResult<PromoCopy>> {
  if (!actor || typeof eventId !== "string" || eventId.length > 100) return { ok: false, error: NOT_ALLOWED };
  if (!enabled(deps)) return { ok: false, error: AI_OFF };
  const event = await deps.db.events.findUnique({ where: { id: eventId }, select: { id: true, userId: true, status: true, nome: true, descricao: true, category: true, dataInicio: true, dataFim: true, startTime: true, endereco: true, isFree: true, priceCents: true } });
  if (!event || (event.userId !== actor.id && actor.role !== "ADMIN")) return { ok: false, error: "Só quem organiza o evento pode gerar a divulgação." };
  if (event.status !== "PUBLISHED") return { ok: false, error: "A divulgação fica disponível depois que o evento for publicado." };
  if (!await quota(deps, "promo", actor.id)) return { ok: false, error: AI_LIMIT };
  const origin = deps.siteOrigin?.() ?? "https://events-project-lake.vercel.app";
  const url = new URL("/eventos/" + encodeURIComponent(event.id), origin).href;
  const copy = await fn(deps, "promoCopy")({ name: event.nome, description: event.descricao, category: event.category, dateLabel: dateLabel(event), place: event.endereco, priceLabel: priceLabel(event), url }, { env: deps.env });
  return copy ? { ok: true, data: copy } : { ok: false, error: AI_BUSY };
}

// ---------- 3 ----------
const TIP_RULES = new Set(["past-date", "no-location", "short-description", "small-image", "stretched-image", "off-platform-payment", "adult-content", "high-price"]);

export async function eventTipsWithAi(actor: AiActor, form: FormData, deps: AiServiceDeps): Promise<AiResult<EventTips>> {
  if (!canCreateEvents(actor)) return { ok: false, error: NOT_ALLOWED };
  const field = (name: string, max: number) => typeof form.get(name) === "string" ? String(form.get(name)).slice(0, max) : "";
  const nome = field("nome", 160), descricao = field("descricao", 10000), category = field("category", 80);
  const lat = Number(form.get("lat")), lng = Number(form.get("lng"));
  let image = await imageFromFile(form.get("banner"));
  if (image === "invalid") image = null;
  const existingBanner = field("bannerUrl", 300);
  if (!image && existingBanner.startsWith("/uploads/") && deps.readImage) {
    const bytes = await deps.readImage(existingBanner).catch(() => null);
    if (bytes) image = { bytes, mime: existingBanner.endsWith(".png") ? "image/png" : existingBanner.endsWith(".webp") ? "image/webp" : "image/jpeg" };
  }
  const priceCents = Math.round(Number(field("price", 20).replace(",", ".")) * 100);
  const findings = eventRuleFindings({
    nome, descricao, category, dataInicio: field("dataInicio", 10), dataFim: field("dataFim", 10), endereco: field("endereco", 500),
    lat: Number.isFinite(lat) && form.get("lat") !== "" && form.get("lat") !== null ? lat : null,
    lng: Number.isFinite(lng) && form.get("lng") !== "" && form.get("lng") !== null ? lng : null,
    isFree: form.get("isFree") === "true", priceCents: Number.isFinite(priceCents) ? priceCents : 0, ticketsEnabled: form.get("ticketsEnabled") === "true", linkParaCompra: field("LinkParaCompraIngresso", 500),
  }, { now: deps.now?.() ?? new Date(), image: image ? imageDimensions(image.bytes) : null, duplicateImage: false });
  const ruleTips = findings.filter(finding => TIP_RULES.has(finding.code)).map(finding => finding.message);
  if (!enabled(deps) || descricao.trim().length < 10) return { ok: true, data: { tips: ruleTips, imageMatches: null, aiUsed: false } };
  if (!await quota(deps, "tips", actor.id)) return { ok: true, data: { tips: ruleTips, imageMatches: null, aiUsed: false } };
  const ai = await fn(deps, "eventTips")({ name: nome, description: descricao, category, image }, { env: deps.env });
  if (!ai) return { ok: true, data: { tips: ruleTips, imageMatches: null, aiUsed: false } };
  const imageTip = ai.imageMatches === false ? ["A imagem de capa parece não combinar com o evento. Use o cartaz ou uma foto do local ou das atrações."] : [];
  return { ok: true, data: { tips: [...ruleTips, ...imageTip, ...ai.tips].slice(0, 7), imageMatches: ai.imageMatches, aiUsed: true } };
}

// ---------- 4 ----------
export async function searchWithAi(clientKey: string, query: unknown, categories: unknown, deps: AiServiceDeps): Promise<AiResult<SearchIntent>> {
  const q = typeof query === "string" ? query.trim().slice(0, 200) : "";
  if (q.length < 3) return { ok: false, error: "Escreva o que você procura, por exemplo: show de samba sábado perto de mim." };
  if (!enabled(deps)) return { ok: false, error: AI_OFF };
  const list = Array.isArray(categories) ? categories.filter((item): item is string => typeof item === "string").slice(0, 40) : [];
  if (!await quota(deps, "search", clientKey)) return { ok: false, error: AI_LIMIT };
  const intent = await fn(deps, "searchIntent")(q, list, deps.now?.() ?? new Date(), { env: deps.env });
  return intent ? { ok: true, data: intent } : { ok: false, error: AI_BUSY };
}

// ---------- 5 ----------
type SummaryEvent = { id: string; status: string; nome: string; descricao: string; category: string; endereco: string; isFree: boolean; ageRating: string | null; accessibilityInfo: string | null; participationInfo: string | null; aiSummary: unknown; aiSummaryHash: string | null };
export function summaryHash(event: Omit<SummaryEvent, "id" | "status" | "aiSummary" | "aiSummaryHash">): string {
  return createHash("sha256").update(JSON.stringify([event.nome, event.descricao, event.category, event.endereco, event.isFree, event.ageRating, event.accessibilityInfo, event.participationInfo])).digest("hex");
}
function storedSummary(value: unknown): EventSummary | null {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : null;
  return data && typeof data.what === "string" && typeof data.forWho === "string" && typeof data.bring === "string" ? { what: data.what, forWho: data.forWho, bring: data.bring } : null;
}

/** Public, cached per content: Gemini runs at most once per version of the event text. */
export async function eventSummaryWithAi(eventId: string, deps: AiServiceDeps): Promise<EventSummary | null> {
  if (typeof eventId !== "string" || eventId.length > 100) return null;
  const event = await deps.db.events.findUnique({ where: { id: eventId }, select: { id: true, status: true, nome: true, descricao: true, category: true, endereco: true, isFree: true, ageRating: true, accessibilityInfo: true, participationInfo: true, aiSummary: true, aiSummaryHash: true } }) as SummaryEvent | null;
  if (!event || event.status !== "PUBLISHED") return null;
  const hash = summaryHash(event);
  const cached = storedSummary(event.aiSummary);
  if (cached && event.aiSummaryHash === hash) return cached;
  if (event.descricao.trim().length < 60 || !enabled(deps)) return cached;
  if (!await quota(deps, "summary", "global")) return cached;
  const summary = await fn(deps, "eventSummary")({ name: event.nome, description: event.descricao, category: event.category, place: event.endereco, isFree: event.isFree, ageRating: event.ageRating ?? "", accessibility: event.accessibilityInfo ?? "", participation: event.participationInfo ?? "" }, { env: deps.env });
  if (!summary) return cached;
  // Only stores when the text did not change meanwhile.
  await deps.db.events.updateMany({ where: { id: event.id, nome: event.nome, descricao: event.descricao }, data: { aiSummary: summary as unknown as Prisma.InputJsonValue, aiSummaryHash: hash } }).catch(() => undefined);
  return summary;
}
