"use server";

import prisma from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import fs from "fs";
import path from "path";

// Diretório para armazenar os uploads
const uploadDir = path.join(process.cwd(), "public/uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Função para salvar arquivos e retornar o caminho relativo
async function saveFile(file: File): Promise<string> {
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const filePath = path.join(uploadDir, `${Date.now()}-${file.name}`);
  fs.writeFileSync(filePath, fileBuffer);
  return `/uploads/${path.basename(filePath)}`;
}

// Função para limpar arquivos órfãos
async function cleanOrphanedFiles(usedPaths: Set<string>, directory: string) {
  const uploadedFiles = fs.readdirSync(directory);
  uploadedFiles.forEach((file) => {
    const filePath = path.join(directory, file);
    if (!usedPaths.has(filePath)) {
      fs.unlinkSync(filePath); // Remove o arquivo órfão
      console.log(`Imagem órfã excluída: ${filePath}`);
    }
  });
}

// Função para salvar um evento com data de início e fim
export async function salvarEvento(formData: FormData, userId: string) {
  try {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser || authenticatedUser.id !== userId ||
      (authenticatedUser.role !== "ADMIN" && authenticatedUser.role !== "PROMOTER")) {
      return { success: false, message: "Permissão negada. Apenas administradores ou promotores podem criar eventos." };
    }
    // Extraindo campos do FormData
    const nome = formData.get("nome")?.toString() || "";
    const descricao = formData.get("descricao")?.toString() || "";
    const linkParaCompra = formData.get("LinkParaCompraIngresso")?.toString() || "";
    const endereco = formData.get("endereco")?.toString() || "";

    // 🔹 Agora recebemos dataInicio e dataFim do formulário
    const dataInicio = formData.get("dataInicio")?.toString();
    const dataFim = formData.get("dataFim")?.toString();

    const bannerFile = formData.get("banner") as File;
    const carouselFiles = formData.getAll("carrossel") as File[];

    if (!nome || !descricao || !linkParaCompra || !endereco || !dataInicio || !dataFim || !bannerFile || !carouselFiles) {
      return { success: false, message: "Preencha todos os campos." };
    }

    // 🔹 Validações das datas
    const eventStartDate = new Date(dataInicio);
    const eventEndDate = new Date(dataFim);

    if (eventStartDate > eventEndDate) {
      return { success: false, message: "A data de início não pode ser maior que a data de fim." };
    }

    // Arquivo do banner
    const bannerPath = await saveFile(bannerFile);

    // Arquivos do carrossel
    const carouselPaths = await Promise.all(
      carouselFiles.map((file) => saveFile(file))
    );

    // Verifica permissões do usuário
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return { success: false, message: "Usuário não encontrado." };
    }
    if (user.role !== "ADMIN" && user.role !== "PROMOTER") {
      return {
        success: false,
        message: "Permissão negada. Apenas administradores ou promotores podem criar eventos.",
      };
    }

    // 🔹 Salvamento do evento no banco com dataInicio e dataFim
    const novoEvento = await prisma.$transaction(async (transaction) => {
      const evento = await transaction.events.create({
        data: {
          nome,
          descricao,
          dataInicio,
          dataFim,
          linkParaCompra,
          banner: bannerPath,
          carrossel: carouselPaths,
          endereco,
          userId,
        },
      });
      await transaction.eventHistory.create({
        data: {
          eventId: evento.id,
          eventName: evento.nome,
          promoterId: userId,
          actorId: userId,
          actorName: user.name,
          action: "CREATED",
        },
      });
      return evento;
    });

    // Limpeza de arquivos órfãos
    try {
      const usedBanners = await prisma.events.findMany({
        select: { banner: true },
      });
      const usedCarousels = await prisma.events.findMany({
        select: { carrossel: true },
      });
      const usedUserImages = await prisma.user.findMany({
        select: { image: true },
      });

      const usedPaths = new Set<string>();

      usedBanners.forEach((event) => {
        if (event.banner) {
          usedPaths.add(path.join(uploadDir, path.basename(event.banner)));
        }
      });

      usedCarousels.forEach((event) => {
        if (event.carrossel) {
          event.carrossel.forEach((carouselPath) => {
            usedPaths.add(path.join(uploadDir, path.basename(carouselPath)));
          });
        }
      });

      usedUserImages.forEach((user) => {
        if (user.image) {
          usedPaths.add(path.join(uploadDir, path.basename(user.image)));
        }
      });

      // Remove arquivos órfãos
      cleanOrphanedFiles(usedPaths, uploadDir);
    } catch (error) {
      console.error("Erro ao excluir arquivos órfãos:", error);
    }

    return {
      success: true,
      message: "Evento criado com sucesso!",
      evento: novoEvento,
    };
  } catch (error) {
    console.error("Erro ao salvar o evento:", error);
    return { success: false, message: "Erro ao salvar o evento." };
  }
}
