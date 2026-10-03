import { Prisma } from "@prisma/client";
import { Actor, CommunityError } from "@/lib/community/common";

export async function eventChatAccess(db: Prisma.TransactionClient, eventId: string, actor: Actor | null) {
  if (!actor) throw new CommunityError(401, "Entre na sua conta para participar.");
  const user = await db.user.findUnique({ where: { id: actor.id }, select: { id: true, role: true } });
  if (!user) throw new CommunityError(401, "Entre novamente na sua conta.");
  const event = await db.events.findUnique({ where: { id: eventId }, select: { id: true, nome: true, userId: true, status: true } });
  if (!event) throw new CommunityError(404, "Evento não encontrado.");
  if (user.role === "ADMIN" || event.userId === user.id) return event;
  const registration = await db.eventRegistration.findUnique({ where: { eventId_userId: { eventId, userId: user.id } }, select: { status: true } });
  if (!["PUBLISHED", "ENDED"].includes(event.status) || !registration || !["CONFIRMED", "CHECKED_IN"].includes(registration.status)) {
    throw new CommunityError(403, "O chat está disponível para participantes com inscrição confirmada.");
  }
  return event;
}
