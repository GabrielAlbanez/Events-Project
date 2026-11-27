import type { Evento } from "@/types";
import type { EventStatus } from "@/types/features";
import { parseEventDate } from "./discoveryPeriod";

/** Pure queue rules for the admin review workspace. No React, no I/O. */
export type QueueTab = "pending" | "published" | "changes" | "cancelled" | "ended" | "all";
/**
 * GET /api/admin/events returns rows by `updatedAt` desc without exposing the timestamp,
 * so "oldest" is the reverse of the server order (longest without an update), not a measured wait.
 */
export type QueueSort = "oldest" | "recent" | "eventDate" | "name";
export type QueueFilter = { tab: QueueTab; importedOnly: boolean; query: string };
export type ReviewProblem = { id: string; label: string };

export const queueTabs: ReadonlyArray<{ id: QueueTab; label: string; status?: EventStatus }> = [
  { id: "pending", label: "Pendentes", status: "PENDING" },
  { id: "published", label: "Publicados", status: "PUBLISHED" },
  { id: "changes", label: "Correção solicitada", status: "CHANGES_REQUESTED" },
  { id: "cancelled", label: "Cancelados", status: "CANCELLED" },
  { id: "ended", label: "Encerrados", status: "ENDED" },
  { id: "all", label: "Todos" },
];

export const queueSortLabels: Record<QueueSort, string> = {
  oldest: "Atualizados há mais tempo",
  recent: "Atualizados recentemente",
  eventDate: "Data do evento",
  name: "Nome (A-Z)",
};

export function effectiveStatus(event: Pick<Evento, "status" | "validate">): EventStatus {
  return event.status ?? (event.validate ? "PUBLISHED" : "PENDING");
}

export function isPending(event: Pick<Evento, "status" | "validate">) {
  return effectiveStatus(event) === "PENDING";
}

export function matchesTab(event: Pick<Evento, "status" | "validate">, tab: QueueTab) {
  const definition = queueTabs.find(item => item.id === tab);
  return !definition?.status || effectiveStatus(event) === definition.status;
}

export function countByTab(events: Evento[], importedOnly = false): Record<QueueTab, number> {
  const counts: Record<QueueTab, number> = { pending: 0, published: 0, changes: 0, cancelled: 0, ended: 0, all: 0 };
  for (const event of events) {
    if (importedOnly && !event.aiImport) continue;
    counts.all++;
    const tab = queueTabs.find(item => item.status === effectiveStatus(event));
    if (tab) counts[tab.id]++;
  }
  return counts;
}

export function defaultTab(events: Evento[]): QueueTab {
  return events.some(isPending) ? "pending" : "all";
}

export function defaultSort(tab: QueueTab): QueueSort {
  return tab === "pending" ? "oldest" : "recent";
}

const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");

export function matchesQuery(event: Evento, query: string) {
  const term = normalize(query.trim());
  if (!term) return true;
  return [event.nome, event.descricao, event.organizerName, event.user?.name, event.endereco, event.category, event.dataInicio, event.dataFim]
    .some(value => typeof value === "string" && normalize(value).includes(term));
}

export function filterQueue(events: Evento[], { tab, importedOnly, query }: QueueFilter) {
  return events.filter(event => matchesTab(event, tab) && (!importedOnly || Boolean(event.aiImport)) && matchesQuery(event, query));
}

/** Expects `events` in server order; never mutates it. */
export function sortQueue(events: Evento[], sort: QueueSort) {
  const rows = events.map((event, index) => ({ event, index }));
  const time = (event: Evento) => parseEventDate(event.dataInicio ?? "")?.getTime() ?? Number.POSITIVE_INFINITY;
  rows.sort((a, b) => {
    if (sort === "oldest") return b.index - a.index;
    if (sort === "eventDate") {
      const difference = time(a.event) - time(b.event);
      if (difference) return difference;
    }
    if (sort === "name") {
      const difference = (a.event.nome ?? "").localeCompare(b.event.nome ?? "", "pt-BR", { sensitivity: "base" });
      if (difference) return difference;
    }
    return a.index - b.index;
  });
  return rows.map(row => row.event);
}

