import prisma from "@/lib/prisma";
import { createNotifications } from "@/lib/notifications/create";
import { notificationText } from "@/lib/notifications/catalog";
import { notifyEventAudience } from "@/lib/eventNotifications";
import { eventRuleFindings, imageDimensions, type Finding } from "./rules";
import type { AiReviewInput, AiVerdict } from "./gemini";

/**
 * Automatic triage of a submitted (PENDING) event:
 * - GREEN: publishes on its own (organizer and admins are told);
 * - YELLOW: goes back to the organizer with what to fix (CHANGES_REQUESTED);
 * - RED: stays PENDING and an admin is asked to review, with the reasons.
 * When anything is uncertain (new organizer, AI unavailable, unreadable image) it never publishes.
 */
export type Verdict = "GREEN" | "YELLOW" | "RED";
export type OrganizerTrust = "NEW" | "TESTING" | "TRUSTED";
export interface VerdictDecision { verdict: Verdict; reasons: string[] }
export interface TriageOutcome extends VerdictDecision { trust: OrganizerTrust; applied: "published" | "changes" | "admin" }
export interface TriageDeps {
  now?: () => Date;
  env?: Record<string, string | undefined>;
  readImage?: (url: string) => Promise<Buffer | null>;
  review?: (input: AiReviewInput) => Promise<AiVerdict | null>;
}

export const TRIAGE_ACTOR_ID = "system:triage";
const TRIAGE_ACTOR_NAME = "Triagem automática";

const aiSeriousText: Record<string, string> = {
  adult: "A imagem ou o texto parecem ter conteúdo adulto.",
  violence: "A imagem ou o texto parecem ter violência explícita.",
  hate: "A imagem ou o texto parecem ter discurso de ódio.",
  scam: "O evento tem sinais de golpe.",
};

export function decideVerdict({ findings, trust, ai, aiEnabled }: { findings: Finding[]; trust: OrganizerTrust; ai: AiVerdict | null; aiEnabled: boolean }): VerdictDecision {
  const serious = findings.filter(finding => finding.severity === "serious").map(finding => finding.message);
  if (ai?.serious) serious.push(aiSeriousText[ai.category] ?? ai.reason);
  if (serious.length) return { verdict: "RED", reasons: serious };
  const fixes = findings.filter(finding => finding.severity === "fix").map(finding => finding.message);
  if (ai && (!ai.matches || ai.category === "low_quality")) fixes.push(ai.reason || "A imagem de capa não combina com o evento. Use o cartaz ou uma foto do evento.");
  if (fixes.length) return { verdict: "YELLOW", reasons: fixes };
  if (trust === "NEW") return { verdict: "RED", reasons: ["Primeiro evento deste organizador: a equipe confere antes de publicar."] };
  if (trust === "TESTING" && !ai) return { verdict: "RED", reasons: [aiEnabled ? "A conferência automática da imagem não respondeu agora; a equipe confere." : "Organizador em período de teste: a equipe confere a imagem antes de publicar."] };
  return { verdict: "GREEN", reasons: [] };
}

type TrustDb = {
  user: { findUnique: (args: { where: { id: string }; select: { role: true; organizerTrustResetAt: true } }) => Promise<{ role: string; organizerTrustResetAt: Date | null } | null> };
  eventHistory?: { count: (args: { where: Record<string, unknown> }) => Promise<number> };
  eventReport?: { count: (args: { where: Record<string, unknown> }) => Promise<number> };
};

/** NEW: no approved event since the last admin takedown. TESTING: one. TRUSTED: two or more and no open reports. */
export async function organizerTrust(db: TrustDb, userId: string): Promise<OrganizerTrust> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, organizerTrustResetAt: true } });
  if (!user) return "NEW";
  if (user.role === "ADMIN") return "TRUSTED";
  const approved = await db.eventHistory!.count({
    where: { promoterId: userId, action: "VALIDATED", ...(user.organizerTrustResetAt ? { createdAt: { gt: user.organizerTrustResetAt } } : {}) },
  });
  if (approved === 0) return "NEW";
  const openReports = await db.eventReport!.count({ where: { status: "PENDING", event: { userId } } });
  return approved >= 2 && openReports === 0 ? "TRUSTED" : "TESTING";
}

