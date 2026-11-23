import prisma from "@/lib/prisma";
import { eventInstant } from "@/lib/eventTime";
import { createNotificationOnce } from "@/lib/notifications/create";
import { notificationCopy } from "@/lib/notifications/catalog";

const BATCH_SIZE = 300;
const LOOKAHEAD_DAYS = 8;
const OPPORTUNISTIC_INTERVAL_MS = 60_000;
const OPPORTUNISTIC_BUDGET_MS = 1_200;
const DAY_MS = 86_400_000;

export type ReminderReport = { checked: number; sent: number; failed: number };
type ReminderDeps = { now?: () => Date };

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

function reminderText(minutes: number): string {
  if (minutes >= 1440) {
    const days = Math.round(minutes / 1440);
    return days === 1 ? "amanhã" : `em ${days} dias`;
  }
  if (minutes >= 60) {
    const hours = Math.round(minutes / 60);
    return hours === 1 ? "em 1 hora" : `em ${hours} horas`;
  }
  return `em ${minutes} minutos`;
}

/**
 * Sends the reminders people chose on saved events. Each one is claimed by a guarded update inside its own
 * transaction: concurrent runs never send twice, and a failed send rolls back and is retried on the next run.
 */
export async function processDueEventReminders(deps: ReminderDeps = {}): Promise<ReminderReport> {
  const now = (deps.now ?? (() => new Date()))();
  const rows = await prisma.favorite.findMany({
    where: {
      reminderMinutes: { not: null }, reminderSentAt: null,
      event: { status: "PUBLISHED", dataInicio: { gte: isoDay(new Date(now.getTime() - DAY_MS)), lte: isoDay(new Date(now.getTime() + LOOKAHEAD_DAYS * DAY_MS)) } },
    },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
    select: { userId: true, eventId: true, reminderMinutes: true, event: { select: { nome: true, dataInicio: true, startTime: true, timezone: true } } },
  });
  const report: ReminderReport = { checked: rows.length, sent: 0, failed: 0 };
  for (const row of rows) {
    const minutes = row.reminderMinutes;
    const start = eventInstant(row.event.dataInicio, row.event.startTime, row.event.timezone);
    if (minutes === null || !start || start.getTime() <= now.getTime() || start.getTime() - minutes * 60_000 > now.getTime()) continue;
    try {
      const sent = await prisma.$transaction(async (tx) => {
        const claimed = await tx.favorite.updateMany({ where: { userId: row.userId, eventId: row.eventId, reminderSentAt: null }, data: { reminderSentAt: now } });
        if (!claimed.count) return false;
        const groupKey = `event-reminder:${row.eventId}:${row.event.dataInicio}:${row.event.startTime ?? ""}`;
        await createNotificationOnce(tx, {
          ...notificationCopy({
            userId: row.userId, type: "EVENT_REMINDER" as const, href: `/eventos/${encodeURIComponent(row.eventId)}`,
            title: "Lembrete de evento", message: `${row.event.nome} começa ${reminderText(minutes)}.`,
          }),
          groupKey,
        });
        await tx.communitySignal.create({ data: { room: `user:${row.userId}` } });
        return true;
      });
      if (sent) report.sent += 1;
    } catch {
      report.failed += 1;
    }
  }
  if (report.failed) console.warn("event-reminders-partial", { failed: report.failed });
  return report;
}

let lastRun = 0;
/**
 * Throttled per instance and time-boxed: serverless functions may freeze after responding, so it is awaited briefly.
 * Whatever does not finish is retried on the next run; reading notifications never fails because of reminders.
 */
export async function runDueRemindersOpportunistically(): Promise<void> {
  const current = Date.now();
  if (current - lastRun < OPPORTUNISTIC_INTERVAL_MS) return;
  lastRun = current;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The catch stays attached to the work itself, so a failure after the time box is never an unhandled rejection.
  const work = processDueEventReminders().catch(() => console.warn("event-reminders-failed"));
  try {
    await Promise.race([work, new Promise((resolve) => { timer = setTimeout(resolve, OPPORTUNISTIC_BUDGET_MS); })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
