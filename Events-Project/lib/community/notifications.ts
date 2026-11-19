import { createNotification, createNotifications } from "@/lib/notifications/create";
import { notificationCopy } from "@/lib/notifications/catalog";
import { Prisma } from "@prisma/client";
import { signal } from "./common";

export async function notifyCommunityUser(tx: Prisma.TransactionClient, eventId: string, userId: string | null, title: string, message: string): Promise<void> {
  if (!userId || !await tx.user.findUnique({ where: { id: userId }, select: { id: true } })) return;
  await createNotification(tx, notificationCopy({ ...{ userId, title, message, href: `/eventos/${eventId}/comunidade` }, type: "COMMUNITY" }));
  await signal(tx, `user:${userId}`);
}
/**
 * Official announcement → confirmed and checked-in attendees (OPP-07), one batched insert.
 * The groupKey deduplicates retried transactions; the push payload shows only public text.
 */
export async function notifyAnnouncementAudience(tx: Prisma.TransactionClient, eventId: string, eventName: string, announcementTitle: string, actorId: string): Promise<number> {
  const registrations = await tx.eventRegistration.findMany({ where: { eventId, status: { in: ["CONFIRMED", "CHECKED_IN"] } }, select: { userId: true } });
  const recipients = Array.from(new Set(registrations.map(registration => registration.userId))).filter(userId => userId !== actorId);
  if (!recipients.length) return 0;
  const groupKey = `announcement:${eventId}:${announcementTitle}`.slice(0, 160);
  const already = new Set((await tx.notification.findMany({ where: { userId: { in: recipients }, groupKey, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } }, select: { userId: true } })).map(notice => notice.userId));
  const fresh = recipients.filter(userId => !already.has(userId));
  if (fresh.length) await createNotifications(tx, fresh.map(userId => notificationCopy({ userId, title: `Comunicado: ${eventName}`, message: announcementTitle, href: `/eventos/${eventId}/comunidade`, type: "EVENT_CHANGE" as const, groupKey })));
  return fresh.length;
}
export async function notifyQuestionAnswer(tx: Prisma.TransactionClient, eventId: string, authorId: string, previous: string, answer: string): Promise<void> {
  if (previous !== answer) await notifyCommunityUser(tx, eventId, authorId, "Sua pergunta foi respondida", "A organização respondeu à sua pergunta. Confira a comunidade do evento.");
}
export async function notifyTaskHelp(tx: Prisma.TransactionClient, eventId: string, ownerId: string | null, previous: string, status: string, title: string): Promise<void> {
  if (status === "HELP" && previous !== "HELP") await notifyCommunityUser(tx, eventId, ownerId, "A equipe precisa de ajuda", `Ajuda solicitada na tarefa: ${title}`);
}
