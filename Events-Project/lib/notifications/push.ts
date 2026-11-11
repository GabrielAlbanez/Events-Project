import { getNotificationType, notificationCopy, safeNotificationHref } from "./catalog";
export function notificationPushPayload(notice: { id: string; userId: string; type?: string | null; priority?: string | null; href: string; title?: string; message?: string }) {
  const type = getNotificationType(notice.type);
  // Community notices can contain private room names and team task details.
  const publicContext = type === "EVENT_REMINDER" || type === "EVENT_CHANGE";
  const copy = notificationCopy({ title: publicContext ? notice.title ?? "EventMap" : "EventMap", message: publicContext ? notice.message ?? "Você tem uma atualização" : "Você tem uma atualização" });
  return { id: notice.id, userId: notice.userId, type, priority: notice.priority === "high" ? "high" : "normal", ...copy, href: safeNotificationHref(notice.href) };
}
