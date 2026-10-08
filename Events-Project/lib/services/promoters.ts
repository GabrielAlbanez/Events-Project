import prisma from "@/lib/prisma";
import type { ResolveCurrentUser } from "@/lib/services/authContext";
import { publicEventSelect } from "@/lib/eventQueries";
export async function getPromoterProfile(id: string, resolveCurrentUser: ResolveCurrentUser) {
    const promoter = await prisma.user.findFirst({ where: { id, role: { in: ["ADMIN", "PROMOTER"] } }, select: { id: true, name: true, image: true, bio: true, contactUrl: true, _count: { select: { followers: true } }, Events: { where: { status: { in: ["PUBLISHED", "ENDED"] } }, select: publicEventSelect, orderBy: { dataInicio: "desc" } } } });
    if (!promoter)
        return null;
    const user = await resolveCurrentUser();
    const followed = user ? await prisma.follow.findUnique({ where: { userId_promoterId: { userId: user.id, promoterId: id } } }) : null;
    return { id: promoter.id, name: promoter.name, image: promoter.image, bio: promoter.bio, contactUrl: promoter.contactUrl, followerCount: promoter._count.followers, isFollowing: Boolean(followed), events: promoter.Events.map(event => ({ ...event, validate: event.validate ?? false })) };
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
