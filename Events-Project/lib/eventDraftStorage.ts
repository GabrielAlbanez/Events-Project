import { z } from "zod";
const text = z.string().max(4000);
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
export const eventDraftSchema = z.object({
  values: z.object({ nome: text, descricao: text, LinkParaCompraIngresso: text, endereco: text, category: text, price: text, capacity: text, isFree: z.boolean(), startTime: text, endTime: text }).strict(),
  dates: z.tuple([calendarDate, calendarDate]).nullable(),
  coordinates: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).strict().nullable(),
  recurrence: z.enum(["none", "WEEKLY", "MONTHLY"]), repeatEvery: z.number().int().min(1).max(4), occurrences: z.number().int().min(2).max(52),
}).strict();
export type EventDraft = z.infer<typeof eventDraftSchema>;
export const draftEnvelopeSchema = z.object({ version: z.literal(1), savedAt: z.number().finite(), base: z.string().max(20000), draft: eventDraftSchema }).strict();
export type DraftEnvelope = z.infer<typeof draftEnvelopeSchema>;
export const EVENT_DRAFT_TTL = 7 * 24 * 60 * 60 * 1000;
export function parseStoredEventDraft(raw: string | null, now = Date.now()): DraftEnvelope | null {
  if (!raw || raw.length > 40000) return null;
  try { const result = draftEnvelopeSchema.safeParse(JSON.parse(raw)); return result.success && result.data.savedAt <= now && now - result.data.savedAt <= EVENT_DRAFT_TTL ? result.data : null; } catch { return null; }
}
