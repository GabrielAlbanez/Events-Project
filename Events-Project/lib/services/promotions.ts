import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { createNotification, createNotifications } from "@/lib/notifications/create";
import { notificationCopy } from "@/lib/notifications/catalog";
import type { ResolveAdminId, ResolveCurrentUser } from "@/lib/services/authContext";
import {
  OPEN_PROMOTION_STATUSES, PROMOTION_PACKAGES, computeActivationWindow, formatPromotionAmount, formatPromotionDate,
  getPromotionPackage, isPromotionActive, promotionComparisonRange, promotionEligibility, shortPromotionCode, summarizePromotionResult,
  type PromotionPackage, type PromotionResultSummary, type PromotionStatusValue,
} from "@/lib/promotions";
import { cancelPromotionSchema, createPromotionSchema, markPromotionPaidSchema, reviewPromotionSchema } from "@/schemas/promotions";

type Clock = () => Date;
const systemClock: Clock = () => new Date();

export type PromotionResult<T = undefined> = { success: true; message: string; data: T } | { success: false; message: string };
export type PromotionView = {
  id: string; code: string; packageId: string; days: number; amountCents: number; status: PromotionStatusValue;
  payerNote: string | null; reviewNote: string | null; startsAt: string | null; endsAt: string | null; createdAt: string;
};
export type PromotionPaymentInfo = { key: string; name: string };
export type PromotionOverview = {
  event: { id: string; nome: string; status: string };
  /** Why a new order cannot be created now (null when it can). */
  blockedReason: string | null;
  payment: PromotionPaymentInfo | null;
  packages: PromotionPackage[];
  open: PromotionView | null;
  /** End of the running (or stacked) highlight chain; null when nothing is active. */
  activeUntil: string | null;
  history: PromotionView[];
  /** Performance of the latest highlight that already started (running or ended); null when none started. */
  result: PromotionHighlightResult | null;
  /** True when the metrics could not be read now (the rest of the overview still loads). */
  resultUnavailable: boolean;
};
export type PromotionHighlightResult = PromotionResultSummary & { promotionId: string; code: string; startsAt: string; endsAt: string };
export type PromotionQueueItem = PromotionView & {
  event: { id: string; nome: string; dataInicio: string };
  organizer: { id: string; name: string | null; email: string | null };
};
/** Organizer reminder: own unpaid orders only, without contact data. */
export type PromotionPendingItem = { id: string; code: string; days: number; amountCents: number; createdAt: string; event: { id: string; nome: string } };
export type PromotionReviewList = { queue: PromotionQueueItem[]; unpaid: PromotionQueueItem[]; active: PromotionActiveItem[] };
export type PromotionActiveItem = { id: string; code: string; days: number; startsAt: string | null; endsAt: string | null; event: { id: string; nome: string } };

const viewSelect = {
  id: true, packageId: true, days: true, amountCents: true, status: true, payerNote: true, reviewNote: true,
  startsAt: true, endsAt: true, createdAt: true,
} satisfies Prisma.EventPromotionSelect;
type ViewRow = Prisma.EventPromotionGetPayload<{ select: typeof viewSelect }>;
const iso = (value: Date | null) => (value ? new Date(value).toISOString() : null);
function toView(row: ViewRow): PromotionView {
  return {
    id: row.id, code: shortPromotionCode(row.id), packageId: row.packageId, days: row.days, amountCents: row.amountCents,
    status: row.status, payerNote: row.payerNote, reviewNote: row.reviewNote, startsAt: iso(row.startsAt), endsAt: iso(row.endsAt),
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

const denied = { success: false as const, message: "Acesso negado." };
const unavailable = "Pagamento indisponível no momento.";
const notReviewable = "Este pedido não está mais aberto para análise.";
const genericError = { success: false as const, message: "Não foi possível concluir agora. Tente novamente em alguns minutos." };
const ownerHref = (eventId: string) => `/myEvents/${encodeURIComponent(eventId)}/destaque`;

/** Server-only Pix details. Never exposed through NEXT_PUBLIC variables. */
export function promotionPaymentConfig(): PromotionPaymentInfo | null {
  const key = process.env.FEATURED_PIX_KEY?.trim();
  const name = process.env.FEATURED_PIX_NAME?.trim();
  return key && name ? { key, name } : null;
}

const eventSelect = { id: true, nome: true, userId: true, status: true, dataFim: true, endTime: true, timezone: true } satisfies Prisma.EventsSelect;

export async function getPromotionOverview(eventId: string, resolveCurrentUser: ResolveCurrentUser, now: Clock = systemClock): Promise<PromotionResult<PromotionOverview>> {
  const user = await resolveCurrentUser();
  if (!user) return denied;
  if (typeof eventId !== "string" || !eventId || eventId.length > 64) return { success: false, message: "Evento não encontrado." };
  try {
    const event = await prisma.events.findFirst({ where: { id: eventId, userId: user.id }, select: eventSelect });
    if (!event) return { success: false, message: "Evento não encontrado ou sem permissão para destacá-lo." };
    const rows = await prisma.eventPromotion.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "desc" }, take: 20, select: viewSelect });
    const current = now();
    const open = rows.find((row) => OPEN_PROMOTION_STATUSES.includes(row.status)) ?? null;
    const runningOrScheduled = rows.filter((row) => row.status === "ACTIVE" && row.endsAt && row.endsAt.getTime() > current.getTime());
    const activeUntil = runningOrScheduled.some((row) => isPromotionActive(row, current))
      ? computeActivationWindow(0, current, runningOrScheduled).endsAt.toISOString()
      : null;
    const payment = promotionPaymentConfig();
    const { result, resultUnavailable } = await loadHighlightResult(event.id, rows, current);
    const blockedReason = promotionEligibility(event, user.id, current) ?? (open ? "Já existe um pedido em aberto para este evento." : payment ? null : unavailable);
    return {
      success: true, message: "",
      data: {
        event: { id: event.id, nome: event.nome, status: event.status }, blockedReason, payment,
        packages: [...PROMOTION_PACKAGES], open: open ? toView(open) : null, activeUntil, history: rows.slice(0, 8).map(toView),
        result, resultUnavailable,
      },
    };
  } catch {
    console.warn("promotion-overview-failed");
    return genericError;
  }
}

