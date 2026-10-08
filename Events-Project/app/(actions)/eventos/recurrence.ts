"use server";

import { getAuthenticatedUser } from "@/lib/adminAuth";
import type { RecurrenceInput } from "@/lib/recurrence";
import { criarSerieRecorrente as createSeries } from "@/lib/services/recurrence";

export async function criarSerieRecorrente(sourceEventId: string, spec: RecurrenceInput) {
  return createSeries(sourceEventId, spec, getAuthenticatedUser);
}
