import { z } from "zod";
const optionalUrl = z.string().max(2048).refine(value => {
  if (!value) return true;
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}, "Use um link http ou https válido.");
const date = z.string().refine(value => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, "Data inválida.");
export const eventInputSchema = z.object({
  nome: z.string().trim().max(160), descricao: z.string().trim().max(10000),
  endereco: z.string().trim().max(500), linkParaCompra: optionalUrl,
  dataInicio: date, dataFim: date, category: z.string().trim().min(1).max(80),
  priceCents: z.number().int().min(0).max(100000000), isFree: z.boolean(),
  capacity: z.number().int().min(1).max(1000000).nullable(),
  lat: z.number().min(-90).max(90).nullable(), lng: z.number().min(-180).max(180).nullable(),
  startTime: z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/),
}).superRefine((data, ctx) => {
  if (data.dataInicio && data.dataFim && data.dataFim < data.dataInicio)
    ctx.addIssue({ code: "custom", path: ["dataFim"], message: "O término deve ser posterior ao início." });
  if (data.dataInicio && data.dataInicio === data.dataFim && data.startTime && data.endTime && data.endTime <= data.startTime)
    ctx.addIssue({ code: "custom", path: ["endTime"], message: "O horário de término deve ser posterior ao início no mesmo dia." });
  if ((data.lat === null) !== (data.lng === null))
    ctx.addIssue({ code: "custom", path: ["lat"], message: "Informe ambas as coordenadas." });
});
export function parseEventInput(form: FormData, submit: boolean) {
  const text = (key: string) => String(form.get(key) ?? "");
  const coordinate = (key: string) => text(key) ? Number(text(key)) : null;
  const result = eventInputSchema.safeParse({
    nome: text("nome"), descricao: text("descricao"), endereco: text("endereco"),
    linkParaCompra: text("LinkParaCompraIngresso") || text("linkParaCompra"),
    dataInicio: text("dataInicio"), dataFim: text("dataFim"), category: text("category") || "Outros",
    priceCents: Number(text("priceCents") || 0), isFree: text("isFree") !== "false",
    capacity: text("capacity") === "" ? null : Number(text("capacity")),
    lat: coordinate("lat"), lng: coordinate("lng"), startTime: text("startTime"), endTime: text("endTime"),
  });
  if (!result.success) return { success: false as const, message: result.error.issues[0].message };
  if (submit && (result.data.nome.length < 3 || result.data.descricao.length < 10 || result.data.endereco.length < 3 || !result.data.dataInicio || !result.data.dataFim))
    return { success: false as const, message: "Informe nome e endereço com pelo menos 3 caracteres, descrição com 10 caracteres e datas antes de enviar." };
  if (submit && !result.data.isFree && !result.data.linkParaCompra) return { success: false as const, message: "Informe um link de ingressos para o evento pago." };
  return { success: true as const, data: { ...result.data, priceCents: result.data.isFree ? 0 : result.data.priceCents } };
}
