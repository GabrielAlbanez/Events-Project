"use server";

import prisma from "@/lib/prisma";

export default async function getAllEvents() {
  const events = await prisma.events.findMany({
    select: {
      id: true,
      nome: true,
      banner: true,
      carrossel: true,
      descricao: true,
      dataFim : true,
      dataInicio : true,
      linkParaCompra: true,
      endereco: true,
      user: true,
      validate: true,
      validatedBy: true,
      validator: true,
      validatedAt: true,
    },
  });

  return events;
}
