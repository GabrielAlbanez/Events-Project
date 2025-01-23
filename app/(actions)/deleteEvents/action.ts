"use server";

import prisma from "@/lib/prisma";

export async function deleteEvents(eventIds: string[], adminId: string) {
  // Verifique se o usuário é um ADMIN
  const admin = await prisma.user.findUnique({
    where: { id: adminId },
  });

  if (!admin || admin.role !== "ADMIN") {
    return {
      status: "error",
      message: "Você não tem permissão para excluir eventos.",
    };
  }

  // Exclua todos os eventos
  const deletedEvents = await prisma.events.deleteMany({
    where: {
      id: { in: eventIds },
    },
  });

  return {
    status: "success",
    message: `${deletedEvents.count} evento(s) excluído(s) com sucesso.`,
  };
}