/** Latest ACTIVE highlight that already started (running or ended) and its metrics, read only for this event. */
async function loadHighlightResult(eventId: string, rows: ViewRow[], current: Date): Promise<{ result: PromotionHighlightResult | null; resultUnavailable: boolean }> {
  const latest = rows
    .filter((row) => row.status === "ACTIVE" && row.startsAt && row.endsAt && row.startsAt.getTime() <= current.getTime())
    .sort((a, b) => b.startsAt!.getTime() - a.startsAt!.getTime())[0];
  const range = latest ? promotionComparisonRange(latest, current) : null;
  if (!latest || !range) return { result: null, resultUnavailable: false };
  try {
    const metrics = await prisma.eventMetric.findMany({
      where: { eventId, day: { gte: range.from, lte: range.to } },
      select: { day: true, views: true, ticketClicks: true },
      take: 120,
    });
    const summary = summarizePromotionResult(latest, metrics, current);
    if (!summary) return { result: null, resultUnavailable: false };
    return {
      result: { ...summary, promotionId: latest.id, code: shortPromotionCode(latest.id), startsAt: latest.startsAt!.toISOString(), endsAt: latest.endsAt!.toISOString() },
      resultUnavailable: false,
    };
  } catch {
    console.warn("promotion-result-failed");
    return { result: null, resultUnavailable: true };
  }
}

export async function createPromotionOrder(rawInput: unknown, resolveCurrentUser: ResolveCurrentUser, now: Clock = systemClock): Promise<PromotionResult<PromotionView>> {
  const user = await resolveCurrentUser();
  if (!user) return denied;
  const parsed = createPromotionSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, message: "Escolha um pacote válido." };
  const pack = getPromotionPackage(parsed.data.packageId);
  if (!pack) return { success: false, message: "Escolha um pacote válido." };
  if (!promotionPaymentConfig()) return { success: false, message: unavailable };
  try {
    return await prisma.$transaction(async (tx) => {
      const event = await tx.events.findFirst({ where: { id: parsed.data.eventId, userId: user.id }, select: eventSelect });
      const reason = promotionEligibility(event, user.id, now());
      if (reason || !event) return { success: false as const, message: reason ?? "Evento não encontrado." };
      const open = await tx.eventPromotion.findFirst({ where: { eventId: event.id, status: { in: OPEN_PROMOTION_STATUSES } }, select: { id: true } });
      if (open) return { success: false as const, message: "Já existe um pedido em aberto para este evento." };
      const created = await tx.eventPromotion.create({
        data: { eventId: event.id, userId: user.id, packageId: pack.id, days: pack.days, amountCents: pack.amountCents },
        select: viewSelect,
      });
      return { success: true as const, message: "Pedido criado. Faça o Pix e avise quando pagar.", data: toView(created) };
    }, { isolationLevel: "Serializable" });
  } catch {
    console.warn("promotion-create-failed");
    return genericError;
  }
}

