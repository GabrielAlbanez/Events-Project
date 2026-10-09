import type { Evento } from "@/types";
import { eventInstant } from "@/lib/eventTime";

export function groupSavedEvents(events: Evento[], now = new Date()): { upcoming: Evento[]; past: Evento[]; cancelled: Evento[] } {
 const upcoming: Evento[] = [], past: Evento[] = [], cancelled: Evento[] = [];
 const start = (event: Evento) => eventInstant(event.dataInicio, event.startTime, event.timezone ?? undefined)?.getTime() ?? Number.MAX_SAFE_INTEGER;
 for (const event of events) {
  if (event.status === "CANCELLED") { cancelled.push(event); continue; }
  const end = eventInstant(event.dataFim, event.endTime, event.timezone ?? undefined, "23:59");
  if (event.status === "ENDED" || (end && end.getTime() < now.getTime())) past.push(event);
  else upcoming.push(event);
 }
 upcoming.sort((a,b) => start(a) - start(b));
 past.sort((a,b) => start(b) - start(a));
 cancelled.sort((a,b) => start(b) - start(a));
 return { upcoming, past, cancelled };
}
