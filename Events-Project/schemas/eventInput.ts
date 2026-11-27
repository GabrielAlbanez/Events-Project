import { z } from "zod";
const optionalUrl = z.string().max(2048).refine(value => {
  if (!value) return true;
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}, "Use um link http ou https válido.");
const optionalInformation = (limit: number) => z.string().trim().max(limit, `Use no máximo ${limit} caracteres nas informações práticas.`).nullish().transform(value => value || null);
const date = z.string().refine(value => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, "Data inválida.");
const eventTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Safari iOS may report "HH:mm:ss" (or with milliseconds): keep HH:mm and leave anything else for validation to reject. */
export function normalizeEventTime(value: string | null | undefined): string {
  const time = (value ?? "").trim();
  const withSeconds = /^(\d{2}:\d{2}):[0-5]\d(?:\.\d{1,3})?$/.exec(time);
  return withSeconds ? withSeconds[1] : time;
}
type EventTimeRange = { dataInicio?: string | null; dataFim?: string | null; startTime: string; endTime: string };
export const endTimeWithoutStartMessage = "Informe o horário de início para definir o término.";
export const endTimeBeforeStartMessage = "O horário de término deve ser posterior ao início no mesmo dia.";
/** Rule shared by the form and the server. Multi-day events may end at an earlier clock time. */
export function eventTimeError({ dataInicio, dataFim, startTime, endTime }: EventTimeRange, allowEndOnly = false): string | null {
  if (startTime && !eventTimePattern.test(startTime)) return "Horário de início inválido. Use o formato HH:mm.";
  if (endTime && !eventTimePattern.test(endTime)) return "Horário de término inválido. Use o formato HH:mm.";
  if (endTime && !startTime && !allowEndOnly) return endTimeWithoutStartMessage;
  if (dataInicio && dataInicio === dataFim && startTime && endTime && endTime <= startTime) return endTimeBeforeStartMessage;
  return null;
}
export const eventInputSchema = z.object({
  nome: z.string().trim().max(160), descricao: z.string().trim().max(10000),
  organizerName: z.string().trim().max(160).default(""),
  ageRating: optionalInformation(80), accessibilityInfo: optionalInformation(2000), participationInfo: optionalInformation(2000),
  endereco: z.string().trim().max(500), linkParaCompra: optionalUrl,
  dataInicio: date, dataFim: date, category: z.string().trim().min(1).max(80),
  priceCents: z.number().int().min(0).max(100000000), isFree: z.boolean(),
  capacity: z.number().int().min(1).max(1000000).nullable(),
  lat: z.number().min(-90).max(90).nullable(), lng: z.number().min(-180).max(180).nullable(),
  startTime: z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, "Horário de início inválido. Use o formato HH:mm."),
  endTime: z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, "Horário de término inválido. Use o formato HH:mm."),
}).superRefine((data, ctx) => {
  if (data.dataInicio && data.dataFim && data.dataFim < data.dataInicio)
    ctx.addIssue({ code: "custom", path: ["dataFim"], message: "O término deve ser posterior ao início." });
  const timeError = eventTimeError(data, true);
  if (timeError) ctx.addIssue({ code: "custom", path: ["endTime"], message: timeError });
  if ((data.lat === null) !== (data.lng === null))
    ctx.addIssue({ code: "custom", path: ["lat"], message: "Informe ambas as coordenadas." });
});
export function parseEventInput(form: FormData, submit: boolean) {
  const text = (key: string) => String(form.get(key) ?? "");
  const coordinate = (key: string) => text(key) ? Number(text(key)) : null;
  const result = eventInputSchema.safeParse({
    nome: text("nome"), descricao: text("descricao"), endereco: text("endereco"),
    organizerName: text("organizerName"),
    ageRating: text("ageRating"), accessibilityInfo: text("accessibilityInfo"), participationInfo: text("participationInfo"),
    linkParaCompra: text("LinkParaCompraIngresso") || text("linkParaCompra"),
    dataInicio: text("dataInicio"), dataFim: text("dataFim"), category: text("category") || "Outros",
    priceCents: Number(text("priceCents") || 0), isFree: text("isFree") !== "false",
    capacity: text("capacity") === "" ? null : Number(text("capacity")),
    lat: coordinate("lat"), lng: coordinate("lng"), startTime: normalizeEventTime(text("startTime")), endTime: normalizeEventTime(text("endTime")),
  });
  if (!result.success) return { success: false as const, message: result.error.issues[0].message };
  // Events stored before this rule may have only an end time: they stay editable while that value is kept.
  const endOnlyError = eventTimeError(result.data, Boolean(result.data.endTime) && text("keepStoredEndOnlyTime") === result.data.endTime);
  if (endOnlyError) return { success: false as const, message: endOnlyError };
  if (submit && (result.data.nome.length < 3 || result.data.descricao.length < 10 || result.data.endereco.length < 3 || !result.data.dataInicio || !result.data.dataFim))
    return { success: false as const, message: "Informe nome e endereço com pelo menos 3 caracteres, descrição com 10 caracteres e datas antes de enviar." };
  // Events sold through EventMap do not need an external ticket link (the settings are checked by the event service).
  if (submit && !result.data.isFree && !result.data.linkParaCompra && text("ticketsEnabled") !== "true") return { success: false as const, message: "Informe um link de ingressos para o evento pago." };
  return { success: true as const, data: { ...result.data, priceCents: result.data.isFree ? 0 : result.data.priceCents } };
}
const ticketSettingsSchema = z.object({
  ticketsEnabled: z.boolean(),
  ticketCapacity: z.number().int().min(1, "Informe uma lotação de ingressos inteira e positiva.").max(1000000, "A lotação de ingressos pode ter até 1 milhão.").nullable(),
});
/** EventMap ticket sales settings. Null when the form does not send them (older clients keep the stored values). */
export function parseTicketSettings(form: FormData) {
  if (!form.has("ticketsEnabled")) return null;
  const capacity = String(form.get("ticketCapacity") ?? "").trim();
  const result = ticketSettingsSchema.safeParse({ ticketsEnabled: form.get("ticketsEnabled") === "true", ticketCapacity: capacity === "" ? null : Number(capacity) });
  return result.success ? { success: true as const, data: result.data } : { success: false as const, message: result.error.issues[0].message };
}
