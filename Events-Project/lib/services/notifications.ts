import prisma from "@/lib/prisma";
import type { ResolveCurrentUser } from "@/lib/services/authContext";
import type { NotificationDTO } from "@/types/features";
import { z } from "zod";

const cursorSchema = z.object({ id: z.string().uuid(), date: z.string().datetime() });
export async function getNotificationPage(resolveCurrentUser: ResolveCurrentUser, input: { before?: string; unread?: boolean } = {}) {
    const user = await resolveCurrentUser();
    if (!user) return { items: [] as NotificationDTO[], nextBefore: null };
    let cursor: z.infer<typeof cursorSchema> | undefined;
    if (input.before) {
        if (input.before.length > 400) throw new Error("Cursor inválido.");
        try { cursor = cursorSchema.parse(JSON.parse(Buffer.from(input.before, "base64url").toString("utf8"))); }
        catch { throw new Error("Cursor inválido."); }
    }
    const rows = await prisma.notification.findMany({
        where: { userId: user.id, ...(input.unread ? { readAt: null } : {}),
            ...(cursor ? { OR: [{ createdAt: { lt: new Date(cursor.date) } }, { createdAt: new Date(cursor.date), id: { lt: cursor.id } }] } : {}) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51,
        select: { id: true, title: true, message: true, href: true, readAt: true, createdAt: true },
    });
    const page = rows.slice(0, 50);
    const last = page.at(-1);
    return { items: page.map(item => ({ ...item, createdAt: item.createdAt.toISOString(), readAt: item.readAt?.toISOString() ?? null })),
        nextBefore: rows.length > 50 && last ? Buffer.from(JSON.stringify({ id: last.id, date: last.createdAt.toISOString() })).toString("base64url") : null };
}
export async function getNotifications(resolveCurrentUser: ResolveCurrentUser): Promise<NotificationDTO[]> {
    const user = await resolveCurrentUser();
    if (!user)
        return [];
    const items = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, title: true, message: true, href: true, readAt: true, createdAt: true } });
    return items.map(item => ({ ...item, createdAt: item.createdAt.toISOString(), readAt: item.readAt?.toISOString() ?? null }));
}
export async function markNotificationRead(id: string | null, resolveCurrentUser: ResolveCurrentUser) {
    const user = await resolveCurrentUser();
    if (!user)
        return { success: false };
    await prisma.notification.updateMany({ where: { userId: user.id, readAt: null, ...(id ? { id } : {}) }, data: { readAt: new Date() } });
    return { success: true };
}
