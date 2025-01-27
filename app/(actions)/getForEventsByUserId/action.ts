"use server";

import prisma from "@/lib/prisma";

export async function getForEventsForUserById({ idUser }: { idUser: string }) {
  // Verifica se o usuário existe no banco de dados
  const userExisting = await prisma.user.findUnique({
    where: { id: idUser },
    select: {
      id: true, // Apenas verifica se o ID existe
    },
  });

  if (!userExisting) {
    return {
      status: "error",
      message: "usuario nao encontrado",
    };
  }

  // Busca os eventos relacionados ao usuário
  const userEvents = await prisma.events.findMany({
    where: { userId: idUser }, // Substitua `userId` pelo campo correto que liga eventos ao usuário
  });

  if (userEvents.length === 0) {
    return {
      status: "error",
      message: "evento nao encontrado",
    };
  }

  return {
    status: "sucess",
    message: "Eventos encontrados com sucesso.",
    events: userEvents,
  };
}
