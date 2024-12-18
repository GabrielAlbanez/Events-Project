import { z } from "zod";

export const registerFormSchema = z.object({
  name: z
    .string()
    .min(2, "O nome deve ter pelo menos 2 caracteres")
    .max(50, "O nome pode ter no máximo 50 caracteres"),
  email: z
    .string()
    .email("Por favor, insira um email válido")
    .min(1, "O campo de email é obrigatório"),
  password: z
    .string()
    .min(6, "A senha deve ter pelo menos 6 caracteres")
    .max(50, "A senha pode ter no máximo 50 caracteres"),
  confirmPassword: z
    .string()
    .min(6, "A confirmação de senha é obrigatória"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});
