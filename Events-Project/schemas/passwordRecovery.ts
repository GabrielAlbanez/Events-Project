import { z } from "zod";

export const recoveryEmailSchema = z.object({ email: z.string().trim().email().max(254) }).strict();
export const resetPasswordSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password: z.string().min(6).max(50).refine(value => Buffer.byteLength(value, "utf8") <= 72),
}).strict();
