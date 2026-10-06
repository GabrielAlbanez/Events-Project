import prisma from "@/lib/prisma";
import { Prisma, PartyMessage, PartyProfile } from "@prisma/client";
import { Actor, CommunityError, signal, transact } from "@/lib/community/common";
import { EventChatHistoryInput } from "@/schemas/eventChat";
import { PartySendInput } from "@/schemas/partyMessage";
import { EventChatHistory, EventChatMessage, EventChatSendResult } from "@/types/eventChat";
import { matchAccess } from "./access";
import { getReceipt } from "./receipts";
import { bindChatImage, chatImageKind, chatImageUrl, imageData } from "./attachments";

function present(row: PartyMessage, own: PartyProfile, partner: PartyProfile): EventChatMessage {
  const profile = row.authorId === own.userId ? own : partner;
  return { id: row.id, clientId: row.clientId, text: row.text, createdAt: row.createdAt.toISOString(), author: { id: row.authorId, name: profile.displayName, image: profile.photoUrl || null }, own: row.authorId === own.userId };
}
async function withAccountImages(tx: Prisma.TransactionClient, own: PartyProfile, partner: PartyProfile) {
  const users = await tx.user.findMany({ where: { id: { in: [own.userId, partner.userId] } }, select: { id: true, image: true } });
  const images = new Map(users.map(user => [user.id, user.image]));
  return { own: { ...own, photoUrl: own.photoUrl || images.get(own.userId) || "" }, partner: { ...partner, photoUrl: partner.photoUrl || images.get(partner.userId) || "" } };
}
export async function privateHistory(eventId: string, matchId: string, actor: Actor, input: EventChatHistoryInput): Promise<EventChatHistory> {
  return prisma.$transaction(async tx => {
    const access = await matchAccess(tx, matchId, actor);
    if (access.match.eventId !== eventId) throw new CommunityError(403, "Conversa indisponível.");
    const photos = await withAccountImages(tx, access.left, access.right);
    const rows = await tx.partyMessage.findMany({ where: { matchId, ...(input.before ? { id: { lt: input.before } } : input.after ? { id: { gt: input.after } } : {}) }, take: 51, orderBy: { id: input.after ? "asc" : "desc" } });
    const hasMore = rows.length > 50, page = rows.slice(0, 50);
    if (!input.after) page.reverse();
    const receipt = await getReceipt(tx, matchId, access.right.userId);
    const images = page.length ? await tx.communityEntry.findMany({ where: { eventId, kind: chatImageKind, AND: [{ data: { path: ["matchId"], equals: matchId } }, { OR: page.map(message => ({ data: { path: ["messageId"], equals: message.id } })) }] }, take: 50 }) : [];
    const attached = new Map(images.flatMap(row => { const image = imageData(row); return image?.messageId && page.some(message => message.id === image.messageId) ? [[image.messageId, chatImageUrl(eventId, matchId, row.id)] as const] : []; }));
    return { event: { id: matchId, name: access.right.displayName, partnerId: access.right.userId, partnerImage: photos.partner.photoUrl || null }, messages: page.map(row => ({ ...present(row, photos.own, photos.partner), ...(attached.has(row.id) ? { image: { url: attached.get(row.id)! } } : {}) })), hasMore, nextBefore: !input.after && hasMore ? page[0].id : null, partnerReceipt: { deliveredThrough: receipt.deliveredThrough, readThrough: receipt.readThrough, typingUntil: receipt.typingUntil } };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
}
export async function privateSend(eventId: string, matchId: string, actor: Actor, input: PartySendInput): Promise<EventChatSendResult> {
  return transact(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`match:${matchId}`}, 0))`;
    const access = await matchAccess(tx, matchId, actor);
    if (access.match.eventId !== eventId) throw new CommunityError(403, "Conversa indisponível.");
    const photos = await withAccountImages(tx, access.left, access.right);
    const existing = await tx.partyMessage.findUnique({ where: { matchId_authorId_clientId: { matchId, authorId: actor.id, clientId: input.clientId } } });
    if (existing) {
      if (existing.text !== input.text) throw new CommunityError(409, "Confirmação pertence a outra mensagem.");
      const attached = await tx.communityEntry.findFirst({ where: { eventId, kind: chatImageKind, data: { path: ["messageId"], equals: existing.id } } });
      if ((attached?.id ?? undefined) !== input.imageId) throw new CommunityError(409, "Confirmação pertence a outra imagem.");
      return { message: { ...present(existing, photos.own, photos.partner), ...(attached ? { image: { url: chatImageUrl(eventId, matchId, attached.id) } } : {}) }, duplicate: true };
    }
    const [burst, minute] = await Promise.all([
      tx.partyMessage.count({ where: { authorId: actor.id, createdAt: { gte: new Date(Date.now() - 10000) } } }),
      tx.partyMessage.count({ where: { authorId: actor.id, createdAt: { gte: new Date(Date.now() - 60000) } } }),
    ]);
    if (burst >= 10 || minute >= 60) throw new CommunityError(429, "Aguarde um pouco antes de enviar mais mensagens.");
    const row = await tx.partyMessage.create({ data: { matchId, authorId: actor.id, clientId: input.clientId, text: input.text } });
    if (input.imageId) await bindChatImage(tx, eventId, matchId, actor.id, input.imageId, row.id);
    await signal(tx, `match:${matchId}`);
    // The recipient may be viewing the conversation list rather than this room.
    await signal(tx, `user:${access.right.userId}`);
    return { message: { ...present(row, photos.own, photos.partner), ...(input.imageId ? { image: { url: chatImageUrl(eventId, matchId, input.imageId) } } : {}) }, duplicate: false };
  }, { timeout: 15000, maxWait: 10000 });
}
