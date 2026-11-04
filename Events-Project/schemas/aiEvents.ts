import { z } from "zod";

export const aiEventActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("settings"), city: z.string().trim().min(2).max(100), maxPerRun: z.number().int().min(1).max(5), enabled: z.boolean(), authorize: z.boolean() }).strict(),
  z.object({ action: z.literal("run") }).strict(),
  z.object({ action: z.literal("inspect"), url: z.string().url().max(2048) }).strict(),
  z.object({ action: z.literal("approve"), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("reject"), id: z.string().uuid() }).strict(),
]);
export type AiEventAction = z.infer<typeof aiEventActionSchema>;
