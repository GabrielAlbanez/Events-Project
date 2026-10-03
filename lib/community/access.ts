import { Prisma } from "@prisma/client";
import { Actor, CommunityError } from "./common";

export async function eventCommunityAccess(db: Prisma.TransactionClient, eventId: string, actor: Actor | null) {
  const currentActor = actor ? await db.user.findUnique({ where: { id: actor.id }, select: { id: true, role: true } }) : null;
  if (actor && !currentActor) throw new CommunityError(401, "Entre novamente na sua conta.");
  const event = await db.events.findUnique({ where: { id: eventId } });
  if (!event) throw new CommunityError(404, "Evento não encontrado.");
  const manage = !!currentActor && (currentActor.role === "ADMIN" || event.userId === currentActor.id);
  const team = manage || (!!actor && !!await db.communityTeamMember.findUnique({ where: { eventId_userId: { eventId, userId: actor.id } } }));
  if (!["PUBLISHED", "ENDED"].includes(event.status) && !team) throw new CommunityError(404, "Evento indisponível.");
  return { event, manage, team };
}