export async function markPromotionPaid(rawInput: unknown, resolveCurrentUser: ResolveCurrentUser, now: Clock = systemClock): Promise<PromotionResult> {
  const user = await resolveCurrentUser();
  if (!user) return denied;
  const parsed = markPromotionPaidSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, message: "A observação pode ter até 200 caracteres." };
  try {
    return await prisma.$transaction(async (tx) => {
      const order = await tx.eventPromotion.findFirst({
        where: { id: parsed.data.promotionId, userId: user.id, status: "PENDING_PAYMENT" },
        select: { id: true, days: true, amountCents: true, event: { select: { nome: true } } },
      });
      if (!order) return { success: false as const, message: "Este pedido não está mais aguardando pagamento." };
      const changed = await tx.eventPromotion.updateMany({
        where: { id: order.id, status: "PENDING_PAYMENT" },
        data: { status: "AWAITING_REVIEW", payerNote: parsed.data.note || null, updatedAt: now() },
      });
      if (!changed.count) return { success: false as const, message: "Este pedido não está mais aguardando pagamento." };
      const admins = await tx.user.findMany({ where: { role: "ADMIN", suspendedAt: null }, select: { id: true } });
      await createNotifications(tx, admins.map((admin) => notificationCopy({
        userId: admin.id, type: "ADMIN" as const, href: "/admin/destaques", groupKey: `promotion-paid:${order.id}`,
        title: "Pagamento de destaque informado",
        message: `${order.event.nome} · ${order.days} dias · ${formatPromotionAmount(order.amountCents)} · pedido ${shortPromotionCode(order.id)}`,
      })));
      return { success: true as const, message: "Recebemos seu aviso. O destaque começa assim que confirmarmos o pagamento.", data: undefined };
    });
  } catch {
    console.warn("promotion-paid-failed");
    return genericError;
  }
}

export async function cancelPromotionOrder(rawInput: unknown, resolveCurrentUser: ResolveCurrentUser, now: Clock = systemClock): Promise<PromotionResult> {
  const user = await resolveCurrentUser();
  if (!user) return denied;
  const parsed = cancelPromotionSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, message: "Pedido inválido." };
  try {
    const changed = await prisma.eventPromotion.updateMany({
      where: { id: parsed.data.promotionId, userId: user.id, status: "PENDING_PAYMENT" },
      data: { status: "CANCELLED", updatedAt: now() },
    });
    return changed.count
      ? { success: true, message: "Pedido cancelado.", data: undefined }
      : { success: false, message: "Somente pedidos aguardando pagamento podem ser cancelados." };
  } catch {
    console.warn("promotion-cancel-failed");
    return genericError;
  }
}

/** Reminder for the signed-in organizer: only their own orders still waiting for "Já paguei". */
export async function listMyPendingPromotions(resolveCurrentUser: ResolveCurrentUser): Promise<PromotionResult<PromotionPendingItem[]>> {
  const user = await resolveCurrentUser();
  if (!user) return denied;
  try {
    const rows = await prisma.eventPromotion.findMany({
      where: { userId: user.id, status: "PENDING_PAYMENT" }, orderBy: { createdAt: "desc" }, take: 20,
      select: { id: true, days: true, amountCents: true, createdAt: true, event: { select: { id: true, nome: true } } },
    });
    return {
      success: true, message: "",
      data: rows.map((row) => ({
        id: row.id, code: shortPromotionCode(row.id), days: row.days, amountCents: row.amountCents,
        createdAt: new Date(row.createdAt).toISOString(), event: { id: row.event.id, nome: row.event.nome },
      })),
    };
  } catch {
    console.warn("promotion-pending-list-failed");
    return genericError;
  }
}

