"use server";

import prisma from "@/lib/prisma";
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

// Função para salvar um evento
export async function salvarEvento(formData: FormData, userId: string) {
  try {
    // Extraindo campos do FormData
    const nome = formData.get("nome")?.toString() || "";
    const descricao = formData.get("descricao")?.toString() || "";
    const linkParaCompra = formData.get("LinkParaCompraIngresso")?.toString() || "";
    const endereco = formData.get("endereco")?.toString() || "";
    const bannerFile = formData.get("banner") as File;
    const carouselFiles = formData.getAll("carrossel") as File[];
    

     if(!nome || !descricao || !linkParaCompra || !endereco || !bannerFile || !carouselFiles) {
      return { success: false, message: "Preencha todos os campos." };
     }

    // Validações manuais
    if (!nome || nome.length < 3) {
      return { success: false, message: "O nome deve ter pelo menos 3 caracteres." };
    }
    if (!descricao || descricao.length < 10) {
      return { success: false, message: "A descrição deve ter pelo menos 10 caracteres." };
    }
    if (!linkParaCompra || !linkParaCompra.startsWith("http")) {
      return { success: false, message: "O link para compra deve ser uma URL válida." };
    }
    if (!endereco || endereco.length < 5) {
      return { success: false, message: "O endereço deve ter pelo menos 5 caracteres." };
    }

    // Arquivo do banner
    const bannerPath = bannerFile ? await saveFile(bannerFile) : null;

    // Arquivos do carrossel
    const carouselPaths = await Promise.all(
      carouselFiles.map((file) => saveFile(file))
    );

    // Data do evento
    const eventDate = new Date();

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

    // Salvamento do evento no banco
    const novoEvento = await prisma.events.create({
      data: {
        nome,
        descricao,
        data: eventDate,
        linkParaCompra,
        banner: bannerPath || "",
        carrossel: carouselPaths,
        endereco,
        userId,
      },
    });

    console.log("Evento criado:", novoEvento);

    // Limpeza de arquivos órfãos (banners, carrossel e imagens de usuários)
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

      // Adiciona os banners usados
      usedBanners.forEach((event) => {
        if (event.banner) {
          usedPaths.add(path.join(uploadDir, path.basename(event.banner)));
        }
      });

      // Adiciona os arquivos de carrossel usados
      usedCarousels.forEach((event) => {
        if (event.carrossel) {
          event.carrossel.forEach((carouselPath) => {
            usedPaths.add(path.join(uploadDir, path.basename(carouselPath)));
          });
        }
      });

      // Adiciona as imagens usadas por usuários
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
