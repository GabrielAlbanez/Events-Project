"use server";

import { getAuthenticatedUser } from "@/lib/adminAuth";
import prisma from "@/lib/prisma";
import { publicSiteUrl } from "@/lib/publicUrl";
import { readEventImage } from "@/lib/storage/eventImages";
import { AI_BUSY, draftEventWithAi, eventTipsWithAi, promoCopyWithAi, type AiServiceDeps } from "@/lib/ai/service";
import type { AiResult, EventDraftSuggestion, EventTips, PromoCopy } from "@/types/ai";

const deps = (): AiServiceDeps => ({ db: prisma, readImage: readEventImage, siteOrigin: () => publicSiteUrl().origin });

/** 1. "Escrever com IA": loose text and/or poster → suggested form fields. */
export async function draftEventAction(form: FormData): Promise<AiResult<EventDraftSuggestion>> {
  try { return await draftEventWithAi(await getAuthenticatedUser(), form, deps()); }
  catch { console.warn("ai-draft", "status=error"); return { ok: false, error: AI_BUSY }; }
}

/** 2. Promotion texts for a published event the user organizes. */
export async function promoCopyAction(eventId: string): Promise<AiResult<PromoCopy>> {
  try { return await promoCopyWithAi(await getAuthenticatedUser(), eventId, deps()); }
  catch { console.warn("ai-promo", "status=error"); return { ok: false, error: AI_BUSY }; }
}

/** 3. Tips before sending: fixed rules always, Gemini when available. */
export async function eventTipsAction(form: FormData): Promise<AiResult<EventTips>> {
  try { return await eventTipsWithAi(await getAuthenticatedUser(), form, deps()); }
  catch { console.warn("ai-tips", "status=error"); return { ok: false, error: AI_BUSY }; }
}
