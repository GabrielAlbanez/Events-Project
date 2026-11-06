import { getNotificationType, notificationCopy, safeNotificationHref } from "./catalog";
export function notificationPushPayload(notice: { id: string; userId: string; type?: string | null; priority?: string | null; href: string; title?: string; message?: string }) {
  const type = getNotificationType(notice.type);
  // Event/community updates may include their public context. Private connections,
  // attendance, moderation and account messages never disclose their content on the lock screen.
  const publicContext = ["EVENT_REMINDER", "EVENT_CHANGE", "COMMUNITY"].includes(type);
  const copy = notificationCopy({ title: publicContext ? notice.title ?? "EventMap" : "EventMap", message: publicContext ? notice.message ?? "Você tem uma atualização" : "Você tem uma atualização" });
  return { id: notice.id, userId: notice.userId, type, priority: notice.priority === "high" ? "high" : "normal", ...copy, href: safeNotificationHref(notice.href) };
}
