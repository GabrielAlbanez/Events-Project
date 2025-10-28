import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import fs from "fs";
import path from "path";
import prisma from "@/lib/prisma";

// Configuração do diretório de uploads
const uploadDir = path.join(process.cwd(), "public/uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

export async function POST(request: Request) {
  try {
    // Require authenticated user
    const token = await getToken({ req: request as any });
    if (!token?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    // Verificar headers de multipart/form-data
    const contentType = request.headers.get("content-type");
    if (!contentType || !contentType.startsWith("multipart/form-data")) {
      return NextResponse.json(
        { error: "Content-Type inválido. Use multipart/form-data." },
        { status: 400 }
      );
    }

    // Ler o corpo da requisição como um Blob
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const userId = formData.get("userId");

    // Validações
    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: "O ID do usuário é obrigatório." }, { status: 400 });
    }

    // Validate file size (e.g., max 5MB) and type
    const maxSizeBytes = 5 * 1024 * 1024;
    // Basic type allowlist
    const allowedTypes = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/avif",
    ]);
    if ((file as any).size && (file as any).size > maxSizeBytes) {
      return NextResponse.json({ error: "Arquivo muito grande." }, { status: 413 });
    }
    if (file.type && !allowedTypes.has(file.type)) {
      return NextResponse.json({ error: "Tipo de arquivo não permitido." }, { status: 415 });
    }

    // Create a safe filename without path traversal
    const originalName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, "_");
    // Salvar o arquivo no servidor
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const filePath = path.join(uploadDir, `${Date.now()}-${originalName}`);
    fs.writeFileSync(filePath, fileBuffer);

    console.log("Arquivo salvo:", filePath);

    // Atualizar o banco de dados com o caminho do arquivo
    const relativeFilePath = `/uploads/${path.basename(filePath)}`;
    await prisma.user.update({
      where: { id: userId as string },
      data: { image: relativeFilePath },
    });

    try {
      // Obtém todas as imagens atualmente usadas por usuários
      const usedUserImages = await prisma.user.findMany({
        select: { image: true },
      });

      // Obtém todas as imagens atualmente usadas em eventos
      const usedEventImages = await prisma.events.findMany({
        select: { banner: true, carrossel: true },
      });

      // Criar um conjunto de imagens que estão sendo utilizadas
      const usedImagePaths = new Set(
        [
          ...usedUserImages
            .filter((user) => user.image) // Filtra imagens não nulas
            .map((user) => path.join(process.cwd(), "public", user.image!)), // Converte para paths completos
          ...usedEventImages
            .map((event) => path.join(process.cwd(), "public", event.banner)), // Inclui banners de eventos
          ...usedEventImages.flatMap((event) =>
            event.carrossel.map((img) => path.join(process.cwd(), "public", img))
          ), // Inclui imagens do carrossel
        ]
      );

      // Obtém todos os arquivos do diretório de uploads
      const uploadedFiles = fs.readdirSync(uploadDir);

      // Exclui arquivos que não estão sendo usados em usuários nem em eventos
      uploadedFiles.forEach((file) => {
        const filePath = path.join(uploadDir, file);
        if (!usedImagePaths.has(filePath)) {
          fs.unlinkSync(filePath); // Exclui o arquivo
          console.log(`Imagem órfã excluída: ${filePath}`);
        }
      });
    } catch (error) {
      console.error("Erro ao excluir imagens órfãs:", error);
    }

    return NextResponse.json({ filePath: relativeFilePath }, { status: 200 });
  } catch (error) {
    console.error("Erro ao processar o upload:", error);
    return NextResponse.json({ error: "Erro interno no servidor." }, { status: 500 });
  }
}
