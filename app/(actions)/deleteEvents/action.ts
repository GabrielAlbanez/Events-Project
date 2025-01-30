"use server";

import prisma from "@/lib/prisma";
import fs from "fs";
import path from "path";

// Diretório onde as imagens estão armazenadas
const uploadDir = path.join(process.cwd(), "public/uploads");

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

  // Buscar os eventos antes da exclusão para obter as imagens associadas
  const eventsToDelete = await prisma.events.findMany({
    where: { id: { in: eventIds } },
    select: { banner: true, carrossel: true }, // Pegamos os banners e imagens do carrossel
  });

  // Excluir arquivos do servidor (banner + imagens do carrossel)
  eventsToDelete.forEach((event) => {
    // Remover o banner
    if (event.banner) {
      const bannerPath = path.join(uploadDir, path.basename(event.banner));
      if (fs.existsSync(bannerPath)) {
        fs.unlinkSync(bannerPath);
      }
    }

    // Remover imagens do carrossel
    if (event.carrossel) {
      event.carrossel.forEach((carouselImg) => {
        const imagePath = path.join(uploadDir, path.basename(carouselImg));
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      });
    }
  });

  // Excluir os eventos do banco de dados
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
