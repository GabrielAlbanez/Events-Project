import { eventInstant } from "@/lib/eventTime";

/** Períodos aceitos pelo painel de resultados. "all" usa os contadores totais do evento. */
export const INSIGHTS_PERIODS = ["7", "30", "90", "all"] as const;
export type InsightsPeriod = (typeof INSIGHTS_PERIODS)[number];
export const DEFAULT_INSIGHTS_PERIOD: InsightsPeriod = "30";
export const insightsPeriodLabels: Record<InsightsPeriod, string> = { "7": "7 dias", "30": "30 dias", "90": "90 dias", all: "Todo o período" };

/** Mínimo de avaliações antes de exibir a média em páginas públicas (evita expor notas individuais). */
export const PUBLIC_RATING_MIN_COUNT = 5;

export function parseInsightsPeriod(value: unknown): InsightsPeriod {
  return typeof value === "string" && (INSIGHTS_PERIODS as readonly string[]).includes(value) ? value as InsightsPeriod : DEFAULT_INSIGHTS_PERIOD;
}

/** Início do período (UTC, início do dia) ou null para "todo o período". O dia atual conta como 1 dos N dias. */
export function insightsPeriodStart(period: InsightsPeriod, now = new Date()): Date | null {
  if (period === "all") return null;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (Number(period) - 1));
  return start;
}

/** Chave YYYY-MM-DD compatível com EventMetric.day (gravado em UTC pela rota de engajamento). */
export function metricDayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Lista de dias do período, do mais antigo ao mais recente. Limitada a 90 dias. */
export function periodDays(period: InsightsPeriod, now = new Date()): string[] {
  const size = period === "all" ? 30 : Number(period);
  const start = insightsPeriodStart(period === "all" ? "30" : period, now) as Date;
  return Array.from({ length: size }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    return metricDayKey(day);
  });
}

/**
 * Taxa entre duas etapas. Retorna null quando não há base ou quando o numerador
 * é maior que a base — isso acontece porque visualizações e cliques só contam
 * quem aceitou métricas, enquanto inscrições são completas. Nesses casos a taxa
 * não é comparável e não deve ser estimada.
 */
export function stepRate(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0 || numerator < 0) return null;
  if (numerator > denominator) return null;
  return numerator / denominator;
}

export function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: rate > 0 && rate < 0.1 ? 1 : 0 }).format(rate);
}

export interface FunnelCounts {
  views: number;
  ticketClicks: number;
  favorites: number;
  registrations: number;
  checkIns: number;
}

export type FunnelStageKey = keyof FunnelCounts;
export interface FunnelStage {
  key: FunnelStageKey;
  label: string;
  value: number;
  /** Taxa em relação à etapa anterior (null na primeira etapa ou quando não comparável). */
  rate: number | null;
  /** Se a contagem depende de consentimento de métricas. */
  consentBased: boolean;
}

const stageMeta: Array<{ key: FunnelStageKey; label: string; consentBased: boolean }> = [
  { key: "views", label: "Visualizações", consentBased: true },
  { key: "ticketClicks", label: "Cliques no ingresso", consentBased: true },
  { key: "favorites", label: "Favoritos", consentBased: false },
  { key: "registrations", label: "Inscrições", consentBased: false },
  { key: "checkIns", label: "Check-ins", consentBased: false },
];

export function buildFunnel(counts: FunnelCounts): FunnelStage[] {
  return stageMeta.map((meta, index) => ({
    ...meta,
    value: counts[meta.key],
    rate: index === 0 ? null : stepRate(counts[meta.key], counts[stageMeta[index - 1].key]),
  }));
}

export interface RegistrationBreakdown {
  confirmed: number;
  waitlisted: number;
  cancelled: number;
  checkedIn: number;
}

export function emptyRegistrations(): RegistrationBreakdown {
  return { confirmed: 0, waitlisted: 0, cancelled: 0, checkedIn: 0 };
}

