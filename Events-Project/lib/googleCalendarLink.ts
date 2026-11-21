import { eventInstant } from "@/lib/eventTime";

export type GoogleCalendarInput = {
  nome: string;
  descricao: string;
  endereco: string;
  dataInicio: string;
  dataFim: string;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string | null;
  status?: string | null;
};

const DETAILS_LIMIT = 600;

function utcStamp(value: Date): string {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * "Adicionar ao Google Agenda" template link computed locally (no API, no credentials).
 * Times follow the .ics export: start defaults to 09:00 and end to 23:59 in the event timezone.
 * Returns null when the event is cancelled or its dates cannot produce a valid interval.
 */
export function googleCalendarLink(event: GoogleCalendarInput, eventPageUrl: string): string | null {
  if (event.status === "CANCELLED") return null;
  const timezone = event.timezone || undefined;
  const start = eventInstant(event.dataInicio, event.startTime, timezone);
  const end = eventInstant(event.dataFim, event.endTime, timezone, "23:59");
  if (!start || !end || end <= start) return null;
  const summary = event.descricao.trim().replace(/\s+/g, " ");
  const excerpt = summary.length > DETAILS_LIMIT ? `${summary.slice(0, DETAILS_LIMIT - 1).trimEnd()}…` : summary;
  const details = [excerpt, `Detalhes no EventMap: ${eventPageUrl}`].filter(Boolean).join("\n\n");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.nome,
    dates: `${utcStamp(start)}/${utcStamp(end)}`,
    details,
    location: event.endereco,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
