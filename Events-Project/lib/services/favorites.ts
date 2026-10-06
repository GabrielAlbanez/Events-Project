import prisma from "@/lib/prisma";
import type { ResolveCurrentUser } from "@/lib/services/authContext";
import { publicEventSelect } from "@/lib/eventQueries";
import type { Evento } from "@/types";
export async function getSavedEvents(resolveCurrentUser: ResolveCurrentUser): Promise<Evento[]> {
    const user = await resolveCurrentUser();
    if (!user)
        return [];
    const saved = await prisma.favorite.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, include: { event: { select: publicEventSelect } } });
    return saved.filter(item => ["PUBLISHED", "CANCELLED", "ENDED"].includes(item.event.status)).map(item => ({ ...item.event, validate: item.event.validate ?? false }));
}
export async function getFavoriteState(eventId: string, resolveCurrentUser: ResolveCurrentUser) {
    const user = await resolveCurrentUser();
    if (!user)
        return { saved: false, reminderMinutes: null };
    const favorite = await prisma.favorite.findUnique({ where: { userId_eventId: { userId: user.id, eventId } } });
    return { saved: Boolean(favorite), reminderMinutes: favorite?.reminderMinutes ?? null };
}
export async function toggleFavorite(eventId: string, resolveCurrentUser: ResolveCurrentUser) {
    try {
        const user = await resolveCurrentUser();
        if (!user)
            return { success: false, message: "Entre para salvar eventos." };
        const event = await prisma.events.findFirst({ where: { id: eventId, status: { in: ["PUBLISHED", "ENDED", "CANCELLED"] } }, select: { id: true } });
        if (!event)
            return { success: false, message: "Evento indisponível." };
        const where = { userId_eventId: { userId: user.id, eventId } };
        const current = await prisma.favorite.findUnique({ where });
        if (current)
            await prisma.favorite.delete({ where });
        else
            await prisma.favorite.create({ data: { userId: user.id, eventId } });
        return { success: true, message: current ? "Evento removido dos salvos." : "Evento salvo.", saved: !current };
    }
    catch {
        return { success: false, message: "Não foi possível atualizar seus salvos." };
    }
}
export async function setEventReminder(eventId: string, minutes: number | null, resolveCurrentUser: ResolveCurrentUser) {
    try {
        const user = await resolveCurrentUser();
        if (!user)
            return { success: false, message: "Entre para configurar lembretes." };
        if (minutes !== null && ![15, 60, 1440].includes(minutes))
            return { success: false, message: "Escolha um dos horários disponíveis." };
        const event = await prisma.events.findFirst({ where: { id: eventId, status: "PUBLISHED" }, select: { id: true } });
        if (!event)
            return { success: false, message: "Lembretes estão disponíveis para eventos publicados." };
        await prisma.favorite.upsert({ where: { userId_eventId: { userId: user.id, eventId } }, create: { userId: user.id, eventId, reminderMinutes: minutes }, update: { reminderMinutes: minutes, reminderSentAt: null } });
        return { success: true, message: minutes === null ? "Lembrete desativado." : "Lembrete configurado." };
    }
    catch {
        return { success: false, message: "Não foi possível salvar o lembrete." };
    }
}
