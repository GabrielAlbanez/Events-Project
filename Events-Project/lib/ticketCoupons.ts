import type { CreateTicketCouponInput } from "@/schemas/tickets";
import {
  TICKET_COUPON_MAX_PERCENT,
  TICKET_COUPON_MIN_CHARGE_CENTS,
  discountedTicketCents,
  formatTicketAmount,
  normalizeCouponCode,
  ticketNetCents,
  type TicketCouponDiscount,
} from "@/lib/tickets";

/** Client-safe helpers for the coupon UI. The server (lib/services/tickets.ts) validates everything again. */
export const COUPON_QUERY_PARAM = "cupom";
const MAX_AMOUNT_OFF_CENTS = 500_000;
const MAX_USES = 100_000;

/** Public event link that pre-fills the coupon at checkout. Null for non-http(s) origins. */
export function couponShareUrl(origin: string, eventId: string, code: string): string | null {
  try {
    const base = new URL(origin);
    if (!["http:", "https:"].includes(base.protocol)) return null;
    const url = new URL("/eventos/" + encodeURIComponent(eventId), base.origin);
    url.searchParams.set(COUPON_QUERY_PARAM, code.trim().toUpperCase());
    return url.href;
  } catch {
    return null;
  }
}

/** Coupon code from a location search string (?cupom=CODE), normalized; null when absent or malformed. */
export function couponCodeFromSearch(search: string): string | null {
  try {
    return normalizeCouponCode(new URLSearchParams(search).get(COUPON_QUERY_PARAM));
  } catch {
    return null;
  }
}

export function couponDiscountLabel(coupon: TicketCouponDiscount): string {
  return coupon.percentOff != null ? `${coupon.percentOff}% off` : `${formatTicketAmount(coupon.amountOffCents ?? 0)} off`;
}

/** What the buyer pays and what the organizer receives (platform fee over the discounted price, before Mercado Pago's fee). */
export function couponExample(priceCents: number, coupon: TicketCouponDiscount): { priceCents: number; finalCents: number; netCents: number } {
  const finalCents = discountedTicketCents(priceCents, coupon);
  return { priceCents, finalCents, netCents: ticketNetCents(finalCents) };
}

export type CouponFormValues = { eventId: string; code: string; kind: "percent" | "amount"; value: string; maxUses: string; expiresAt: string };
export type CouponFormField = "code" | "value" | "maxUses" | "expiresAt";
export type CouponFormResult = { ok: true; input: CreateTicketCouponInput } | { ok: false; field: CouponFormField; message: string };

const fail = (field: CouponFormField, message: string): CouponFormResult => ({ ok: false, field, message });

/** Validates the organizer form with the same rules as the server and builds the server action input. */
export function parseCouponForm(values: CouponFormValues, now: Date = new Date()): CouponFormResult {
  const code = normalizeCouponCode(values.code);
  if (!code) return fail("code", "Use de 3 a 20 letras, números, - ou _.");

  const raw = values.value.trim();
  let discount: Pick<CreateTicketCouponInput, "percentOff" | "amountOffCents">;
  if (values.kind === "percent") {
    const percent = /^\d{1,3}$/.test(raw) ? Number(raw) : NaN;
    if (!(percent >= 1 && percent <= TICKET_COUPON_MAX_PERCENT)) return fail("value", `Informe um desconto inteiro de 1% a ${TICKET_COUPON_MAX_PERCENT}%.`);
    discount = { percentOff: percent };
  } else {
    const cents = /^\d{1,4}([.,]\d{1,2})?$/.test(raw) ? Math.round(Number(raw.replace(",", ".")) * 100) : NaN;
    if (!(cents >= TICKET_COUPON_MIN_CHARGE_CENTS && cents <= MAX_AMOUNT_OFF_CENTS)) return fail("value", `Informe um valor a partir de ${formatTicketAmount(TICKET_COUPON_MIN_CHARGE_CENTS)}.`);
    discount = { amountOffCents: cents };
  }

  const input: CreateTicketCouponInput = { eventId: values.eventId, code, ...discount };
  const uses = values.maxUses.trim();
  if (uses) {
    const maxUses = /^\d{1,6}$/.test(uses) ? Number(uses) : NaN;
    if (!(maxUses >= 1 && maxUses <= MAX_USES)) return fail("maxUses", "O limite deve ser um número inteiro a partir de 1.");
    input.maxUses = maxUses;
  }
  if (values.expiresAt.trim()) {
    const expires = new Date(values.expiresAt);
    if (Number.isNaN(expires.getTime())) return fail("expiresAt", "Informe uma data e hora válidas.");
    if (expires.getTime() <= now.getTime()) return fail("expiresAt", "A validade precisa ser no futuro.");
    input.expiresAt = expires.toISOString();
  }
  return { ok: true, input };
}
