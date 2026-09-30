import prisma from "@/lib/prisma";
import type { ResolveCurrentUser } from "@/lib/services/authContext";
import type { NotificationDTO } from "@/types/features";
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
