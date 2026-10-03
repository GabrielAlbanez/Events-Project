import type { PrismaClient } from "@prisma/client";

async function activeParticipant(prisma: PrismaClient, eventId: string, userId: string) {
  const [profile, registration] = await Promise.all([
    prisma.partyProfile.findUnique({ where: { eventId_userId: { eventId, userId } }, select: { active: true, intent: true, adultDeclared: true } }),
    prisma.eventRegistration.findUnique({ where: { eventId_userId: { eventId, userId } }, select: { status: true } }),
  ]);
  if (!profile?.active || (registration?.status !== "CONFIRMED" && registration?.status !== "CHECKED_IN")) return null;
  if (!["FRIENDSHIP", "COMPANY", "DATING"].includes(profile.intent)) return null;
  if (profile.intent === "DATING" && !profile.adultDeclared) return null;
  return profile;
}

async function publicEvent(prisma: PrismaClient, eventId: string): Promise<boolean> {
  const event = await prisma.events.findUnique({ where: { id: eventId }, select: { status: true } });
  return event?.status === "PUBLISHED" || event?.status === "ENDED";
}

/** No role or event ownership grants access to private discovery or conversations. */
export async function canReadPartyConnections(prisma: PrismaClient, eventId: string, userId?: string): Promise<boolean> {
  if (!userId || !await publicEvent(prisma, eventId)) return false;
  return Boolean(await activeParticipant(prisma, eventId, userId));
}

export async function canReadPartyMatch(prisma: PrismaClient, matchId: string, userId?: string): Promise<boolean> {
  if (!userId) return false;
  const match = await prisma.partyMatch.findUnique({ where: { id: matchId }, select: { eventId: true, userAId: true, userBId: true, active: true } });
  if (!match?.active || (match.userAId !== userId && match.userBId !== userId) || !await publicEvent(prisma, match.eventId)) return false;
  const [a, b, blocked] = await Promise.all([
    activeParticipant(prisma, match.eventId, match.userAId),
    activeParticipant(prisma, match.eventId, match.userBId),
    prisma.partyBlock.findFirst({ where: { OR: [{ fromId: match.userAId, toId: match.userBId }, { fromId: match.userBId, toId: match.userAId }] }, select: { fromId: true } }),
  ]);
  if (!a || !b || blocked) return false;
  return (a.intent === "DATING") === (b.intent === "DATING");
}