function mimeOf(url: string): string {
  if (url.endsWith(".png")) return "image/png";
  if (url.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function runEventTriage(eventId: string, deps: TriageDeps = {}): Promise<TriageOutcome | null> {
  const now = deps.now ?? (() => new Date());
  const env = deps.env ?? process.env;
  const event = await prisma.events.findUnique({ where: { id: eventId } });
  if (!event || event.status !== "PENDING" || !event.userId) return null;
  const ownerId = event.userId;

  const bytes = event.banner && deps.readImage ? await deps.readImage(event.banner).catch(() => null) : null;
  const image = bytes ? imageDimensions(bytes) : null;
  const duplicate = event.bannerHash
    ? await prisma.events.findFirst({ where: { bannerHash: event.bannerHash, userId: { not: ownerId }, id: { not: event.id } }, select: { id: true } })
    : null;
  const findings = eventRuleFindings(event, { now: now(), image, duplicateImage: Boolean(duplicate) });
  const trust = await organizerTrust(prisma, ownerId);
  const aiEnabled = Boolean(env.GEMINI_API_KEY?.trim());
  const hasSerious = findings.some(finding => finding.severity === "serious");
  const ai = aiEnabled && !hasSerious && deps.review
    ? await deps.review({ name: event.nome, description: event.descricao, category: event.category, image: bytes ? { bytes, mime: mimeOf(event.banner) } : null }).catch(() => null)
    : null;
  const decision = decideVerdict({ findings, trust, ai, aiEnabled });
  const autopublish = env.MODERATION_AUTOPUBLISH?.trim().toLowerCase() !== "off";
  const at = now();

  return prisma.$transaction(async tx => {
    await tx.eventModeration.create({ data: { eventId: event.id, verdict: decision.verdict, trust, reasons: decision.reasons, aiUsed: Boolean(ai), createdAt: at } });
    const history = (action: "VALIDATED" | "CHANGES_REQUESTED", note: string) => tx.eventHistory.create({
      data: { eventId: event.id, eventName: event.nome, promoterId: ownerId, actorId: TRIAGE_ACTOR_ID, actorName: TRIAGE_ACTOR_NAME, action, note, createdAt: at },
    });
    const admins = async () => tx.user.findMany({ where: { role: "ADMIN", suspendedAt: null }, select: { id: true } });

    if (decision.verdict === "GREEN" && autopublish) {
      const changed = await tx.events.updateMany({ where: { id: event.id, status: "PENDING" }, data: { status: "PUBLISHED", validate: true, validatedAt: at, validatedBy: null, reviewNote: null } });
      if (!changed.count) return null;
      await history("VALIDATED", "Publicado pela triagem automática.");
      await notifyEventAudience(tx, { ...event, status: "PUBLISHED" }, { title: "Evento publicado", message: event.nome + " passou na triagem automática e já está no EventMap.", includeFollowers: true });
      await createNotifications(tx, (await admins()).map(admin => ({ userId: admin.id, type: "ADMIN" as const, priority: "normal" as const, title: "Publicado automaticamente", message: notificationText(event.nome + " · confira quando puder; você pode tirar do ar a qualquer momento.", 160), href: "/EventsCreated", groupKey: `triage:${event.id}` })));
      return { ...decision, trust, applied: "published" as const };
    }

    if (decision.verdict === "YELLOW") {
      const note = ["Correções pedidas pela triagem automática:", ...decision.reasons.map(reason => "- " + reason)].join("\n").slice(0, 2000);
      const changed = await tx.events.updateMany({ where: { id: event.id, status: "PENDING" }, data: { status: "CHANGES_REQUESTED", reviewNote: note, validate: false } });
      if (!changed.count) return null;
      await history("CHANGES_REQUESTED", note);
      await notifyEventAudience(tx, { ...event, status: "CHANGES_REQUESTED" }, { title: "Correção solicitada", message: notificationText(decision.reasons.join(" "), 160) });
      return { ...decision, trust, applied: "changes" as const };
    }

    const reasons = decision.verdict === "GREEN" ? ["A triagem aprovou; a publicação automática está desligada."] : decision.reasons;
    await createNotifications(tx, (await admins()).map(admin => ({ userId: admin.id, type: "ADMIN" as const, priority: "high" as const, title: decision.verdict === "GREEN" ? "Triagem aprovou: confirme" : "Evento precisa de revisão", message: notificationText(event.nome + " · " + reasons.join(" "), 160), href: "/EventsCreated", groupKey: `triage:${event.id}` })));
    return { ...decision, reasons, trust, applied: "admin" as const };
  });
}
