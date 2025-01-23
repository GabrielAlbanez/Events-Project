"use server";

import prisma from "@/lib/prisma";

export async function validateEvents(eventIds: string[], adminId: string) {
  // Verifique se o usuário é um ADMIN
  const admin = await prisma.user.findUnique({
    where: { id: adminId },
  });

  if (!admin || admin.role !== "ADMIN") {
    return {
      status: "error",
      message: "Você não tem permissão para validar eventos.",
    };
  }

  // Valide todos os eventos
  const validatedEvents = await prisma.events.updateMany({
    where: {
      id: { in: eventIds },
    },
    data: {
      validate: true, // Marca como validado
      validatedBy: adminId, // Associa o admin que validou
      validatedAt: new Date(), // Define a data de validação
    },
  });

  return {
    status: "success",
    message: `${validatedEvents.count} evento(s) validado(s) com sucesso.`,
  };
}
