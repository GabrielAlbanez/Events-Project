import { z } from "zod";
import { eventChatSendSchema } from "./eventChat";
export const partySendSchema = eventChatSendSchema.extend({
  text: eventChatSendSchema.shape.text.or(z.literal("")),
  imageId: z.string().uuid().optional(),
}).refine(value => !!value.text || !!value.imageId, "Escreva uma mensagem ou escolha uma imagem.");
export type PartySendInput = z.infer<typeof partySendSchema>;
