import { z } from "zod";
import { PROMOTION_NOTE_MAX, PROMOTION_PACKAGE_IDS, PROMOTION_REASON_MAX } from "@/lib/promotions";

const id = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const plainText = (max: number) => z.string().trim().max(max).refine((value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value), "Texto inválido.");

/** Only the package id is accepted: price and duration come from server constants. */
export const createPromotionSchema = z.object({ eventId: id, packageId: z.enum(PROMOTION_PACKAGE_IDS) }).strict();
export const markPromotionPaidSchema = z.object({ promotionId: id, note: plainText(PROMOTION_NOTE_MAX).optional() }).strict();
export const cancelPromotionSchema = z.object({ promotionId: id }).strict();
export const reviewPromotionSchema = z.discriminatedUnion("decision", [
  z.object({ promotionId: id, decision: z.literal("confirm") }).strict(),
  z.object({ promotionId: id, decision: z.literal("reject"), reason: plainText(PROMOTION_REASON_MAX).pipe(z.string().min(3, "Informe o motivo da recusa.")) }).strict(),
]);

export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;
export type MarkPromotionPaidInput = z.infer<typeof markPromotionPaidSchema>;
export type CancelPromotionInput = z.infer<typeof cancelPromotionSchema>;
export type ReviewPromotionInput = z.infer<typeof reviewPromotionSchema>;
