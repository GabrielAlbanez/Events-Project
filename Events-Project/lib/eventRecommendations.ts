import type { Evento } from "@/types";
import { eventInstant } from "@/lib/eventTime";
export interface RecommendedEvent { event: Evento; reason: string }
type Preference = Pick<Evento, "category" | "lat" | "lng">;
function nearby(a: Preference, b: Preference): boolean {
 if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return false;
 const radians = (n: number) => n * Math.PI / 180;
 const dLat = radians(a.lat - b.lat), dLng = radians(a.lng - b.lng);
 const arc = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
 return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, arc))) <= 50;
}
export function rankRecommendedEvents(candidates: Evento[], saved: Preference[], followed: string[], now = new Date()): RecommendedEvent[] {
 const categories = new Set(saved.map(event => event.category).filter(category => category && category !== "Outros"));
 const promoters = new Set(followed);
 const unique = Array.from(new Map(candidates.map(event => [event.id, event])).values());
 return unique.flatMap(event => {
  const start = eventInstant(event.dataInicio, event.startTime, event.timezone ?? undefined);
  const end = eventInstant(event.dataFim, event.endTime, event.timezone ?? undefined, "23:59");
  if (event.status !== "PUBLISHED" || !start || !end || end < now) return [];
  const category = categories.has(event.category), following = Boolean(event.userId && promoters.has(event.userId));
  const close = saved.some(previous => nearby(previous, event));
  return [{ event, score: (following ? 5 : 0) + (category ? 3 : 0) + (close ? 2 : 0), time: start.getTime(), reason: following ? "De um organizador que você segue" : category ? "Na categoria dos seus eventos salvos" : close ? "Perto de um evento que você salvou" : "Próximo evento publicado" }];
 }).sort((a,b) => b.score - a.score || a.time - b.time || a.event.id.localeCompare(b.event.id)).slice(0,6).map(({event,reason}) => ({event,reason}));
}
