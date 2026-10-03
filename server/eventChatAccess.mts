import type { PrismaClient } from "@prisma/client";

/** Current database role and registration are authoritative, never socket claims. */
export async function canReadEventChat(prisma: PrismaClient, eventId: string, userId?: string): Promise<boolean> {
  if (!userId) return false;
  const [event, user] = await Promise.all([
    prisma.events.findUnique({ where: { id: eventId }, select: { status: true, userId: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
  ]);
  if (!event || !user) return false;
  if (event.userId === userId || user.role === "ADMIN") return true;
  if (event.status !== "PUBLISHED" && event.status !== "ENDED") return false;
  const registration = await prisma.eventRegistration.findUnique({
    where: { eventId_userId: { eventId, userId } }, select: { status: true },
  });
  return registration?.status === "CONFIRMED" || registration?.status === "CHECKED_IN";
}
