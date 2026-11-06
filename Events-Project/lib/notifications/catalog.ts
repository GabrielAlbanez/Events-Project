export type NotificationType = "EVENT_CHANGE" | "EVENT_REMINDER" | "COMMUNITY" | "CONNECTION" | "CHECKIN" | "ADMIN" | "SYSTEM";
export type NotificationCategory = "Eventos" | "Comunidade" | "Conexões" | "Sistema";
export type NotificationPriority = "normal" | "high";
export const notificationCatalog: Record<NotificationType, { label: string; icon: string; className: string; category: NotificationCategory; priority: NotificationPriority }> = {
  EVENT_CHANGE: { label: "Atualização de evento", icon: "CalendarDays", className: "bg-primary/10 text-primary", category: "Eventos", priority: "normal" },
  EVENT_REMINDER: { label: "Lembrete", icon: "Clock3", className: "bg-primary/10 text-primary", category: "Eventos", priority: "normal" },
  COMMUNITY: { label: "Comunidade", icon: "Users", className: "bg-secondary text-secondary-foreground", category: "Comunidade", priority: "normal" },
  CONNECTION: { label: "Conexão", icon: "Heart", className: "bg-accent text-accent-foreground", category: "Conexões", priority: "normal" },
  CHECKIN: { label: "Participação", icon: "TicketCheck", className: "bg-accent text-accent-foreground", category: "Eventos", priority: "normal" },
  ADMIN: { label: "Administração", icon: "ShieldCheck", className: "bg-primary/10 text-primary", category: "Sistema", priority: "high" },
  SYSTEM: { label: "EventMap", icon: "Bell", className: "bg-muted text-muted-foreground", category: "Sistema", priority: "normal" },
};
export function getNotificationType(value: unknown): NotificationType {
  return typeof value === "string" && Object.hasOwn(notificationCatalog, value) ? value as NotificationType : "SYSTEM";
}
export function isNotificationHref(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500 || !/^\/(?![\/\\])/.test(value) || /[\\\u0000-\u0020]/.test(value)) return false;
  try { const decoded = decodeURIComponent(value); return !decoded.startsWith("//") && !/[\\\u0000-\u001f]/.test(decoded); } catch { return false; }
}
export function safeNotificationHref(value: unknown): string {
  return isNotificationHref(value) ? value : "/notificacoes";
}
export function notificationText(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}
export function notificationCopy<T extends { title: string; message: string }>(input: T): T {
  return { ...input, title: notificationText(input.title, 80), message: notificationText(input.message, 160) };
}
