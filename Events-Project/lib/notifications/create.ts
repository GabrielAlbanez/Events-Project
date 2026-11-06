import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { isNotificationHref, notificationCatalog } from "./catalog";

const schema = z.object({
  userId: z.string().min(1), title: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(160), href: z.string().refine(isNotificationHref, "Destino de notificação inválido."),
  type: z.enum(["EVENT_CHANGE", "EVENT_REMINDER", "COMMUNITY", "CONNECTION", "CHECKIN", "ADMIN", "SYSTEM"]).default("SYSTEM"),
  priority: z.enum(["normal", "high"]).optional(), groupKey: z.string().max(160).nullable().optional(),
});
export type CreateNotificationInput = z.input<typeof schema>;
type NotificationStore = Pick<Prisma.TransactionClient, "notification">;
export function validateNotification(input: CreateNotificationInput) {
  const parsed = schema.parse(input);
  return { ...parsed, priority: parsed.priority ?? notificationCatalog[parsed.type].priority };
}
export async function createNotification(db: NotificationStore, input: CreateNotificationInput) {
  return db.notification.create({ data: validateNotification(input) });
}
export async function createNotifications(db: NotificationStore, inputs: CreateNotificationInput[]) {
  const data = inputs.map(validateNotification);
  return data.length ? db.notification.createMany({ data }) : { count: 0 };
}
