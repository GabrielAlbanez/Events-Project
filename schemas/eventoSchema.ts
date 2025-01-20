import { z } from "zod";

// Esquema de validação com Zod
export const eventoSchema = z.object({
  nome: z.string().min(3, "O nome do evento deve ter pelo menos 3 caracteres"),
  descrição: z.string().min(10, "A descrição deve ter no mínimo 10 caracteres"),
  data: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "A data deve ser válida",
  }),
  endereco: z.string().min(3, "O endereço deve ter pelo menos 3 caracteres"),
  LinkParaCompraIngresso: z
    .string()
    .url("Insira uma URL válida para a compra de ingressos"),
  banner: z
    .any()
    .refine((file) => file instanceof File, {
      message: "O banner deve ser um arquivo de imagem válido",
    }),
  carrossel: z
    .array(
      z
        .any()
        .refine((file) => file instanceof File, {
          message: "Cada imagem do carrossel deve ser um arquivo válido",
        })
    )
    .optional(), // Carrossel com imagens opcionais
});
