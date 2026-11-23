import { z } from "zod";

const id = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

/** Only ids are accepted: price, fee and seller always come from the server. */
export const createTicketOrderSchema = z.object({ eventId: id, couponCode: z.string().trim().max(40).optional(), quantity: z.number().int().min(1).max(6).optional() }).strict();
/** Coupon fields are validated again by the service (code format, percent cap, exactly one discount kind). */
export const createTicketCouponSchema = z.object({
  eventId: id,
  code: z.string().trim().max(40),
  percentOff: z.number().int().min(1).max(90).optional(),
  amountOffCents: z.number().int().min(100).max(500_000).optional(),
  maxUses: z.number().int().min(1).max(100_000).optional(),
  expiresAt: z.string().datetime().optional(),
}).strict();
export const ticketCouponPreviewSchema = z.object({ eventId: id, code: z.string().trim().max(40) }).strict();
export const ticketCouponToggleSchema = z.object({ couponId: id, active: z.boolean() }).strict();
export const ticketOrderSchema = z.object({ orderId: id }).strict();
export const connectCallbackSchema = z.object({
  code: z.string().trim().min(1).max(512).regex(/^[\w.-]+$/).nullish(),
  state: z.string().trim().min(1).max(512).nullish(),
  error: z.string().trim().max(120).nullish(),
}).strict();

export type CreateTicketOrderInput = z.infer<typeof createTicketOrderSchema>;
export type TicketOrderInput = z.infer<typeof ticketOrderSchema>;
export type CreateTicketCouponInput = z.infer<typeof createTicketCouponSchema>;
export type TicketCouponPreviewInput = z.infer<typeof ticketCouponPreviewSchema>;
export type TicketCouponToggleInput = z.infer<typeof ticketCouponToggleSchema>;
