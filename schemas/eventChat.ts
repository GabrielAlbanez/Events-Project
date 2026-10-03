import { z } from "zod";

export const eventChatSendSchema = z.object({
  clientId: z.string().uuid(),
  text: z.string().trim().min(1).max(1000).refine(value => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value), "Texto inválido."),
}).strict();
const cursor = z.coerce.number().int().positive().max(2147483647).optional();
export const eventChatHistorySchema = z.object({ before: cursor, after: cursor }).refine(value => !(value.before && value.after));
export type EventChatSendInput = z.infer<typeof eventChatSendSchema>;
export type EventChatHistoryInput = z.infer<typeof eventChatHistorySchema>;
