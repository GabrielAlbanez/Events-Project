import { eventInstant } from "@/lib/eventTime";

/** Single source of truth for paid highlight packages. Price and duration are always read here, never from the client. */
export const PROMOTION_PACKAGES = [
  { id: "3d", days: 3, amountCents: 2900, label: "3 dias" },
  { id: "7d", days: 7, amountCents: 5900, label: "7 dias" },
] as const;

export type PromotionPackage = (typeof PROMOTION_PACKAGES)[number];
export type PromotionPackageId = PromotionPackage["id"];
export const PROMOTION_PACKAGE_IDS = PROMOTION_PACKAGES.map((item) => item.id) as [PromotionPackageId, ...PromotionPackageId[]];

export type PromotionStatusValue = "PENDING_PAYMENT" | "AWAITING_REVIEW" | "ACTIVE" | "REJECTED" | "CANCELLED";
export const OPEN_PROMOTION_STATUSES: PromotionStatusValue[] = ["PENDING_PAYMENT", "AWAITING_REVIEW"];

/** At most this many highlighted events move to the top of a list. */
export const MAX_FEATURED_ON_TOP = 3;
export const PROMOTION_NOTE_MAX = 200;
export const PROMOTION_REASON_MAX = 300;
const DAY_MS = 24 * 60 * 60 * 1000;
const DISPLAY_TIMEZONE = "America/Sao_Paulo";

export const promotionStatusLabels: Record<PromotionStatusValue, string> = {
  PENDING_PAYMENT: "Aguardando pagamento",
  AWAITING_REVIEW: "Em análise",
  ACTIVE: "Ativo",
  REJECTED: "Recusado",
  CANCELLED: "Cancelado",
};

export function getPromotionPackage(id: unknown): PromotionPackage | null {
  return PROMOTION_PACKAGES.find((item) => item.id === id) ?? null;
}

export function formatPromotionAmount(amountCents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amountCents / 100);
}

/** DD/MM in the platform timezone (São Paulo), independent of the server or viewer clock. */
export function formatPromotionDate(value: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: DISPLAY_TIMEZONE }).format(new Date(value));
}

/** Short reference the organizer copies into the Pix description. */
export function shortPromotionCode(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

type DateLike = Date | string | null | undefined;
const time = (value: DateLike) => (value == null ? null : new Date(value).getTime());

/** Active = ACTIVE and startsAt <= now < endsAt. Computed on read; no cron. */
export function isPromotionActive(promotion: { status: string; startsAt: DateLike; endsAt: DateLike }, now: Date): boolean {
  const starts = time(promotion.startsAt), ends = time(promotion.endsAt), current = now.getTime();
  return promotion.status === "ACTIVE" && starts != null && ends != null && starts <= current && current < ends;
}

/** A confirmed highlight starts now, or right after the latest ACTIVE highlight of the same event still running or scheduled. */
export function computeActivationWindow(days: number, now: Date, activeOnEvent: { endsAt: DateLike }[]): { startsAt: Date; endsAt: Date } {
  const start = activeOnEvent.reduce((latest, item) => {
    const ends = time(item.endsAt);
    return ends != null && ends > latest ? ends : latest;
  }, now.getTime());
  return { startsAt: new Date(start), endsAt: new Date(start + days * DAY_MS) };
}

/** Moves up to `max` featured items to the top (keeping their relative order); everything else keeps its order. */
export function prioritizeFeatured<T extends { featured?: boolean }>(items: T[], max = MAX_FEATURED_ON_TOP): T[] {
  const top: T[] = [];
  const rest: T[] = [];
  for (const item of items) (item.featured && top.length < max ? top : rest).push(item);
  return top.length ? [...top, ...rest] : items.slice();
}

type PromotableEvent = { userId?: string | null; status?: string | null; dataFim: string; endTime?: string | null; timezone?: string | null };

/** Returns why the event cannot be highlighted by this user, or null when it can. */
export function promotionEligibility(event: PromotableEvent | null, userId: string, now: Date): string | null {
  if (!event) return "Evento não encontrado.";
  if (!event.userId || event.userId !== userId) return "Somente o organizador do evento pode destacá-lo.";
  if (event.status !== "PUBLISHED") return "Somente eventos publicados podem ser destacados.";
  const end = eventInstant(event.dataFim.slice(0, 10), event.endTime, event.timezone || DISPLAY_TIMEZONE, "23:59");
  if (end && end.getTime() <= now.getTime()) return "Este evento já foi encerrado.";
  return null;
}
