import { z } from "zod";

export const registerAccountInputSchema = z.object({
  name: z.string().trim().min(2, "O nome deve ter pelo menos 2 caracteres").max(50, "O nome pode ter no máximo 50 caracteres"),
  // Stored in lowercase; login looks up accounts case-insensitively for legacy rows.
  email: z.string().trim().toLowerCase().max(254, "O email pode ter no máximo 254 caracteres").email("Por favor, insira um email válido"),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres").max(50, "A senha pode ter no máximo 50 caracteres").refine(
    (password) => Buffer.byteLength(password, "utf8") <= 72,
    "A senha excede o tamanho permitido",
  ),
});
