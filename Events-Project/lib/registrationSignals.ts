import type { Prisma } from "@prisma/client";

/**
 * Tells the people affected by a registration change to re-read it: the attendee, the organizer and the door team.
 * The signal carries only a room name and is committed with the change, so nobody is told about something that rolled back.
 */
export async function signalRegistrationChange(tx: Prisma.TransactionClient, eventId: string, userIds: Array<string | null | undefined>): Promise<void> {
  const [event, team] = await Promise.all([
    tx.events.findUnique({ where: { id: eventId }, select: { userId: true } }),
    tx.communityTeamMember.findMany({ where: { eventId }, select: { userId: true }, take: 50 }),
  ]);
  const people = new Set<string>();
  for (const id of [...userIds, event?.userId, ...team.map((member) => member.userId)]) if (id) people.add(id);
  if (people.size) await tx.communitySignal.createMany({ data: Array.from(people, (id) => ({ room: `user:${id}` })) });
}
