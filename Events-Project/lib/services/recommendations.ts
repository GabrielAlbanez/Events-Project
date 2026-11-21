import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { publicEventSelect, toPublicEvent } from "@/lib/eventQueries";
import { MIN_CO_SAVERS, NEARBY_KM, rankRecommendedEvents, rankSimilarEvents, type CoSavedSignal, type Preference, type RecommendedEvent } from "@/lib/eventRecommendations";
import type { ResolveCurrentUser } from "@/lib/services/authContext";

const historyStatuses = ["PUBLISHED", "ENDED", "CANCELLED"] as const;
const activeRegistration = ["CONFIRMED", "WAITLISTED", "CHECKED_IN"] as const;
const order: Prisma.EventsOrderByWithRelationInput[] = [{ dataInicio: "asc" }, { id: "asc" }];
/** Events that ended up to two days ago may still be ongoing in another timezone; ranking filters precisely. */
function dateFloor(now: Date) { return new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10); }

/**
 * Counts, for each candidate event, how many distinct other people saved it together with
 * one of the anchor events. Only aggregated counts leave this function; identities never do.
 */
function coSaveCounts(pairs: { userId: string; eventId: string }[], anchorsByUser: Map<string, string[]>, anchorNames: Map<string, string>): Map<string, CoSavedSignal> {
 const byEvent = new Map<string, { users: Set<string>; perAnchor: Map<string, number> }>();
 for (const { userId, eventId } of pairs) {
  const entry = byEvent.get(eventId) ?? { users: new Set<string>(), perAnchor: new Map<string, number>() };
  if (entry.users.has(userId)) continue;
  entry.users.add(userId);
  for (const anchor of anchorsByUser.get(userId) ?? []) entry.perAnchor.set(anchor, (entry.perAnchor.get(anchor) ?? 0) + 1);
  byEvent.set(eventId, entry);
 }
 const result = new Map<string, CoSavedSignal>();
 byEvent.forEach((entry, eventId) => {
  if (entry.users.size < MIN_CO_SAVERS) return;
  let anchor: string | undefined, best = 0;
  // Anchors are iterated in the viewer's saved order, so ties resolve deterministically.
  anchorNames.forEach((_name, id) => { const count = entry.perAnchor.get(id) ?? 0; if (count > best) { best = count; anchor = id; } });
  result.set(eventId, { count: entry.users.size, anchor: anchor && best >= MIN_CO_SAVERS ? { id: anchor, nome: anchorNames.get(anchor) ?? "" } : undefined });
 });
 return result;
}

export async function getRecommendedEvents(resolve: ResolveCurrentUser): Promise<RecommendedEvent[]> {
 const user = await resolve();
 if (!user) return [];
 const [saved, follows, registrations] = await Promise.all([
  prisma.favorite.findMany({ where: { userId: user.id, event: { status: { in: [...historyStatuses] } } }, orderBy: { createdAt: "desc" }, take: 100, select: { event: { select: { id: true, nome: true, category: true, lat: true, lng: true } } } }),
  prisma.follow.findMany({ where: { userId: user.id }, take: 100, select: { promoterId: true } }),
  prisma.eventRegistration.findMany({ where: { userId: user.id, status: { in: [...activeRegistration] } }, orderBy: { createdAt: "desc" }, take: 100, select: { status: true, event: { select: { id: true, nome: true, category: true, lat: true, lng: true } } } }),
 ]);
 const preferences: Preference[] = [
  ...registrations.filter(item => item.status !== "WAITLISTED").map(item => ({ ...item.event, source: "registration" as const })),
  ...saved.map(item => ({ ...item.event, source: "favorite" as const })),
 ];
 const followed = follows.map(item => item.promoterId);
 const excludeIds = new Set([...saved.map(item => item.event.id), ...registrations.map(item => item.event.id)]);
 const categories = Array.from(new Set(preferences.map(event => event.category).filter((category): category is string => Boolean(category) && category !== "Outros")));
 const now = new Date(), floor = dateFloor(now);
 const where: Prisma.EventsWhereInput = {
  status: "PUBLISHED", dataFim: { gte: floor },
  favorites: { none: { userId: user.id } },
  registrations: { none: { userId: user.id, status: { in: [...activeRegistration] } } },
  OR: [{ userId: null }, { userId: { not: user.id } }],
 };

 // "Quem salvou X também salvou Y": people who saved the viewer's recent favorites, then their other upcoming saves.
 const anchorIds = saved.slice(0, 30).map(item => item.event.id);
 const coSavers = anchorIds.length ? await prisma.favorite.findMany({ where: { eventId: { in: anchorIds }, userId: { not: user.id } }, select: { userId: true, eventId: true }, orderBy: [{ createdAt: "desc" }, { userId: "asc" }, { eventId: "asc" }], take: 500 }) : [];
 const anchorsByUser = new Map<string, string[]>();
 for (const { userId, eventId } of coSavers) anchorsByUser.set(userId, [...(anchorsByUser.get(userId) ?? []), eventId]);
 const coUserIds = Array.from(anchorsByUser.keys());
 const coPairs = coUserIds.length >= MIN_CO_SAVERS ? await prisma.favorite.findMany({ where: { userId: { in: coUserIds }, eventId: { notIn: Array.from(excludeIds) }, event: { status: "PUBLISHED", dataFim: { gte: floor } } }, select: { userId: true, eventId: true }, orderBy: [{ createdAt: "desc" }, { userId: "asc" }, { eventId: "asc" }], take: 2000 }) : [];
 const coSaved = coSaveCounts(coPairs, anchorsByUser, new Map(saved.slice(0, 30).map(item => [item.event.id, item.event.nome])));
 const coSavedIds = Array.from(coSaved.keys()).slice(0, 40);

 const preferenceFilters: Prisma.EventsWhereInput[] = [
  ...(categories.length ? [{ category: { in: categories } }] : []),
  ...(followed.length ? [{ userId: { in: followed } }] : []),
  ...(coSavedIds.length ? [{ id: { in: coSavedIds } }] : []),
 ];
 const [preferred, recent] = await Promise.all([
  preferenceFilters.length ? prisma.events.findMany({ where: { AND: [where, { OR: preferenceFilters }] }, orderBy: order, take: 80, select: publicEventSelect }) : Promise.resolve([]),
  prisma.events.findMany({ where, orderBy: order, take: 80, select: publicEventSelect }),
 ]);
 return rankRecommendedEvents([...preferred, ...recent].map(toPublicEvent), preferences, followed, now, { ownerId: user.id, excludeIds, coSaved });
}

