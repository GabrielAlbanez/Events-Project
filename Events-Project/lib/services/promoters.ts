import { z } from "zod";
import prisma from "@/lib/prisma";
import type { ResolveCurrentUser } from "@/lib/services/authContext";
import { publicEventSelect } from "@/lib/eventQueries";
import { INSIGHTS_PERIODS, PUBLIC_RATING_MIN_COUNT, activeRegistrations, addRegistrationCount, attendanceRate, buildFunnel, emptyRegistrations, insightsPeriodStart, metricDayKey, occupancyRate, parseInsightsPeriod, periodDays, rankEvents, splitPromoterEvents, stepRate, type FunnelStage, type InsightsPeriod, type RegistrationBreakdown } from "@/lib/organizerInsights";
export async function getPromoterProfile(id: string, resolveCurrentUser: ResolveCurrentUser) {
    const promoter = await prisma.user.findFirst({ where: { id, role: { in: ["ADMIN", "PROMOTER"] } }, select: { id: true, name: true, image: true, bio: true, contactUrl: true, _count: { select: { followers: true } }, Events: { where: { status: { in: ["PUBLISHED", "ENDED"] } }, select: publicEventSelect, orderBy: { dataInicio: "desc" } } } });
    if (!promoter)
        return null;
    const user = await resolveCurrentUser();
    const [followed, feedback] = await Promise.all([
        user ? prisma.follow.findUnique({ where: { userId_promoterId: { userId: user.id, promoterId: id } } }) : null,
        prisma.communityFeedback.aggregate({ where: { event: { userId: id, status: { in: ["PUBLISHED", "ENDED"] } } }, _avg: { rating: true }, _count: { _all: true } }),
    ]);
    const events = promoter.Events.map(event => ({ ...event, validate: event.validate ?? false }));
    const { upcoming, past } = splitPromoterEvents(events);
    const ratingCount = feedback._count._all;
    // A média só é pública com volume mínimo, para não revelar avaliações individuais.
    const rating = ratingCount >= PUBLIC_RATING_MIN_COUNT && feedback._avg.rating !== null ? { average: Math.round(feedback._avg.rating * 10) / 10, count: ratingCount } : null;
    return { id: promoter.id, name: promoter.name, image: promoter.image, bio: promoter.bio, contactUrl: promoter.contactUrl, followerCount: promoter._count.followers, isFollowing: Boolean(followed), isOwner: user?.id === promoter.id, events, upcoming, past, rating };
}
/** Dados públicos para metadados, widget e feeds. Nunca inclui e-mail ou dados privados do promotor. */
export async function getPromoterPublicAgenda(id: string, options: { limit?: number; now?: Date } = {}) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id))
        return null;
    const now = options.now ?? new Date();
    const limit = Math.min(Math.max(Math.trunc(options.limit ?? 50), 1), 200);
    const yesterday = new Date(now.getTime() - 86400000);
    const promoter = await prisma.user.findFirst({ where: { id, role: { in: ["ADMIN", "PROMOTER"] } }, select: { id: true, name: true, image: true, bio: true, _count: { select: { followers: true } }, Events: { where: { status: "PUBLISHED", dataFim: { gte: metricDayKey(yesterday) } }, select: { id: true, nome: true, banner: true, descricao: true, endereco: true, dataInicio: true, dataFim: true, startTime: true, endTime: true, timezone: true, status: true, category: true, isFree: true, priceCents: true }, orderBy: { dataInicio: "asc" }, take: 400 } } });
    if (!promoter)
        return null;
    const { upcoming } = splitPromoterEvents(promoter.Events, now);
    return { promoter: { id: promoter.id, name: promoter.name, image: promoter.image, bio: promoter.bio, followerCount: promoter._count.followers }, upcoming: upcoming.slice(0, limit) };
}
export async function toggleFollow(promoterId: string, resolveCurrentUser: ResolveCurrentUser) {
    try {
        const user = await resolveCurrentUser();
        if (!user)
            return { success: false, message: "Entre para seguir promotores." };
        if (user.id === promoterId)
            return { success: false, message: "Você não pode seguir seu próprio perfil." };
        const promoter = await prisma.user.findFirst({ where: { id: promoterId, role: { in: ["ADMIN", "PROMOTER"] } }, select: { id: true } });
        if (!promoter)
            return { success: false, message: "Promotor indisponível." };
        const where = { userId_promoterId: { userId: user.id, promoterId } };
        const current = await prisma.follow.findUnique({ where });
        if (current)
            await prisma.follow.delete({ where });
        else
            await prisma.follow.create({ data: { userId: user.id, promoterId } });
        return { success: true, message: current ? "Você deixou de seguir este promotor." : "Você receberá avisos de novos eventos.", following: !current };
    }
    catch {
        return { success: false, message: "Não foi possível atualizar seus seguidores." };
    }
}
export async function getMyPublicProfile(resolveCurrentUser: ResolveCurrentUser) {
    const user = await resolveCurrentUser();
    if (!user)
        return { bio: "", contactUrl: "" };
    return await prisma.user.findUnique({ where: { id: user.id }, select: { bio: true, contactUrl: true } }) ?? { bio: "", contactUrl: "" };
}
export async function updatePromoterProfile(input: {
    bio: string;
    contactUrl: string;
}, resolveCurrentUser: ResolveCurrentUser) {
    try {
        const user = await resolveCurrentUser();
        if (!user || !["ADMIN", "PROMOTER"].includes(user.role))
            return { success: false, message: "Acesso negado." };
        const bio = input.bio.trim(), contactUrl = input.contactUrl.trim();
        if (bio.length > 1000 || contactUrl.length > 300)
            return { success: false, message: "Use até 1000 caracteres na descrição e 300 no contato." };
        if (contactUrl) {
            const url = new URL(contactUrl);
            if (!["https:", "http:"].includes(url.protocol))
                return { success: false, message: "Use um endereço http ou https." };
        }
        await prisma.user.update({ where: { id: user.id }, data: { bio, contactUrl } });
        return { success: true, message: "Perfil público atualizado." };
    }
    catch {
        return { success: false, message: "Não foi possível atualizar o perfil público." };
    }
}
export async function getPromoterStats(resolveCurrentUser: ResolveCurrentUser) {
    const user = await resolveCurrentUser();
    if (!user || !["ADMIN", "PROMOTER"].includes(user.role))
        return { events: [], totals: { views: 0, ticketClicks: 0, favorites: 0 } };
    const entries = await prisma.events.findMany({ where: { userId: user.id }, select: { id: true, nome: true, status: true, views: true, ticketClicks: true, _count: { select: { favorites: true } }, metrics: { orderBy: { day: "desc" }, take: 30, select: { day: true, views: true, ticketClicks: true } } } });
    const events = entries.map(event => ({ id: event.id, nome: event.nome, status: event.status, views: event.views, ticketClicks: event.ticketClicks, favorites: event._count.favorites, daily: event.metrics }));
    return { events, totals: events.reduce((sum, event) => ({ views: sum.views + event.views, ticketClicks: sum.ticketClicks + event.ticketClicks, favorites: sum.favorites + event.favorites }), { views: 0, ticketClicks: 0, favorites: 0 }) };
}
const insightsInputSchema = z.object({
    period: z.enum(INSIGHTS_PERIODS).optional(),
    promoterId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
}).strict();
export type PromoterInsightsInput = z.infer<typeof insightsInputSchema>;
export interface EventInsight {
    id: string;
    nome: string;
    status: string;
    dataInicio: string;
    capacity: number | null;
    views: number;
    ticketClicks: number;
    favorites: number;
    registrations: number;
    checkIns: number;
    breakdown: RegistrationBreakdown;
    clickRate: number | null;
    attendanceRate: number | null;
    occupancyRate: number | null;
    rating: { average: number | null; count: number };
    funnel: FunnelStage[];
}
export interface PromoterInsights {
    promoter: { id: string; name: string | null };
    viewer: { isAdmin: boolean; viewingOther: boolean };
    period: InsightsPeriod;
    periodStart: string | null;
    generatedAt: string;
    followers: { total: number; gained: number | null };
    totals: { views: number; ticketClicks: number; favorites: number; registrations: number; checkIns: number; breakdown: RegistrationBreakdown };
    funnel: FunnelStage[];
    clickRate: number | null;
    attendanceRate: number | null;
    rating: { average: number | null; count: number };
    daily: Array<{ day: string; views: number; ticketClicks: number }>;
    events: EventInsight[];
    top: EventInsight[];
}
export type PromoterInsightsResult = { ok: true; data: PromoterInsights } | { ok: false; reason: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "UNAVAILABLE"; message: string };
const roundRating = (value: number | null) => value === null ? null : Math.round(value * 10) / 10;
/** Resultados do promotor. Só o próprio promotor vê seus eventos; ADMIN pode consultar qualquer promotor. */
export async function getPromoterInsights(input: unknown, resolveCurrentUser: ResolveCurrentUser, now = new Date()): Promise<PromoterInsightsResult> {
    const parsed = insightsInputSchema.safeParse(input ?? {});
    if (!parsed.success)
        return { ok: false, reason: "INVALID", message: "Filtro inválido." };
    const user = await resolveCurrentUser();
    if (!user)
        return { ok: false, reason: "UNAUTHENTICATED", message: "Entre para ver seus resultados." };
    if (!["ADMIN", "PROMOTER"].includes(user.role))
        return { ok: false, reason: "FORBIDDEN", message: "Os resultados estão disponíveis para contas de organizador." };
    const isAdmin = user.role === "ADMIN";
    const ownerId = parsed.data.promoterId ?? user.id;
    if (ownerId !== user.id && !isAdmin)
        return { ok: false, reason: "FORBIDDEN", message: "Você só pode ver os resultados dos seus eventos." };
    const period = parseInsightsPeriod(parsed.data.period);
    const start = insightsPeriodStart(period, now);
    const days = periodDays(period, now);
    try {
        const owner = await prisma.user.findFirst({ where: { id: ownerId, role: { in: ["ADMIN", "PROMOTER"] } }, select: { id: true, name: true, _count: { select: { followers: true } } } });
        if (!owner)
            return { ok: false, reason: "NOT_FOUND", message: "Organizador não encontrado." };
        const ownEvents = { event: { userId: owner.id } };
        const [gained, entries, metricSums, dailyRows, favoriteRows, registrationRows, feedbackRows] = await Promise.all([
            start ? prisma.follow.count({ where: { promoterId: owner.id, createdAt: { gte: start } } }) : Promise.resolve(null),
            prisma.events.findMany({ where: { userId: owner.id }, select: { id: true, nome: true, status: true, dataInicio: true, capacity: true, views: true, ticketClicks: true }, orderBy: { dataInicio: "desc" }, take: 500 }),
            start ? prisma.eventMetric.groupBy({ by: ["eventId"], where: { ...ownEvents, day: { gte: metricDayKey(start) } }, _sum: { views: true, ticketClicks: true } }) : Promise.resolve([]),
            prisma.eventMetric.groupBy({ by: ["day"], where: { ...ownEvents, day: { gte: days[0] } }, _sum: { views: true, ticketClicks: true } }),
            prisma.favorite.groupBy({ by: ["eventId"], where: { ...ownEvents, ...(start ? { createdAt: { gte: start } } : {}) }, _count: { _all: true } }),
            prisma.eventRegistration.groupBy({ by: ["eventId", "status"], where: { ...ownEvents, ...(start ? { createdAt: { gte: start } } : {}) }, _count: { _all: true } }),
            prisma.communityFeedback.groupBy({ by: ["eventId"], where: ownEvents, _avg: { rating: true }, _count: { _all: true } }),
        ]);
        const metricByEvent = new Map(metricSums.map(row => [row.eventId, { views: row._sum.views ?? 0, ticketClicks: row._sum.ticketClicks ?? 0 }]));
        const favoritesByEvent = new Map(favoriteRows.map(row => [row.eventId, row._count._all]));
        const feedbackByEvent = new Map(feedbackRows.map(row => [row.eventId, { average: row._avg.rating, count: row._count._all }]));
        const registrationsByEvent = new Map<string, RegistrationBreakdown>();
        for (const row of registrationRows) {
            const current = registrationsByEvent.get(row.eventId) ?? emptyRegistrations();
            addRegistrationCount(current, row.status, row._count._all);
            registrationsByEvent.set(row.eventId, current);
        }
        const events: EventInsight[] = entries.map(event => {
            const metric = start ? metricByEvent.get(event.id) ?? { views: 0, ticketClicks: 0 } : { views: event.views, ticketClicks: event.ticketClicks };
            const breakdown = registrationsByEvent.get(event.id) ?? emptyRegistrations();
            const feedback = feedbackByEvent.get(event.id);
            const counts = { views: metric.views, ticketClicks: metric.ticketClicks, favorites: favoritesByEvent.get(event.id) ?? 0, registrations: activeRegistrations(breakdown), checkIns: breakdown.checkedIn };
            return { id: event.id, nome: event.nome, status: event.status, dataInicio: event.dataInicio, capacity: event.capacity, ...counts, breakdown, clickRate: stepRate(counts.ticketClicks, counts.views), attendanceRate: attendanceRate(breakdown), occupancyRate: occupancyRate(breakdown, event.capacity), rating: { average: roundRating(feedback?.average ?? null), count: feedback?.count ?? 0 }, funnel: buildFunnel(counts) };
        });
        const breakdown = events.reduce((sum, event) => ({ confirmed: sum.confirmed + event.breakdown.confirmed, waitlisted: sum.waitlisted + event.breakdown.waitlisted, cancelled: sum.cancelled + event.breakdown.cancelled, checkedIn: sum.checkedIn + event.breakdown.checkedIn }), emptyRegistrations());
        const totals = { views: 0, ticketClicks: 0, favorites: 0, registrations: activeRegistrations(breakdown), checkIns: breakdown.checkedIn, breakdown };
        for (const event of events) {
            totals.views += event.views;
            totals.ticketClicks += event.ticketClicks;
            totals.favorites += event.favorites;
        }
        const ratingCount = feedbackRows.reduce((sum, row) => sum + row._count._all, 0);
        const ratingSum = feedbackRows.reduce((sum, row) => sum + (row._avg.rating ?? 0) * row._count._all, 0);
        const dailyByDay = new Map(dailyRows.map(row => [row.day, { views: row._sum.views ?? 0, ticketClicks: row._sum.ticketClicks ?? 0 }]));
        return { ok: true, data: {
            promoter: { id: owner.id, name: owner.name },
            viewer: { isAdmin, viewingOther: owner.id !== user.id },
            period,
            periodStart: start ? start.toISOString() : null,
            generatedAt: now.toISOString(),
            followers: { total: owner._count.followers, gained },
            totals,
            funnel: buildFunnel(totals),
            clickRate: stepRate(totals.ticketClicks, totals.views),
            attendanceRate: attendanceRate(breakdown),
            rating: { average: ratingCount ? roundRating(ratingSum / ratingCount) : null, count: ratingCount },
            daily: days.map(day => ({ day, ...(dailyByDay.get(day) ?? { views: 0, ticketClicks: 0 }) })),
            events,
            top: rankEvents(events, 5),
        } };
    }
    catch {
        return { ok: false, reason: "UNAVAILABLE", message: "Não foi possível carregar os resultados agora." };
    }
}
