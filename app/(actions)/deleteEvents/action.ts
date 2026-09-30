"use server";

import prisma from "@/lib/prisma";
import { getAuthenticatedAdminId } from "@/lib/adminAuth";
import fs from "fs";
import path from "path";

// Diretório onde as imagens estão armazenadas
const uploadDir = path.join(process.cwd(), "public/uploads");

export async function deleteEvents(eventIds: string[], adminId: string) {
  // Verifique se o usuário é um ADMIN
  const authenticatedAdminId = await getAuthenticatedAdminId();
  if (!authenticatedAdminId || authenticatedAdminId !== adminId) {
    return {
      status: "error",
      message: "Você não tem permissão para excluir eventos.",
    };
  }

  const { deletedCount, eventsToDelete } = await prisma.$transaction(async (transaction) => {
    const events = await transaction.events.findMany({
      where: { id: { in: Array.from(new Set(eventIds)) } },
      select: { id: true, nome: true, userId: true, banner: true, carrossel: true },
    });
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
    const deleted = await transaction.events.deleteMany({
      where: { id: { in: events.map((event) => event.id) } },
    });
    return { deletedCount: deleted.count, eventsToDelete: events };
  });

  // Clean files only after the database transaction commits.
  for (const event of eventsToDelete) {
    for (const file of [event.banner, ...event.carrossel]) {
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