/** Next pending event after `currentId`, wrapping around; null when no other event is pending. */
export function nextPendingId(ordered: Evento[], currentId: string, excluded: ReadonlySet<string> = new Set()) {
  const start = ordered.findIndex(event => event.id === currentId);
  for (let step = 1; step <= ordered.length; step++) {
    const candidate = ordered[(Math.max(start, 0) + step) % ordered.length];
    if (candidate.id !== currentId && !excluded.has(candidate.id) && isPending(candidate)) return candidate.id;
  }
  return null;
}

const blank = (value: string | null | undefined) => !value || !value.trim();

/** Data gaps visible in the loaded event. They inform the reviewer and never block a decision. */
export function reviewProblems(event: Evento, now: Date = new Date()): ReviewProblem[] {
  const problems: ReviewProblem[] = [];
  if (blank(event.banner)) problems.push({ id: "banner", label: "Sem imagem de capa" });
  if (blank(event.descricao) || event.descricao.trim().length < 20) problems.push({ id: "description", label: "Descrição ausente ou muito curta" });
  if (blank(event.endereco)) problems.push({ id: "address", label: "Sem endereço" });
  if (event.lat == null || event.lng == null) problems.push({ id: "coordinates", label: "Sem posição no mapa" });
  const start = blank(event.dataInicio) ? null : parseEventDate(event.dataInicio);
  const end = blank(event.dataFim) ? null : parseEventDate(event.dataFim);
  if (!start) problems.push({ id: "date", label: "Data de início ausente ou inválida" });
  if (start && end && end.getTime() < start.getTime()) problems.push({ id: "date-order", label: "Término antes do início" });
  if (isPending(event) && (end ?? start)) {
    const last = new Date((end ?? start) as Date);
    last.setHours(23, 59, 59, 999);
    if (last.getTime() < now.getTime()) problems.push({ id: "past", label: "A data do evento já passou" });
  }
  if (event.isFree === false && !event.priceCents) problems.push({ id: "price", label: "Evento pago sem preço" });
  return problems;
}

export function queueSummary(events: Evento[], now: Date = new Date()) {
  const pending = events.filter(isPending);
  return {
    pending: pending.length,
    imported: pending.filter(event => event.aiImport).length,
    withProblems: pending.filter(event => reviewProblems(event, now).length > 0).length,
  };
}

/** Overview chips from loaded data and confirmed decisions; a zero never renders. */
export function overviewStats(summary: { imported: number; withProblems: number }, decided: number) {
  return [
    { id: "imported", value: summary.imported, label: summary.imported === 1 ? "importado" : "importados" },
    { id: "problems", value: summary.withProblems, label: "com dados a conferir" },
    { id: "decided", value: decided, label: decided === 1 ? "decidido nesta sessão" : "decididos nesta sessão" },
  ].filter(stat => stat.value > 0);
}

/** Share of this session's queue already decided, from 0 to 1. */
export function queueProgress(decided: number, pending: number) {
  const total = Math.max(decided, 0) + Math.max(pending, 0);
  return total ? Math.max(decided, 0) / total : 0;
}

const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

export function formatSchedule(event: Pick<Evento, "dataInicio" | "dataFim" | "startTime">) {
  const start = event.dataInicio ? parseEventDate(event.dataInicio) : null;
  if (!start) return "Data não informada";
  const end = event.dataFim ? parseEventDate(event.dataFim) : null;
  const first = dayFormat.format(start).replace(/\s+de\s+/g, " ").replace(".", "");
  const range = end && end.toDateString() !== start.toDateString() ? ` – ${dayFormat.format(end).replace(/\s+de\s+/g, " ").replace(".", "")}` : "";
  return `${first}${range}${event.startTime ? ` · ${event.startTime}` : ""}`;
}

export function formatPrice(event: Pick<Evento, "isFree" | "priceCents">) {
  if (event.isFree) return "Gratuito";
  if (event.priceCents && event.priceCents > 0) return (event.priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return "Preço não informado";
}

export function organizerOf(event: Pick<Evento, "organizerName" | "user">) {
  return event.organizerName?.trim() || event.user?.name?.trim() || "Organizador não informado";
}

/** Only http(s) or same-origin paths may become links; anything else returns null. */
export function safeHref(value: string | null | undefined) {
  const url = value?.trim();
  if (!url) return null;
  if (url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\")) return url;
  try {
    const protocol = new URL(url).protocol;
    return protocol === "https:" || protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}
