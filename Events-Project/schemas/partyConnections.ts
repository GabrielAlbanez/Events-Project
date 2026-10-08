import { z } from "zod";
const id = z.string().uuid();
const reason = z.enum(["HARASSMENT", "SPAM", "SAFETY", "OTHER"]);
function safePhoto(value: string): boolean {
  if (!value) return true;
  if (/^\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|avif)$/.test(value)) return true;
  try {
    const url = new URL(value), host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password && !url.port && host.includes(".") && !host.endsWith(".local") && !host.endsWith(".localhost") && host !== "localhost" && !/^[\d.]+$/.test(host) && !host.includes(":");
  } catch { return false; }
}
export const partyActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("profile.save"), displayName: z.string().trim().min(2).max(60), photoUrl: z.string().max(600).refine(safePhoto).default(""), bio: z.string().trim().max(300).default(""), interests: z.array(z.string().trim().min(1).max(30)).max(6), intent: z.enum(["FRIENDSHIP", "COMPANY", "DATING"]), adultDeclared: z.boolean() }).strict(),
  z.object({ action: z.literal("profile.leave") }).strict(),
  z.object({ action: z.literal("like"), userId: id }).strict(),
  z.object({ action: z.literal("block"), userId: id }).strict(),
  z.object({ action: z.literal("unblock"), userId: id }).strict(),
  z.object({ action: z.literal("report"), userId: id, reason, messageId: z.number().int().positive().optional() }).strict(),
]);
export type PartyAction = z.infer<typeof partyActionSchema>;
export const partyReviewSchema = z.object({ id, status: z.enum(["RESOLVED", "DISMISSED"]) }).strict();
