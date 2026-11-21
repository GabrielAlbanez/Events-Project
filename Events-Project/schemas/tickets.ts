import { z } from "zod";

const id = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

/** Only ids are accepted: price, fee and seller always come from the server. */
export const createTicketOrderSchema = z.object({ eventId: id }).strict();
export const ticketOrderSchema = z.object({ orderId: id }).strict();
export const connectCallbackSchema = z.object({
  code: z.string().trim().min(1).max(512).regex(/^[\w.-]+$/).nullish(),
  state: z.string().trim().min(1).max(512).nullish(),
  error: z.string().trim().max(120).nullish(),
}).strict();

export type CreateTicketOrderInput = z.infer<typeof createTicketOrderSchema>;
export type TicketOrderInput = z.infer<typeof ticketOrderSchema>;
