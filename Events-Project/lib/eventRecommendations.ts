import type { Evento } from "@/types";
import { eventInstant } from "@/lib/eventTime";
export interface RecommendedEvent { event: Evento; reason: string }

/** A signal from the viewer's own history. `nome` lets the reason name the anchor event. */
export type Preference = Pick<Evento, "category" | "lat" | "lng"> & { id?: string; nome?: string; source?: "favorite" | "registration" };
/** Co-saves are counted as distinct people; `anchor` is one of the viewer's own saved events. */
export type CoSavedSignal = { count: number; anchor?: Pick<Evento, "id" | "nome"> };
export type RecommendationOptions = {
  /** Events created by the viewer are never recommended to them. */
  ownerId?: string | null;
  /** Already saved or registered events. */
  excludeIds?: Iterable<string>;
  coSaved?: ReadonlyMap<string, CoSavedSignal>;
  limit?: number;
};

/** Minimum distinct people before "quem salvou X também salvou Y" is shown, so nobody is singled out. */
export const MIN_CO_SAVERS = 2;
export const NEARBY_KM = 50;

export function distanceKm(a: Pick<Evento, "lat" | "lng">, b: Pick<Evento, "lat" | "lng">): number | null {
 if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
 const radians = (n: number) => n * Math.PI / 180;
 const dLat = radians(a.lat - b.lat), dLng = radians(a.lng - b.lng);
 const arc = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
 return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, arc)));
}
function nearby(a: Pick<Evento, "lat" | "lng">, b: Pick<Evento, "lat" | "lng">): boolean {
 const distance = distanceKm(a, b);
 return distance != null && distance <= NEARBY_KM;
}
const quoted = (name: string) => "“" + name.trim().slice(0, 80) + "”";
const meaningfulCategory = (category?: string | null): category is string => Boolean(category && category !== "Outros");

/** Upcoming published events only; returns the start instant used to break ties. */
function upcomingStart(event: Evento, now: Date): number | null {
 const start = eventInstant(event.dataInicio, event.startTime, event.timezone ?? undefined);
 const end = eventInstant(event.dataFim, event.endTime, event.timezone ?? undefined, "23:59");
 if (event.status !== "PUBLISHED" || !start || !end || end < now) return null;
 return start.getTime();
}

type Scored = { event: Evento; score: number; time: number; reason: string };
const byScore = (a: Scored, b: Scored) => b.score - a.score || a.time - b.time || a.event.id.localeCompare(b.event.id);

/**
 * Deterministic, explainable ranking. Each signal has a fixed weight and the strongest one
 * becomes the visible reason. Registrations count as a stronger affinity than favorites.
 */
export function rankRecommendedEvents(candidates: Evento[], saved: Preference[], followed: string[], now = new Date(), options: RecommendationOptions = {}): RecommendedEvent[] {
 const promoters = new Set(followed);
 const excluded = new Set(options.excludeIds ?? []);
 const affinity = new Map<string, { weight: number; anchor?: Preference }>();
 for (const preference of saved) {
  if (!meaningfulCategory(preference.category)) continue;
  const current = affinity.get(preference.category) ?? { weight: 0 };
  current.weight += preference.source === "registration" ? 2 : 1;
  // Prefer a named registration, then a named favorite, as the visible anchor.
  if (preference.nome && (!current.anchor?.nome || (preference.source === "registration" && current.anchor.source !== "registration"))) current.anchor = preference;
  affinity.set(preference.category, current);
 }
 const unique = Array.from(new Map(candidates.map(event => [event.id, event])).values());
 return unique.flatMap((event): Scored[] => {
  if (excluded.has(event.id) || (options.ownerId && event.userId === options.ownerId)) return [];
  const time = upcomingStart(event, now);
  if (time == null) return [];
  const signals: { score: number; reason: string }[] = [];
  if (event.userId && promoters.has(event.userId)) signals.push({ score: 5, reason: "De um organizador que você segue" });
  const co = options.coSaved?.get(event.id);
  if (co && co.count >= MIN_CO_SAVERS) signals.push({ score: 4 + Math.min(co.count - MIN_CO_SAVERS, 2) * .5, reason: co.anchor?.nome ? "Quem salvou " + quoted(co.anchor.nome) + " também salvou este" : "Salvo por pessoas com gostos parecidos com os seus" });
  const category = meaningfulCategory(event.category) ? affinity.get(event.category) : undefined;
  if (category) {
   const anchor = category.anchor;
   signals.push({ score: 3 + Math.min(category.weight - 1, 2) * .25, reason: anchor?.nome
    ? (anchor.source === "registration" ? "Mesma categoria de " + quoted(anchor.nome) + ", em que você se inscreveu" : "Porque você salvou " + quoted(anchor.nome) + " (mesma categoria)")
    : "Na categoria dos seus eventos salvos" });
  }
  const close = saved.find(previous => nearby(previous, event));
  if (close) signals.push({ score: 2, reason: close.nome ? "Perto de " + quoted(close.nome) + ", " + (close.source === "registration" ? "em que você se inscreveu" : "que você salvou") : "Perto de um evento que você salvou" });
  const strongest = signals.reduce<{ score: number; reason: string } | null>((best, signal) => !best || signal.score > best.score ? signal : best, null);
  const score = signals.reduce((total, signal) => total + signal.score, 0);
  return [{ event, score, time, reason: strongest?.reason ?? "Próximo evento publicado" }];
 }).sort(byScore).slice(0, options.limit ?? 6).map(({ event, reason }) => ({ event, reason }));
}

/**
 * "Eventos parecidos" for an event page: only events with at least one concrete link
 * (co-saves, category, organizer or distance). No generic filler.
 */
export function rankSimilarEvents(base: Pick<Evento, "id" | "category" | "lat" | "lng" | "userId">, candidates: Evento[], coSaved: ReadonlyMap<string, number> = new Map(), now = new Date(), limit = 4): RecommendedEvent[] {
 const unique = Array.from(new Map(candidates.map(event => [event.id, event])).values());
 return unique.flatMap((event): Scored[] => {
  if (event.id === base.id) return [];
  const time = upcomingStart(event, now);
  if (time == null) return [];
  const signals: { score: number; reason: string }[] = [];
  const co = coSaved.get(event.id) ?? 0;
  if (co >= MIN_CO_SAVERS) signals.push({ score: 4 + Math.min(co - MIN_CO_SAVERS, 2) * .5, reason: "Quem salvou este evento também salvou" });
  if (meaningfulCategory(base.category) && event.category === base.category) signals.push({ score: 3, reason: "Mesma categoria: " + base.category });
  if (base.userId && event.userId === base.userId) signals.push({ score: 2.5, reason: "Do mesmo organizador" });
  const distance = distanceKm(base, event);
  if (distance != null && distance <= NEARBY_KM) signals.push({ score: distance <= 5 ? 2 : 1.5, reason: distance < 1 ? "No mesmo local ou muito perto" : "A cerca de " + Math.round(distance) + " km deste evento" });
  if (!signals.length) return [];
  const strongest = signals.reduce((best, signal) => signal.score > best.score ? signal : best);
  return [{ event, score: signals.reduce((total, signal) => total + signal.score, 0), time, reason: strongest.reason }];
 }).sort(byScore).slice(0, Math.max(1, Math.min(limit, 12))).map(({ event, reason }) => ({ event, reason }));
}
