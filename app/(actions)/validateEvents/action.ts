"use server";

import prisma from "@/lib/prisma";
import { notifyEventAudience } from "@/lib/eventNotifications";
import { getAuthenticatedAdminId } from "@/lib/adminAuth";

export async function validateEvents(eventIds: string[], adminId: string) {
  // Verifique se o usuário é um ADMIN
  const authenticatedAdminId = await getAuthenticatedAdminId();
  if (!authenticatedAdminId || authenticatedAdminId !== adminId) {
    return {
      status: "error",
      message: "Você não tem permissão para validar eventos.",
    };
  }

  const validatedEventIds = await prisma.$transaction(async (transaction) => {
    const admin = await transaction.user.findUnique({
      where: { id: adminId },
      select: { name: true },
    });
    const events = await transaction.events.findMany({
      where: { id: { in: Array.from(new Set(eventIds)) } },
      select: { id: true, nome: true, userId: true },
    });
    const changedIds: string[] = [];
    const validatedAt = new Date();

    for (const event of events) {
      const changed = await transaction.events.updateMany({
        where: {
          id: event.id,
          status: "PENDING",
        },
        data: {
          validate: true,
          status: "PUBLISHED",
          reviewNote: null,
          validatedBy: adminId,
          validatedAt,
        },
      });
      if (changed.count === 0) continue;

      await transaction.eventHistory.create({
        data: {
          eventId: event.id,
          eventName: event.nome,
          promoterId: event.userId,
          actorId: adminId,
          actorName: admin?.name,
          action: "VALIDATED",
          createdAt: validatedAt,
        },
      });
      await notifyEventAudience(transaction, { ...event, status: "PUBLISHED" }, { title: "Evento publicado", message: event.nome + " foi aprovado e está disponível no EventMap.", includeFollowers: true });
      changedIds.push(event.id);
    }
    return changedIds;
  });

  return {
    status: "success",
    message: `${validatedEventIds.length} evento(s) validado(s) com sucesso.`,
    validatedEventIds,
  };
}
