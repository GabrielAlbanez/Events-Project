import { z } from "zod";

export const recurrenceInputSchema = z.object({
  frequency: z.enum(["WEEKLY", "MONTHLY"]),
  interval: z.number().int().min(1).max(4),
  count: z.number().int().min(2).max(52),
});

export type RecurrenceInput = z.infer<typeof recurrenceInputSchema>;

function parseCivilDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function civilDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Calendar arithmetic uses UTC only as a civil-date container; event times retain their own timezone. */
export function planOccurrences(start: string, end: string, input: RecurrenceInput): Array<{ dataInicio: string; dataFim: string }> {
  const spec = recurrenceInputSchema.parse(input);
  const initialStart = parseCivilDate(start);
  const initialEnd = parseCivilDate(end);
  if (!initialStart || !initialEnd || initialEnd < initialStart) throw new Error("Datas do evento inválidas.");
  const duration = Math.round((initialEnd.getTime() - initialStart.getTime()) / 86_400_000);
  const occurrences: Array<{ dataInicio: string; dataFim: string }> = [];
  for (let index = 0; index < spec.count; index++) {
    let nextStart: Date;
    if (spec.frequency === "WEEKLY") {
      nextStart = new Date(initialStart);
      nextStart.setUTCDate(initialStart.getUTCDate() + index * spec.interval * 7);
    } else {
      const targetMonth = initialStart.getUTCMonth() + index * spec.interval;
      const firstOfMonth = new Date(Date.UTC(initialStart.getUTCFullYear(), targetMonth, 1));
      const lastDay = new Date(Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + 1, 0)).getUTCDate();
      nextStart = new Date(Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth(), Math.min(initialStart.getUTCDate(), lastDay)));
    }
    if (nextStart.getTime() - initialStart.getTime() > 366 * 86_400_000) throw new Error("Limite a série a um ano.");
    const nextEnd = new Date(nextStart);
    nextEnd.setUTCDate(nextEnd.getUTCDate() + duration);
    occurrences.push({ dataInicio: civilDate(nextStart), dataFim: civilDate(nextEnd) });
  }
  return occurrences;
}
