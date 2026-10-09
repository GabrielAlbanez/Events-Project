import prisma from "@/lib/prisma";
import { publicEventSelect } from "@/lib/eventQueries";
import { rankRecommendedEvents, type RecommendedEvent } from "@/lib/eventRecommendations";
import type { ResolveCurrentUser } from "@/lib/services/authContext";
export async function getRecommendedEvents(resolve: ResolveCurrentUser): Promise<RecommendedEvent[]> {
 const user = await resolve();
 if (!user) return [];
 const [saved, follows] = await Promise.all([
  prisma.favorite.findMany({ where: { userId: user.id, event: { status: { in: ["PUBLISHED", "ENDED", "CANCELLED"] } } }, orderBy: { createdAt: "desc" }, take: 100, select: { event: { select: { category: true, lat: true, lng: true } } } }),
  prisma.follow.findMany({ where: { userId: user.id }, take: 100, select: { promoterId: true } }),
 ]);
 const preferences = saved.map(item => item.event), followed = follows.map(item => item.promoterId);
 const categories = Array.from(new Set(preferences.map(event => event.category).filter(category => category !== "Outros")));
 const now = new Date(), floor = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0,10);
 const where = { status: "PUBLISHED" as const, dataFim: { gte: floor }, favorites: { none: { userId: user.id } } };
 const [preferred, recent] = await Promise.all([
  categories.length || followed.length ? prisma.events.findMany({ where: { ...where, OR: [{ category: { in: categories } }, { userId: { in: followed } }] }, orderBy: [{ dataInicio: "asc" }, { id: "asc" }], take: 80, select: publicEventSelect }) : Promise.resolve([]),
  prisma.events.findMany({ where, orderBy: [{ dataInicio: "asc" }, { id: "asc" }], take: 80, select: publicEventSelect }),
 ]);
 return rankRecommendedEvents([...preferred,...recent].map(event => ({...event,validate:event.validate ?? false})), preferences, followed, now);
}
