"use server";

import prisma from "@/lib/prisma";

export async function getForEventsForUserById(idUser: string) {
  try {
    console.log("Verificando usuário com ID:", idUser);

    // Verifica se o usuário existe no banco de dados
    const userExisting = await prisma.user.findUnique({
      where: { id: idUser },
      select: { id: true },
    });

    if (!userExisting) {
      console.error("Usuário não encontrado:", idUser);
      return { status: "error", message: "Usuário não encontrado." };
    }

    // Busca os eventos relacionados ao usuário
    const userEvents = await prisma.events.findMany({
      where: { userId: idUser },
      select: {
        id: true,
        nome: true,
        banner: true,
        carrossel: true,
        descricao: true,
        data: true,
        endereco: true,
        linkParaCompra: true,
        validate: true,
        validatedAt: true,
        userId: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true
          }
        },
        validator: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true
          }
        }
      }
    });

    if (userEvents.length === 0) {
      console.log("Nenhum evento encontrado para o usuário:", idUser);
      return { status: "error", message: "Nenhum evento encontrado." };
    }

    console.log("Eventos encontrados:", userEvents);
    return {
      status: "success",
      message: "Eventos encontrados com sucesso.",
      events: userEvents,
    };
  } catch (error) {
    console.error("Erro ao buscar eventos:", error);
    return { status: "error", message: "Erro interno ao buscar eventos." };
  }
}
