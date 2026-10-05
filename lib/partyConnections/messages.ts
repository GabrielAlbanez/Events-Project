import prisma from "@/lib/prisma";
import { Prisma, PartyMessage, PartyProfile } from "@prisma/client";
import { Actor, CommunityError, signal, transact } from "@/lib/community/common";
import { EventChatHistoryInput, EventChatSendInput } from "@/schemas/eventChat";
import { EventChatHistory, EventChatMessage, EventChatSendResult } from "@/types/eventChat";
import { matchAccess } from "./access";
import { getReceipt } from "./receipts";

function present(row: PartyMessage, own: PartyProfile, partner: PartyProfile): EventChatMessage {
  const profile = row.authorId === own.userId ? own : partner;
  return { id: row.id, clientId: row.clientId, text: row.text, createdAt: row.createdAt.toISOString(), author: { id: row.authorId, name: profile.displayName, image: profile.photoUrl || null }, own: row.authorId === own.userId };
}
export async function privateHistory(eventId: string, matchId: string, actor: Actor, input: EventChatHistoryInput): Promise<EventChatHistory> {
  return prisma.$transaction(async tx => {
    const access = await matchAccess(tx, matchId, actor);
    if (access.match.eventId !== eventId) throw new CommunityError(403, "Conversa indisponível.");
    const rows = await tx.partyMessage.findMany({ where: { matchId, ...(input.before ? { id: { lt: input.before } } : input.after ? { id: { gt: input.after } } : {}) }, take: 51, orderBy: { id: input.after ? "asc" : "desc" } });
    const hasMore = rows.length > 50, page = rows.slice(0, 50);
    if (!input.after) page.reverse();
    const receipt = await getReceipt(tx, matchId, access.right.userId);
    return { event: { id: matchId, name: access.right.displayName, partnerId: access.right.userId }, messages: page.map(row => present(row, access.left, access.right)), hasMore, nextBefore: !input.after && hasMore ? page[0].id : null, partnerReceipt: { deliveredThrough: receipt.deliveredThrough, readThrough: receipt.readThrough, typingUntil: receipt.typingUntil } };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
}
export async function privateSend(eventId: string, matchId: string, actor: Actor, input: EventChatSendInput): Promise<EventChatSendResult> {
  return transact(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`match:${matchId}`}, 0))`;
    const access = await matchAccess(tx, matchId, actor);
    if (access.match.eventId !== eventId) throw new CommunityError(403, "Conversa indisponível.");
    const existing = await tx.partyMessage.findUnique({ where: { matchId_authorId_clientId: { matchId, authorId: actor.id, clientId: input.clientId } } });
    if (existing) {
      if (existing.text !== input.text) throw new CommunityError(409, "Confirmação pertence a outra mensagem.");
      return { message: present(existing, access.left, access.right), duplicate: true };
    }
    const [burst, minute] = await Promise.all([
      tx.partyMessage.count({ where: { authorId: actor.id, createdAt: { gte: new Date(Date.now() - 10000) } } }),
      tx.partyMessage.count({ where: { authorId: actor.id, createdAt: { gte: new Date(Date.now() - 60000) } } }),
    ]);
    if (burst >= 10 || minute >= 60) throw new CommunityError(429, "Aguarde um pouco antes de enviar mais mensagens.");
    const row = await tx.partyMessage.create({ data: { matchId, authorId: actor.id, clientId: input.clientId, text: input.text } });
    await signal(tx, `match:${matchId}`);
    // The recipient may be viewing the conversation list rather than this room.
    await signal(tx, `user:${access.right.userId}`);
    return { message: present(row, access.left, access.right), duplicate: false };
  });
}
