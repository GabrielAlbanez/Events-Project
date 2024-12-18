import { z } from "zod";

export const loginFormSchema = z.object({
  email: z
    .string()
    .email("Por favor, insira um email válido")
    .min(1, "O campo de email é obrigatório"),
  password: z
    .string()
    .min(6, "A senha deve ter pelo menos 6 caracteres")
    .max(50, "A senha não pode ter mais de 50 caracteres"),
});
