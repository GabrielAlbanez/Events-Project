import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { CommunityError, signal, transact, type Actor } from "@/lib/community/common";
import type { CommunityRoomSnapshot, CommunityRoomSummary } from "@/types/community";

const id = z.string().uuid();
const roomName = z.string().trim().min(2).max(80);
const roomAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("member.add"), email: z.string().trim().toLowerCase().email().max(254) }),
  z.object({ action: z.literal("member.remove"), userId: id }),
  z.object({ action: z.literal("suggestion.add"), eventId: id }),
  z.object({ action: z.literal("suggestion.vote"), suggestionId: id, voted: z.boolean() }),
]);

async function membership(tx: Prisma.TransactionClient, roomId: string, actor: Actor) {
  const room = await tx.friendsRoom.findUnique({ where: { id: roomId }, select: {
    id: true, name: true, ownerId: true,
    members: { where: { userId: actor.id }, select: { userId: true } },
  } });
  if (!room || !room.members.length) throw new CommunityError(404, "Sala indisponível para sua conta.");
  return room;
}

export async function listRooms(actor: Actor): Promise<{ rooms: CommunityRoomSummary[] }> {
  const rooms = await prisma.friendsRoom.findMany({
    where: { members: { some: { userId: actor.id } } },
    select: { id: true, name: true, ownerId: true, _count: { select: { members: true, suggestions: true } } },
    orderBy: { createdAt: "desc" }, take: 100,
  });
  return { rooms: rooms.map(room => ({ id: room.id, name: room.name, owner: room.ownerId === actor.id,
    members: room._count.members, suggestions: room._count.suggestions })) };
}

export async function createRoom(actor: Actor, input: unknown) {
  const parsed = z.object({ action: z.literal("room.create"), name: roomName }).safeParse(input);
  if (!parsed.success) throw new CommunityError(400, "Informe um nome de 2 a 80 caracteres para a sala.");
  return transact(async tx => {
    const count = await tx.friendsRoom.count({ where: { ownerId: actor.id } });
    if (count >= 20) throw new CommunityError(409, "Você já possui 20 salas. Use uma sala existente.");
    const room = await tx.friendsRoom.create({ data: { name: parsed.data.name, ownerId: actor.id,
      members: { create: { userId: actor.id } } }, select: { id: true, name: true } });
    await signal(tx, `user:${actor.id}`);
    return room;
  });
}

export async function getRoom(roomId: string, actor: Actor): Promise<CommunityRoomSnapshot> {
  if (!id.safeParse(roomId).success) throw new CommunityError(404, "Sala indisponível.");
  return transact(async tx => {
    const room = await membership(tx, roomId, actor);
    const [members, suggestions, availableEvents] = await Promise.all([
      tx.friendsRoomMember.findMany({ where: { roomId }, select: { user: { select: { id: true, name: true } } },
        orderBy: { userId: "asc" }, take: 50 }),
      tx.friendsSuggestion.findMany({ where: { roomId, event: { status: "PUBLISHED" } }, select: {
        id: true, authorId: true, event: { select: { id: true, nome: true, dataInicio: true } },
        votes: { where: { userId: actor.id }, select: { userId: true } }, _count: { select: { votes: true } },
      }, orderBy: { id: "asc" }, take: 100 }),
      tx.events.findMany({ where: { status: "PUBLISHED" }, select: { id: true, nome: true, dataInicio: true },
        orderBy: [{ dataInicio: "asc" }, { id: "asc" }], take: 100 }),
    ]);
    const authors = await tx.user.findMany({ where: { id: { in: suggestions.map(item => item.authorId) } }, select: { id: true, name: true } });
    const names = new Map(authors.map(user => [user.id, user.name]));
    return { id: room.id, name: room.name, owner: room.ownerId === actor.id,
      members: members.map(member => ({ id: member.user.id, name: member.user.name || "Participante" })),
      suggestions: suggestions.map(item => ({ id: item.id, authorName: names.get(item.authorId) || "Participante",
        event: { id: item.event.id, name: item.event.nome, date: item.event.dataInicio },
        votes: item._count.votes, mine: item.votes.length > 0 })),
      availableEvents: availableEvents.map(event => ({ id: event.id, name: event.nome, date: event.dataInicio })),
    };
  });
}

export async function mutateRoom(roomId: string, actor: Actor, input: unknown) {
  const parsed = roomAction.safeParse(input);
  if (!id.safeParse(roomId).success || !parsed.success) throw new CommunityError(400, "Confira os dados enviados.");
  const action = parsed.data;
  return transact(async tx => {
    const room = await membership(tx, roomId, actor);
    if (action.action.startsWith("member.") && room.ownerId !== actor.id)
      throw new CommunityError(403, "Somente o criador da sala pode alterar os membros.");
    if (action.action === "member.add") {
      const target = await tx.user.findFirst({ where: { email: { equals: action.email, mode: "insensitive" } }, select: { id: true, emailVerified: true } });
      if (!target || !target.emailVerified) throw new CommunityError(400, "Não foi possível adicionar essa conta. Confira o email e sua confirmação.");
      const exists = await tx.friendsRoomMember.findUnique({ where: { roomId_userId: { roomId, userId: target.id } } });
      if (!exists) {
        if (await tx.friendsRoomMember.count({ where: { roomId } }) >= 50) throw new CommunityError(409, "A sala comporta até 50 membros.");
        await tx.friendsRoomMember.create({ data: { roomId, userId: target.id } });
        await tx.notification.create({ data: { userId: target.id, title: "Você entrou em uma sala de amigos",
          message: `Combine seu próximo evento na sala ${room.name}.`, href: `/salas/${roomId}` } });
      }
      await signal(tx, `user:${target.id}`);
    } else if (action.action === "member.remove") {
      if (action.userId === room.ownerId) throw new CommunityError(400, "O criador precisa permanecer na sala.");
      await tx.friendsRoomMember.deleteMany({ where: { roomId, userId: action.userId } });
      await tx.friendsVote.deleteMany({ where: { userId: action.userId, suggestion: { roomId } } });
      await signal(tx, `user:${action.userId}`);
    } else if (action.action === "suggestion.add") {
      const event = await tx.events.findUnique({ where: { id: action.eventId }, select: { status: true } });
      if (event?.status !== "PUBLISHED") throw new CommunityError(404, "Escolha um evento publicado.");
      const exists = await tx.friendsSuggestion.findUnique({ where: { roomId_eventId: { roomId, eventId: action.eventId } } });
      if (!exists) {
        if (await tx.friendsSuggestion.count({ where: { roomId } }) >= 100) throw new CommunityError(409, "A sala já possui 100 sugestões.");
        await tx.friendsSuggestion.create({ data: { roomId, eventId: action.eventId, authorId: actor.id } });
      }
    } else if (action.action === "suggestion.vote") {
      const suggestion = await tx.friendsSuggestion.findFirst({ where: { id: action.suggestionId, roomId, event: { status: "PUBLISHED" } }, select: { id: true } });
      if (!suggestion) throw new CommunityError(404, "Sugestão indisponível nesta sala.");
      if (action.voted) await tx.friendsVote.upsert({ where: { suggestionId_userId: { suggestionId: suggestion.id, userId: actor.id } },
        create: { suggestionId: suggestion.id, userId: actor.id }, update: {} });
      else await tx.friendsVote.deleteMany({ where: { suggestionId: suggestion.id, userId: actor.id } });
    }
    await signal(tx, `friends:${roomId}`);
    return { message: "Sala atualizada." };
  });
}
