import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { Actor, CommunityError, signal, transact } from "@/lib/community/common";
import { EventChatHistoryInput, EventChatSendInput } from "@/schemas/eventChat";
import { EventChatHistory, EventChatSendResult } from "@/types/eventChat";
import { eventChatAccess } from "./access";
import { chatMessageInclude, existingMessage, presentMessage } from "./repository";

const PAGE_SIZE = 50;
export async function chatHistory(eventId: string, actor: Actor | null, input: EventChatHistoryInput): Promise<EventChatHistory> {
  return prisma.$transaction(async tx => {
    const event = await eventChatAccess(tx, eventId, actor);
    const rows = await tx.eventChatMessage.findMany({ where: { eventId, ...(input.before ? { id: { lt: input.before } } : input.after ? { id: { gt: input.after } } : {}) }, orderBy: { id: input.after ? "asc" : "desc" }, take: PAGE_SIZE + 1, include: chatMessageInclude });
    const hasMore = rows.length > PAGE_SIZE;
    const page = rows.slice(0, PAGE_SIZE);
    if (!input.after) page.reverse();
    return { event: { id: event.id, name: event.nome }, messages: page.map(row => presentMessage(row, actor!.id)), hasMore, nextBefore: !input.after && hasMore ? page[0].id : null };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
}

export async function sendChatMessage(eventId: string, actor: Actor, input: EventChatSendInput): Promise<EventChatSendResult> {
  return transact(async tx => {
    // Serialize inserts within an event so sequence cursors follow commit order.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${eventId}, 0))`;
    await eventChatAccess(tx, eventId, actor);
    const existing = await existingMessage(tx, eventId, actor.id, input.clientId);
    if (existing) {
      if (existing.text !== input.text) throw new CommunityError(409, "Esta confirmação pertence a outra mensagem.");
      return { message: presentMessage(existing, actor.id), duplicate: true };
    }
    const now = Date.now();
    const [burst, minute] = await Promise.all([
      tx.eventChatMessage.count({ where: { authorId: actor.id, createdAt: { gte: new Date(now - 10000) } } }),
      tx.eventChatMessage.count({ where: { authorId: actor.id, createdAt: { gte: new Date(now - 60000) } } }),
    ]);
    if (burst >= 10 || minute >= 60) throw new CommunityError(429, "Você enviou muitas mensagens. Aguarde um pouco.");
    const message = await tx.eventChatMessage.create({ data: { eventId, authorId: actor.id, clientId: input.clientId, text: input.text }, include: chatMessageInclude });
    await signal(tx, `chat:${eventId}`);
    return { message: presentMessage(message, actor.id), duplicate: false };
  });
}
