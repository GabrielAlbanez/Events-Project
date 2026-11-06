import prisma from "@/lib/prisma";
import type { ResolveCurrentUser } from "@/lib/services/authContext";
import type { NotificationDTO } from "@/types/features";
import { z } from "zod";
import { getNotificationType, notificationCatalog, safeNotificationHref, type NotificationCategory } from "@/lib/notifications/catalog";

const cursorSchema = z.object({ id: z.string().uuid(), date: z.string().datetime() });
const select = { id: true, title: true, message: true, href: true, readAt: true, createdAt: true, type: true, priority: true, groupKey: true } as const;
type Row = { id: string; title: string; message: string; href: string; readAt: Date | null; createdAt: Date; type?: string | null; priority?: string | null; groupKey?: string | null };
export function notificationDTO(item: Row): NotificationDTO {
    return { id: item.id, title: item.title, message: item.message, href: safeNotificationHref(item.href), type: getNotificationType(item.type), priority: item.priority === "high" ? "high" : "normal", groupKey: item.groupKey ?? null, createdAt: item.createdAt.toISOString(), readAt: item.readAt?.toISOString() ?? null };
}
const categories = ["Eventos", "Comunidade", "Conexões", "Sistema"] as const;
export type NotificationPageInput = { before?: string; unread?: boolean; category?: NotificationCategory; limit?: number };
export async function getNotificationPage(resolveCurrentUser: ResolveCurrentUser, input: NotificationPageInput = {}) {
    const user = await resolveCurrentUser();
    if (!user) return { items: [] as NotificationDTO[], nextBefore: null };
    let cursor: z.infer<typeof cursorSchema> | undefined;
    if (input.before) {
        if (input.before.length > 400) throw new Error("Cursor inválido.");
        try { cursor = cursorSchema.parse(JSON.parse(Buffer.from(input.before, "base64url").toString("utf8"))); }
        catch { throw new Error("Cursor inválido."); }
    }
    if (input.category && !categories.includes(input.category)) throw new Error("Categoria inválida.");
    const limit = Math.min(50, Math.max(1, Number.isFinite(input.limit) ? Math.floor(input.limit!) : 50));
    const types = input.category ? Object.keys(notificationCatalog).filter(type => notificationCatalog[getNotificationType(type)].category === input.category) : undefined;
    const rows = await prisma.notification.findMany({
        where: { userId: user.id, ...(input.unread ? { readAt: null } : {}), ...(types ? { type: { in: types } } : {}),
            ...(cursor ? { OR: [{ createdAt: { lt: new Date(cursor.date) } }, { createdAt: new Date(cursor.date), id: { lt: cursor.id } }] } : {}) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1, select,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return { items: page.map(notificationDTO), nextBefore: rows.length > limit && last ? Buffer.from(JSON.stringify({ id: last.id, date: last.createdAt.toISOString() })).toString("base64url") : null };
}
export async function getNotifications(resolveCurrentUser: ResolveCurrentUser): Promise<NotificationDTO[]> {
    return (await getNotificationPage(resolveCurrentUser)).items;
}
export async function getUnreadCount(resolveCurrentUser: ResolveCurrentUser): Promise<number> {
    const user = await resolveCurrentUser();
    return user ? prisma.notification.count({ where: { userId: user.id, readAt: null } }) : 0;
}
export async function getNotificationCounts(resolveCurrentUser: ResolveCurrentUser) {
    const result = { total: 0, Eventos: 0, Comunidade: 0, Conexões: 0, Sistema: 0 };
    const user = await resolveCurrentUser();
    if (!user) return result;
    const groups = await prisma.notification.groupBy({ by: ["type"], where: { userId: user.id, readAt: null }, _count: { _all: true } });
    for (const group of groups) { result.total += group._count._all; result[notificationCatalog[getNotificationType(group.type)].category] += group._count._all; }
    return result;
}
export async function getRecentNotifications(resolveCurrentUser: ResolveCurrentUser, input: { since: string }) {
    const user = await resolveCurrentUser();
    if (!user) return [] as NotificationDTO[];
    const parsed = z.string().datetime().parse(input.since);
    // Bounded overlap handles notices committed after a previous refresh.
    const since = new Date(Math.max(new Date(parsed).getTime() - 60_000, Date.now() - 86400000));
    return (await prisma.notification.findMany({ where: { userId: user.id, createdAt: { gte: since } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20, select })).map(notificationDTO);
}
export async function markNotificationRead(id: string | null, resolveCurrentUser: ResolveCurrentUser) {
    const user = await resolveCurrentUser();
    if (!user) return { success: false };
    if (id !== null && !z.string().uuid().safeParse(id).success) return { success: false };
    const readAt = new Date();
    await prisma.notification.updateMany({ where: { userId: user.id, readAt: null, ...(id ? { id } : {}) }, data: { readAt } });
    return { success: true, readAt: readAt.toISOString() };
}
export async function undoNotificationRead(id: string, readAt: string, resolveCurrentUser: ResolveCurrentUser) {
    const user = await resolveCurrentUser();
    if (!user || !z.string().uuid().safeParse(id).success || !z.string().datetime().safeParse(readAt).success) return { success: false };
    const when = new Date(readAt);
    if (Date.now() - when.getTime() > 15000 || when.getTime() > Date.now()) return { success: false };
    const result = await prisma.notification.updateMany({ where: { id, userId: user.id, readAt: when }, data: { readAt: null } });
    return { success: result.count > 0 };
}
