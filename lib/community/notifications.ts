import { Prisma } from "@prisma/client";
import { signal } from "./common";

export async function notifyCommunityUser(tx: Prisma.TransactionClient, eventId: string, userId: string | null, title: string, message: string): Promise<void> {
  if (!userId || !await tx.user.findUnique({ where: { id: userId }, select: { id: true } })) return;
  await tx.notification.create({ data: { userId, title, message, href: `/eventos/${eventId}/comunidade` } });
  await signal(tx, `user:${userId}`);
}
export async function notifyQuestionAnswer(tx: Prisma.TransactionClient, eventId: string, authorId: string, previous: string, answer: string): Promise<void> {
  if (previous !== answer) await notifyCommunityUser(tx, eventId, authorId, "Sua pergunta foi respondida", "A organização respondeu à sua pergunta. Confira a comunidade do evento.");
}
export async function notifyTaskHelp(tx: Prisma.TransactionClient, eventId: string, ownerId: string | null, previous: string, status: string, title: string): Promise<void> {
  if (status === "HELP" && previous !== "HELP") await notifyCommunityUser(tx, eventId, ownerId, "A equipe precisa de ajuda", `Ajuda solicitada na tarefa: ${title}`);
}
