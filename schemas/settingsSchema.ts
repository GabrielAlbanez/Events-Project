import * as z from "zod";

export const SettingsSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("Email inválido"),
  password: z.string().optional(),
  Newpassword: z.string().optional(),
  emailVerified: z.boolean(),
});