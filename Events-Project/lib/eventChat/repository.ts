import { Prisma } from "@prisma/client";
import { EventChatMessage } from "@/types/eventChat";

export const chatMessageInclude = { author: { select: { id: true, name: true, image: true } } } satisfies Prisma.EventChatMessageInclude;
type StoredMessage = Prisma.EventChatMessageGetPayload<{ include: typeof chatMessageInclude }>;
export function presentMessage(message: StoredMessage, actorId: string): EventChatMessage {
  return { id: message.id, clientId: message.clientId, text: message.text, createdAt: message.createdAt.toISOString(), author: { id: message.author.id, name: message.author.name || "Participante", image: message.author.image }, own: message.authorId === actorId };
}
export async function existingMessage(db: Prisma.TransactionClient, eventId: string, authorId: string, clientId: string) {
  return db.eventChatMessage.findUnique({ where: { eventId_authorId_clientId: { eventId, authorId, clientId } }, include: chatMessageInclude });
}
