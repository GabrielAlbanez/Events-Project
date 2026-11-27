import { z } from "zod";
import { eventCategories } from "@/types/features";

/** Shared by the client forms and the server actions so both enforce the same limits. */
export const organizerLimits = { brandName: 80, city: 80, link: 300, message: 500, contact: 160, claimMessage: 500 } as const;
export const organizerInterests = ["access", "plans"] as const;
export type OrganizerInterest = (typeof organizerInterests)[number];
export const organizerRequestWindowMs = 24 * 60 * 60 * 1000;
export const maxDailyEventClaims = 3;

const singleLine = (label: string, min: number, max: number) => z.string({ required_error: `Informe ${label}.`, invalid_type_error: `Informe ${label}.` })
  .transform(value => value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim())
  .pipe(z.string().min(min, `Informe ${label}.`).max(max, `Use até ${max} caracteres.`));
const multiLine = (max: number) => z.string().default("")
  .transform(value => value.replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, " ").replace(/\n{3,}/g, "\n\n").trim())
  .pipe(z.string().max(max, `Use até ${max} caracteres.`));

/** Accepts a full http(s) URL or an Instagram handle such as @produtora. Empty means "not informed". */
export function normalizeOrganizerLink(value: string): string | null {
  const text = value.trim();
  if (!text) return "";
  const handle = /^@?([A-Za-z0-9._]{1,30})$/.exec(text);
  if (handle && !/^https?:/i.test(text) && (text.startsWith("@") || !text.includes("."))) return `https://www.instagram.com/${handle[1]}`;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".") || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const linkField = z.string().default("").transform((value, context) => {
  const normalized = normalizeOrganizerLink(value);
  if (normalized === null || normalized.length > organizerLimits.link) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Use um link completo (https://...) ou um @ do Instagram." });
    return z.NEVER;
  }
  return normalized;
});

export const organizerRequestSchema = z.object({
  brandName: singleLine("o nome da produtora ou marca", 2, organizerLimits.brandName),
  city: singleLine("a cidade", 2, organizerLimits.city),
  eventType: z.enum(eventCategories, { errorMap: () => ({ message: "Escolha o tipo de evento." }) }),
  link: linkField,
  message: multiLine(organizerLimits.message),
  interest: z.enum(organizerInterests).default("access"),
});
/** Self-service activation: two quick fields for the admin notice plus explicit acceptance of the organizer rules. */
export const organizerActivationSchema = z.object({
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "Aceite as regras para organizadores para continuar." }) }),
  brandName: singleLine("o nome da produtora ou marca", 2, organizerLimits.brandName),
  city: singleLine("a cidade", 2, organizerLimits.city),
});
export type OrganizerActivationInput = z.input<typeof organizerActivationSchema>;
export type OrganizerRequestInput = z.input<typeof organizerRequestSchema>;
export type OrganizerRequest = z.output<typeof organizerRequestSchema>;

export const eventClaimSchema = z.object({
  eventId: z.string().uuid("Evento inválido."),
  contact: singleLine("um contato (e-mail, telefone ou @)", 3, organizerLimits.contact),
  message: multiLine(organizerLimits.claimMessage),
});
export type EventClaimInput = z.input<typeof eventClaimSchema>;

export const transferOwnershipSchema = z.object({
  eventId: z.string().trim().uuid("Informe o código (ID) do evento."),
  newOwnerEmail: z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(254, "E-mail muito longo."),
});
export type TransferOwnershipInput = z.input<typeof transferOwnershipSchema>;

/** Lets admins paste either the event id or the public event URL. */
export function extractEventId(value: string): string {
  const text = value.trim();
  const match = /\/eventos\/([0-9a-f-]{36})(?:[/?#]|$)/i.exec(text);
  return match ? match[1] : text;
}

export type OrganizerActionResult = { success: true; message: string } | { success: false; message: string; fieldErrors?: Record<string, string> };

export function firstFieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}