/**
 * Public, login-free "eventos parecidos" for an event page. Safe to call from a Server Component:
 * reads only published data and aggregated co-save counts (minimum MIN_CO_SAVERS people).
 */
export async function getSimilarEvents(eventId: string, limit = 4): Promise<RecommendedEvent[]> {
 if (typeof eventId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(eventId)) return [];
 const size = Math.max(1, Math.min(Math.trunc(limit) || 4, 12));
 const base = await prisma.events.findFirst({ where: { id: eventId, status: { in: [...historyStatuses] } }, select: { id: true, category: true, lat: true, lng: true, userId: true } });
 if (!base) return [];
 const now = new Date(), floor = dateFloor(now);
 const upcoming: Prisma.EventsWhereInput = { status: "PUBLISHED", dataFim: { gte: floor }, id: { not: base.id } };

 const savers = await prisma.favorite.findMany({ where: { eventId: base.id }, select: { userId: true }, orderBy: { createdAt: "desc" }, take: 300 });
 const coSaved = new Map<string, number>();
 if (savers.length >= MIN_CO_SAVERS) {
  const pairs = await prisma.favorite.findMany({ where: { userId: { in: savers.map(item => item.userId) }, event: upcoming }, select: { userId: true, eventId: true }, orderBy: [{ createdAt: "desc" }, { userId: "asc" }, { eventId: "asc" }], take: 3000 });
  const users = new Map<string, Set<string>>();
  for (const { userId, eventId: other } of pairs) users.set(other, (users.get(other) ?? new Set<string>()).add(userId));
  users.forEach((people, other) => { if (people.size >= MIN_CO_SAVERS) coSaved.set(other, people.size); });
 }
 const links: Prisma.EventsWhereInput[] = [];
 if (base.category && base.category !== "Outros") links.push({ category: base.category });
 if (base.userId) links.push({ userId: base.userId });
 if (base.lat != null && base.lng != null) {
  const latDelta = NEARBY_KM / 111, lngDelta = NEARBY_KM / (111 * Math.max(.2, Math.cos(base.lat * Math.PI / 180)));
  links.push({ lat: { gte: base.lat - latDelta, lte: base.lat + latDelta }, lng: { gte: base.lng - lngDelta, lte: base.lng + lngDelta } });
 }
 const coIds = Array.from(coSaved.keys()).slice(0, 40);
 if (coIds.length) links.push({ id: { in: coIds } });
 if (!links.length) return [];
 const candidates = await prisma.events.findMany({ where: { AND: [upcoming, { OR: links }] }, orderBy: order, take: 60, select: publicEventSelect });
 return rankSimilarEvents(base, candidates.map(toPublicEvent), coSaved, now, size);
}
