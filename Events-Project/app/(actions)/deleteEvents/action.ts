"use server";

import { notifyEventAudience } from "@/lib/eventNotifications";
import prisma from "@/lib/prisma";
import { getAuthenticatedAdminId } from "@/lib/adminAuth";
import fs from "fs";
import { z } from "zod";
import path from "path";

// Diretório onde as imagens estão armazenadas
const uploadDir = path.join(process.cwd(), "public/uploads");
const eventIdsSchema = z.array(z.string().min(1).max(100)).min(1).max(500);

export async function deleteEvents(eventIds: string[], adminId: string) {
  // Verifique se o usuário é um ADMIN
  const authenticatedAdminId = await getAuthenticatedAdminId();
  if (!authenticatedAdminId || authenticatedAdminId !== adminId) {
    return {
      status: "error",
      message: "Você não tem permissão para excluir eventos.",
    };
  }

  const parsedIds = eventIdsSchema.safeParse(eventIds);
  if (!parsedIds.success) {
    return { status: "error", message: "Selecione de 1 a 500 eventos válidos." };
  }

  const ticketBlocked = {
    status: "error",
    message: "Há pedidos de ingresso registrados para o(s) evento(s) selecionado(s). O histórico financeiro precisa ser mantido: cancele o evento e estorne os ingressos pagos em vez de excluí-lo.",
  };
  const run = () => prisma.$transaction(async (transaction) => {
    const events = await transaction.events.findMany({
      where: { id: { in: Array.from(new Set(parsedIds.data)) } },
      select: { id: true, nome: true, userId: true, banner: true, carrossel: true, status: true },
    });
    // Ticket orders are financial records (ON DELETE RESTRICT): any order, in any status, blocks the delete.
    const ticketOrders = await transaction.ticketOrder.count({ where: { eventId: { in: events.map((event) => event.id) } } });
    if (ticketOrders > 0) return null;
    const admin = await transaction.user.findUnique({
      where: { id: adminId },
      select: { name: true },
    });
    const deletedAt = new Date();

    // No Events foreign key: the audit records remain after deletion.
    await transaction.eventHistory.createMany({
      data: events.map((event) => ({
        eventId: event.id,
        eventName: event.nome,
        promoterId: event.userId,
        actorId: adminId,
        actorName: admin?.name,
        action: "DELETED" as const,
        createdAt: deletedAt,
      })),
    });
    for (const event of events) {
      // Registrations are removed with the event (cascade): warn attendees first (BE-02).
      await notifyEventAudience(transaction, event, { title: "Evento removido", message: event.nome + " foi removido pela administração. Inscrições e lista de espera foram encerradas.", includeRegistrations: true });
      await transaction.notification.updateMany({ where: { href: "/eventos/" + event.id }, data: { href: "/EventsCreated" } });
    }
    // Antes da exclusão: com onDelete SetNull o candidato perderia o vínculo e voltaria a parecer uma proposta nova.
    // REJECTED impede que o mesmo link seja reimportado na próxima busca.
    await transaction.aiEventCandidate.updateMany({ where: { eventId: { in: events.map((event) => event.id) } }, data: { status: "REJECTED" } });
    const deleted = await transaction.events.deleteMany({
      where: { id: { in: events.map((event) => event.id) } },
    });
    return { deletedCount: deleted.count, eventsToDelete: events };
  }, { timeout: 20000 });

  let outcome: Awaited<ReturnType<typeof run>>;
  try {
    outcome = await run();
  } catch (error) {
    // An order created between the check and the delete trips the foreign key: same friendly answer.
    if ((error as { code?: unknown } | null)?.code === "P2003") return ticketBlocked;
    throw error;
  }
  if (!outcome) return ticketBlocked;
  const { deletedCount, eventsToDelete } = outcome;

  // Clean files only after the database transaction commits.
  for (const event of eventsToDelete) {
    for (const file of [event.banner, ...event.carrossel]) {
      if (!file.startsWith("/uploads/")) continue;
      const referenced = await prisma.events.count({ where: { OR: [{ banner: file }, { carrossel: { has: file } }] } });
      if (referenced) continue;
      const filePath = path.join(uploadDir, path.basename(file));
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {
        console.error("Failed to remove an event image after deletion.");
      }
    }
  }

  return {
    status: "success",
    message: `${deletedCount} evento(s) excluído(s) com sucesso.`,
  };
}
