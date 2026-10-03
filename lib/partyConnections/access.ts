import { Prisma } from "@prisma/client";
import { Actor, CommunityError } from "@/lib/community/common";

export async function partyParticipant(db: Prisma.TransactionClient, eventId: string, userId: string): Promise<boolean> {
  const [user, event, registration] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { id: true } }),
    db.events.findUnique({ where: { id: eventId }, select: { status: true } }),
    db.eventRegistration.findUnique({ where: { eventId_userId: { eventId, userId } }, select: { status: true } }),
  ]);
  return !!user && !!event && ["PUBLISHED", "ENDED"].includes(event.status) && !!registration && ["CONFIRMED", "CHECKED_IN"].includes(registration.status);
}
export function compatible(a: { intent: string; adultDeclared: boolean }, b: { intent: string; adultDeclared: boolean }): boolean {
  if (!["FRIENDSHIP", "COMPANY", "DATING"].includes(a.intent) || !["FRIENDSHIP", "COMPANY", "DATING"].includes(b.intent)) return false;
  return a.intent === "DATING" || b.intent === "DATING" ? a.intent === "DATING" && b.intent === "DATING" && a.adultDeclared && b.adultDeclared : true;
}
export async function blocked(db: Prisma.TransactionClient, a: string, b: string): Promise<boolean> {
  return !!await db.partyBlock.findFirst({ where: { OR: [{ fromId: a, toId: b }, { fromId: b, toId: a }] } });
}
export async function pairAccess(db: Prisma.TransactionClient, eventId: string, a: string, b: string) {
  const [left, right, eligibleA, eligibleB, isBlocked] = await Promise.all([
    db.partyProfile.findUnique({ where: { eventId_userId: { eventId, userId: a } } }),
    db.partyProfile.findUnique({ where: { eventId_userId: { eventId, userId: b } } }),
    partyParticipant(db, eventId, a), partyParticipant(db, eventId, b), blocked(db, a, b),
  ]);
  if (a === b || !left?.active || !right?.active || !eligibleA || !eligibleB || isBlocked || !compatible(left, right)) throw new CommunityError(403, "Esta conexão não está disponível.");
  return { left, right };
}
export async function matchAccess(db: Prisma.TransactionClient, matchId: string, actor: Actor) {
  const match = await db.partyMatch.findUnique({ where: { id: matchId } });
  if (!match?.active || ![match.userAId, match.userBId].includes(actor.id)) throw new CommunityError(403, "Conversa indisponível.");
  const profiles = await pairAccess(db, match.eventId, actor.id, match.userAId === actor.id ? match.userBId : match.userAId);
  return { match, ...profiles };
}
