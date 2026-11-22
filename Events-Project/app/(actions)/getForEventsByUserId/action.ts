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
      select: {
        ...publicEventSelect, reviewNote: true, validator: { select: { name: true } },
        ticketsEnabled: true, requiresApproval: true,
        _count: { select: { registrations: { where: { status: "PENDING" } } } },
      },
      orderBy: { updatedAt: "desc" },
    });
    // Pending approval requests per event (imported events never wait for approval).
    const events = userEvents.map(({ _count, ...event }) => ({ ...event, pendingRequests: event.aiImport ? 0 : _count.registrations }));


    return {
      status: "success",
      message: "Eventos encontrados com sucesso.",
      events,
    };
  } catch {
    return { status: "error", message: "Erro interno ao buscar eventos." };
  }
}
