import { eventInstant } from "@/lib/eventTime";
import type { Evento } from "@/types";
type CalendarEvent = Pick<Evento, "id" | "nome" | "descricao" | "endereco" | "dataInicio" | "dataFim" | "startTime" | "endTime" | "timezone" | "status">;
function escape(value: string) { return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); }
function utc(value: Date) { return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }
function fold(line: string) {
 const lines: string[] = []; let part = "", size = 0;
 for (const char of line) { const length = Buffer.byteLength(char); if (size + length > 74) { lines.push(part); part = " " + char; size = 1 + length; } else { part += char; size += length; } }
 lines.push(part); return lines.join("\r\n");
}
export type CalendarOptions = { name?: string; refreshHours?: number };
/** Mantém só eventos com datas válidas, para que um item inconsistente não derrube um feed inteiro. */
export function calendarSafeEvents<T extends CalendarEvent>(events: T[]): T[] {
 return events.filter(event => { const start = eventInstant(event.dataInicio, event.startTime, event.timezone ?? undefined), end = eventInstant(event.dataFim, event.endTime, event.timezone ?? undefined, "23:59"); return Boolean(start && end && end > start); });
}
export function createEventCalendar(events: CalendarEvent[], origin: string, now = new Date(), options: CalendarOptions = {}): string {
 const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//EventMap//Agenda//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
 if (options.name) lines.push("X-WR-CALNAME:" + escape(options.name.slice(0, 120)));
 if (options.refreshHours && options.refreshHours > 0) lines.push("REFRESH-INTERVAL;VALUE=DURATION:PT" + Math.trunc(options.refreshHours) + "H", "X-PUBLISHED-TTL:PT" + Math.trunc(options.refreshHours) + "H");
 for (const event of events) {
  const start = eventInstant(event.dataInicio, event.startTime, event.timezone ?? undefined);
  const end = eventInstant(event.dataFim, event.endTime, event.timezone ?? undefined, "23:59");
  if (!start || !end || end <= start) throw new Error("INVALID_CALENDAR_DATE");
  lines.push("BEGIN:VEVENT", "UID:" + escape(event.id) + "@eventmap", "DTSTAMP:" + utc(now), "DTSTART:" + utc(start), "DTEND:" + utc(end), "SUMMARY:" + escape(event.nome), "DESCRIPTION:" + escape(event.descricao), "LOCATION:" + escape(event.endereco), "URL:" + origin + "/eventos/" + encodeURIComponent(event.id), "STATUS:" + (event.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED"), "END:VEVENT");
 }
 lines.push("END:VCALENDAR"); return lines.map(fold).join("\r\n") + "\r\n";
}
