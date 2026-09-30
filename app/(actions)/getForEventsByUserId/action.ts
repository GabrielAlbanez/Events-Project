"use server";

import { publicEventSelect } from "@/lib/eventQueries";
import prisma from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/adminAuth";

export async function getForEventsForUserById(idUser: string) {
  try {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser || (authenticatedUser.id !== idUser && authenticatedUser.role !== "ADMIN")) {
      return { status: "error", message: "Acesso negado." };
    }

    // Verifica se o usuário existe no banco de dados
    const userExisting = await prisma.user.findUnique({
      where: { id: idUser },
      select: { id: true },
    });

    if (!userExisting) {
      return { status: "error", message: "Usuário não encontrado." };
    }

    // Busca os eventos relacionados ao usuário
    const userEvents = await prisma.events.findMany({
      where: { userId: idUser },
      select: { ...publicEventSelect, reviewNote: true },
      orderBy: { updatedAt: "desc" },
    });


    return {
      status: "success",
      message: "Eventos encontrados com sucesso.",
      events: userEvents,
    };
  } catch {
    return { status: "error", message: "Erro interno ao buscar eventos." };
  }
}