const queueSelect = {
  ...viewSelect, event: { select: { id: true, nome: true, dataInicio: true } }, user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.EventPromotionSelect;
type QueueRow = Prisma.EventPromotionGetPayload<{ select: typeof queueSelect }>;
const toQueueItem = (row: QueueRow): PromotionQueueItem => ({ ...toView(row), event: row.event, organizer: row.user });

export async function listPromotionReview(resolveAdminId: ResolveAdminId, now: Clock = systemClock): Promise<PromotionResult<PromotionReviewList>> {
  if (!await resolveAdminId()) return denied;
  try {
    const current = now();
    const [queue, unpaid, active] = await Promise.all([
      prisma.eventPromotion.findMany({ where: { status: "AWAITING_REVIEW" }, orderBy: { updatedAt: "asc" }, take: 100, select: queueSelect }),
      // Orders whose organizer may have paid but never clicked "Já paguei": the admin can still check the Pix by code and amount.
      prisma.eventPromotion.findMany({ where: { status: "PENDING_PAYMENT" }, orderBy: { createdAt: "desc" }, take: 100, select: queueSelect }),
      prisma.eventPromotion.findMany({
        where: { status: "ACTIVE", endsAt: { gt: current } }, orderBy: { endsAt: "asc" }, take: 100,
        select: { id: true, days: true, startsAt: true, endsAt: true, event: { select: { id: true, nome: true } } },
      }),
    ]);
    return {
      success: true, message: "",
      data: {
        queue: queue.map(toQueueItem),
        unpaid: unpaid.map(toQueueItem),
        active: active.map((row) => ({ id: row.id, code: shortPromotionCode(row.id), days: row.days, startsAt: iso(row.startsAt), endsAt: iso(row.endsAt), event: row.event })),
      },
    };
  } catch {
    console.warn("promotion-review-list-failed");
    return genericError;
  }
}

/** Admin decision. Confirming stacks after any running highlight of the same event. The row keeps reviewer, time and reason as its audit trail. */
export async function reviewPromotion(rawInput: unknown, resolveAdminId: ResolveAdminId, now: Clock = systemClock): Promise<PromotionResult> {
  const adminId = await resolveAdminId();
  if (!adminId) return denied;
  const parsed = reviewPromotionSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, message: "Informe o motivo da recusa (3 a 300 caracteres)." };
  const input = parsed.data;
  try {
    return await prisma.$transaction(async (tx) => {
      // Unpaid orders are reviewable too: the organizer may have paid and forgotten to click "Já paguei".
      const order = await tx.eventPromotion.findFirst({
        where: { id: input.promotionId, status: { in: OPEN_PROMOTION_STATUSES } },
        select: { id: true, eventId: true, userId: true, days: true, event: { select: eventSelect } },
      });
      if (!order) return { success: false as const, message: notReviewable };
      const current = now();
      if (input.decision === "confirm") {
        // The event may have been cancelled, unpublished or ended since the order was paid: keep it queued for rejection/refund.
        const reason = promotionEligibility(order.event, order.userId, current);
        if (reason) return { success: false as const, message: `Não é possível ativar: ${reason} Recuse o pedido e devolva o Pix.` };
        const running = await tx.eventPromotion.findMany({ where: { eventId: order.eventId, status: "ACTIVE", endsAt: { gt: current } }, select: { endsAt: true } });
        const window = computeActivationWindow(order.days, current, running);
        const changed = await tx.eventPromotion.updateMany({
          where: { id: order.id, status: { in: OPEN_PROMOTION_STATUSES } },
          data: { status: "ACTIVE", startsAt: window.startsAt, endsAt: window.endsAt, reviewedBy: adminId, reviewedAt: current, reviewNote: null, updatedAt: current },
        });
        if (!changed.count) return { success: false as const, message: notReviewable };
        const scheduled = window.startsAt.getTime() > current.getTime();
        await createNotification(tx, notificationCopy({
          userId: order.userId, type: "SYSTEM" as const, href: ownerHref(order.eventId), groupKey: `promotion-review:${order.id}`,
          title: scheduled ? "Seu destaque foi aprovado" : "Seu destaque está no ar",
          message: scheduled
            ? `${order.event.nome} fica em destaque de ${formatPromotionDate(window.startsAt)} até ${formatPromotionDate(window.endsAt)}.`
            : `${order.event.nome} fica em destaque até ${formatPromotionDate(window.endsAt)}.`,
        }));
        await tx.communitySignal.create({ data: { room: `user:${order.userId}` } });
        return { success: true as const, message: "Destaque confirmado.", data: undefined };
      }
      const changed = await tx.eventPromotion.updateMany({
        where: { id: order.id, status: { in: OPEN_PROMOTION_STATUSES } },
        data: { status: "REJECTED", reviewNote: input.reason, reviewedBy: adminId, reviewedAt: current, updatedAt: current },
      });
      if (!changed.count) return { success: false as const, message: notReviewable };
      await createNotification(tx, notificationCopy({
        userId: order.userId, type: "SYSTEM" as const, href: ownerHref(order.eventId), groupKey: `promotion-review:${order.id}`,
        title: "Pedido de destaque recusado", message: `${order.event.nome}: ${input.reason}`,
      }));
      await tx.communitySignal.create({ data: { room: `user:${order.userId}` } });
      return { success: true as const, message: "Pedido recusado.", data: undefined };
    }, { isolationLevel: "Serializable" });
  } catch {
    console.warn("promotion-review-failed");
    return genericError;
  }
}
