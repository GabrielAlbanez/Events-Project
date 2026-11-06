import { getNotificationType, notificationCatalog, safeNotificationHref } from "./catalog";
export function notificationPushPayload(notice: { id: string; userId: string; type?: string | null; priority?: string | null; href: string }) {
  const type = getNotificationType(notice.type);
  return { id: notice.id, userId: notice.userId, type, priority: notice.priority === "high" ? "high" : "normal", title: notificationCatalog[type].label, message: "Você tem uma atualização no EventMap. Abra para conferir.", href: safeNotificationHref(notice.href) };
}
