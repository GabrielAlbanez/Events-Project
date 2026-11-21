import { eventInstant } from "@/lib/eventTime";

/**
 * Pure rules for ticket sales (Pix + Mercado Pago marketplace split). Safe to import from client components:
 * no crypto, no I/O, no clock. Secrets and signatures live in lib/ticketSecurity.ts (server only).
 */
export const TICKET_FEE_PERCENT = 20;
export const TICKET_MIN_CENTS = 500;
export const TICKET_MAX_CENTS = 500_000;
export const TICKET_ORDER_TTL_MS = 30 * 60 * 1000;
export const TICKET_ORDER_RATE_LIMIT = 5;
export const TICKET_ORDER_RATE_WINDOW_MS = 10 * 60 * 1000;

export type TicketOrderStatusValue = "PENDING" | "PAID" | "EXPIRED" | "CANCELLED" | "REFUNDED";

export const ticketStatusLabels: Record<TicketOrderStatusValue, string> = {
  PENDING: "Aguardando Pix",
  PAID: "Pago",
  EXPIRED: "Pix expirado",
  CANCELLED: "Cancelado",
  REFUNDED: "Estornado",
};

/** Platform fee in integer cents (20%, rounded half up). It comes out of the organizer's amount. */
export function ticketFeeCents(unitCents: number): number {
  return Math.round((unitCents * TICKET_FEE_PERCENT) / 100);
}

/** What the organizer receives per ticket before Mercado Pago's own Pix fee. */
export function ticketNetCents(unitCents: number): number {
  return unitCents - ticketFeeCents(unitCents);
}

export function isValidTicketPrice(cents: unknown): cents is number {
  return typeof cents === "number" && Number.isInteger(cents) && cents >= TICKET_MIN_CENTS && cents <= TICKET_MAX_CENTS;
}

export const TICKET_COUPON_MIN_CHARGE_CENTS = 100;
export const TICKET_COUPON_MAX_PERCENT = 90;
export const TICKET_COUPON_CODE_PATTERN = /^[A-Z0-9_-]{3,20}$/;

/** Coupon codes are case-insensitive: stored and compared uppercase. Null when the code is not acceptable. */
export function normalizeCouponCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return TICKET_COUPON_CODE_PATTERN.test(code) ? code : null;
}

export type TicketCouponDiscount = { percentOff: number | null; amountOffCents: number | null };

/** Price the buyer pays with a coupon. The discount rounds in the buyer's favor and never charges below R$ 1,00. */
export function discountedTicketCents(priceCents: number, coupon: TicketCouponDiscount): number {
  const discount = coupon.percentOff != null ? Math.round((priceCents * coupon.percentOff) / 100) : coupon.amountOffCents ?? 0;
  return Math.max(TICKET_COUPON_MIN_CHARGE_CENTS, priceCents - discount);
}

export function formatTicketAmount(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

/** Short reference shown to buyers and organizers. */
export function shortTicketCode(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

type DateLike = Date | string;
const time = (value: DateLike) => new Date(value).getTime();

/** PENDING orders reserve a seat until their Pix expires. */
export function isOpenTicketOrder(order: { status: string; expiresAt: DateLike }, now: Date): boolean {
  return order.status === "PENDING" && time(order.expiresAt) > now.getTime();
}

/** Seats taken = paid orders + pending orders whose Pix has not expired. */
export function ticketSeatsTaken(orders: readonly { status: string; expiresAt: DateLike }[], now: Date): number {
  return orders.filter((order) => order.status === "PAID" || isOpenTicketOrder(order, now)).length;
}

/** Null capacity means unlimited. */
export function ticketSeatsLeft(capacity: number | null | undefined, taken: number): number | null {
  return capacity == null ? null : Math.max(0, capacity - taken);
}

export type TicketBlockCode =
  | "not_found" | "not_published" | "ended" | "not_enabled" | "invalid_price" | "seller_not_connected" | "own_event" | "email_unverified";

export type TicketSaleEvent = {
  status: string; dataInicio: string; startTime: string | null; timezone: string | null;
  ticketsEnabled: boolean; isFree: boolean; priceCents: number; userId: string | null;
};

export type TicketEligibilityInput = {
  event: TicketSaleEvent | null;
  /** Null for guests: buyer-specific rules are skipped. */
  buyerId: string | null;
  sellerConnected: boolean;
  buyerEmailVerified: boolean;
  now: Date;
};

/** Why a ticket cannot be bought now, or null when it can. Seat availability is checked separately. */
export function ticketEligibility(input: TicketEligibilityInput): { code: TicketBlockCode; message: string } | null {
  const { event, buyerId, now } = input;
  if (!event) return { code: "not_found", message: "Evento não encontrado." };
  if (event.status !== "PUBLISHED") return { code: "not_published", message: "As vendas deste evento não estão abertas." };
  const start = eventInstant(event.dataInicio.slice(0, 10), event.startTime, event.timezone || "America/Sao_Paulo");
  if (!start || start.getTime() <= now.getTime()) return { code: "ended", message: "As vendas deste evento foram encerradas." };
  if (!event.ticketsEnabled) return { code: "not_enabled", message: "Este evento não vende ingressos pelo EventMap." };
  if (event.isFree || !isValidTicketPrice(event.priceCents)) return { code: "invalid_price", message: "Este evento não tem um preço válido para venda." };
  if (!event.userId || !input.sellerConnected) return { code: "seller_not_connected", message: "O organizador ainda não está recebendo pagamentos pelo EventMap." };
  if (buyerId && buyerId === event.userId) return { code: "own_event", message: "Você não pode comprar ingresso do próprio evento." };
  if (buyerId && !input.buyerEmailVerified) return { code: "email_unverified", message: "Confirme seu e-mail antes de comprar ingressos." };
  return null;
}

/** Server-side rule for the event form: selling through EventMap needs a paid price in bounds and a connected account. */
export function ticketSettingsError(input: { ticketsEnabled: boolean; isFree: boolean; priceCents: number; configured: boolean; sellerConnected: boolean }): string | null {
  if (!input.ticketsEnabled) return null;
  if (!input.configured) return "Os pagamentos ainda não foram configurados no EventMap.";
  if (input.isFree) return "A venda de ingressos pelo EventMap é só para eventos pagos.";
  if (!isValidTicketPrice(input.priceCents)) return `O preço do ingresso deve ficar entre ${formatTicketAmount(TICKET_MIN_CENTS)} e ${formatTicketAmount(TICKET_MAX_CENTS)}.`;
  if (!input.sellerConnected) return "Conecte sua conta do Mercado Pago antes de vender ingressos.";
  return null;
}