export function addRegistrationCount(target: RegistrationBreakdown, status: string, count: number): void {
  if (status === "CONFIRMED") target.confirmed += count;
  else if (status === "WAITLISTED") target.waitlisted += count;
  else if (status === "CANCELLED") target.cancelled += count;
  else if (status === "CHECKED_IN") target.checkedIn += count;
}

/** Inscrições ativas = confirmadas ainda não lidas + as que já fizeram check-in. */
export function activeRegistrations(value: RegistrationBreakdown): number {
  return value.confirmed + value.checkedIn;
}

/** Comparecimento: check-ins sobre inscrições ativas. Ambas as bases são completas. */
export function attendanceRate(value: RegistrationBreakdown): number | null {
  return stepRate(value.checkedIn, activeRegistrations(value));
}

export function occupancyRate(value: RegistrationBreakdown, capacity: number | null | undefined): number | null {
  if (!capacity || capacity <= 0) return null;
  return Math.min(1, activeRegistrations(value) / capacity);
}

export interface RankableEvent {
  id: string;
  registrations: number;
  checkIns: number;
  views: number;
  favorites: number;
}

/** Ranking por inscrições, depois check-ins, favoritos e visualizações. Estável por id. */
export function rankEvents<T extends RankableEvent>(events: T[], limit = 5): T[] {
  return [...events]
    .filter(event => event.registrations + event.checkIns + event.views + event.favorites > 0)
    .sort((a, b) => b.registrations - a.registrations || b.checkIns - a.checkIns || b.favorites - a.favorites || b.views - a.views || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export interface TimedEvent {
  dataInicio: string;
  dataFim: string;
  startTime: string | null;
  endTime: string | null;
  timezone: string | null;
  status: string;
}

export function eventEnd(event: TimedEvent): Date | null {
  return eventInstant(event.dataFim, event.endTime, event.timezone ?? undefined, "23:59");
}

export function eventStart(event: TimedEvent): Date | null {
  return eventInstant(event.dataInicio, event.startTime, event.timezone ?? undefined);
}

/** Próximo = publicado e ainda não terminou. */
export function isUpcomingEvent(event: TimedEvent, now = new Date()): boolean {
  if (event.status !== "PUBLISHED") return false;
  const end = eventEnd(event);
  return Boolean(end && end.getTime() >= now.getTime());
}

/** Separa próximos (ordem crescente) e realizados (ordem decrescente). Eventos com datas inválidas são ignorados. */
export function splitPromoterEvents<T extends TimedEvent>(events: T[], now = new Date()): { upcoming: T[]; past: T[] } {
  const timed = events.map(event => ({ event, start: eventStart(event), end: eventEnd(event) })).filter(item => item.start && item.end);
  const upcoming = timed.filter(item => isUpcomingEvent(item.event, now)).sort((a, b) => (a.start as Date).getTime() - (b.start as Date).getTime()).map(item => item.event);
  const past = timed.filter(item => !isUpcomingEvent(item.event, now) && (item.event.status === "ENDED" || (item.event.status === "PUBLISHED" && (item.end as Date).getTime() < now.getTime())))
    .sort((a, b) => (b.start as Date).getTime() - (a.start as Date).getTime()).map(item => item.event);
  return { upcoming, past };
}

/** Código de incorporação seguro: só aceita origem http(s) e ids sem caracteres especiais de HTML. */
export function buildEmbedSnippet(origin: string, promoterId: string): string {
  const base = new URL(origin);
  if (!["http:", "https:"].includes(base.protocol)) throw new Error("INVALID_ORIGIN");
  const src = new URL("/embed/promotores/" + encodeURIComponent(promoterId), base.origin).toString();
  return `<iframe src="${src.replace(/"/g, "&quot;")}" title="Agenda de eventos no EventMap" width="100%" height="520" style="border:0;border-radius:16px;max-width:640px" loading="lazy"></iframe>`;
}

export function promoterCalendarUrl(origin: string, promoterId: string): string {
  return new URL("/api/promotores/" + encodeURIComponent(promoterId) + "/calendar.ics", new URL(origin).origin).toString();
}
