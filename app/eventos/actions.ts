"use server";

import { eventoSchema } from "@/schemas/eventoSchema";

// Função para salvar os dados do evento
export async function salvarEvento(formData: FormData) {
  try {
    // Extraindo os campos do FormData
    const nome = formData.get("nome");
    const descrição = formData.get("descrição");
    const data = formData.get("data");
    const LinkParaCompraIngresso = formData.get("LinkParaCompraIngresso");

    // Banner principal
    const banner = formData.get("banner"); // Campo único para o banner principal

    // Imagens do carrossel (campo múltiplo)
    const carrossel = formData.getAll("carrossel"); // Lista de imagens

    // Validação com Zod
    const parsedData = eventoSchema.parse({
      nome,
      descrição,
      data,
      LinkParaCompraIngresso,
      banner,
      carrossel,
    });

    // Simulação de salvamento no banco de dados
    console.log("Dados validados recebidos:", {
      nome: parsedData.nome,
      descrição: parsedData.descrição,
      data: parsedData.data,
      LinkParaCompraIngresso: parsedData.LinkParaCompraIngresso,
      banner: parsedData.banner,
      carrossel: parsedData.carrossel,
    });

    // Lógica de salvamento aqui (ex: envio para banco ou S3)

    return { success: true, message: "Evento salvo com sucesso" };
  } catch (error) {
    console.error("Erro ao salvar o evento:", error);

    // Retorna erro
    return { success: false, message: "Erro ao salvar o evento" };
  }
}
