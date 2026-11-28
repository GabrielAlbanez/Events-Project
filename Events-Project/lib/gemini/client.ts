/**
 * Minimal client for Google's Gemini API (free tier), turned on by GEMINI_API_KEY.
 * Returns the model's text, or null on any failure (no key, quota, timeout, malformed answer),
 * so every caller has a non-AI fallback. Logs only status codes, never content or the key.
 *
 * Tries a fast model first and, when it is overloaded, rate-limited or too slow, one fallback
 * model within the same time budget. Bad requests (4xx other than 429) are not retried.
 */
export type GeminiFetch = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }>;
export interface GeminiDeps { env?: Record<string, string | undefined>; fetch?: GeminiFetch; timeoutMs?: number }
export interface GeminiRequest {
  system: string;
  parts: Array<Record<string, unknown>>;
  /** JSON schema for structured output. Not combinable with googleSearch. */
  schema?: Record<string, unknown>;
  googleSearch?: boolean;
  temperature?: number;
}

/** Fast, no "thinking" by default: answers in a few seconds on the free tier. */
export const DEFAULT_GEMINI_MODEL = "gemini-flash-lite-latest";
export const DEFAULT_GEMINI_FALLBACK_MODEL = "gemini-flash-latest";
/** Share of the budget the first model gets, so a hung call still leaves time for the fallback. */
const FIRST_SHARE = 0.55;
const MIN_FALLBACK_MS = 2500;

export function geminiEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.GEMINI_API_KEY?.trim());
}

const modelName = (value: string | undefined, fallback: string) => (value?.trim() || fallback).replace(/[^\w.-]/g, "");

export async function geminiText(request: GeminiRequest, deps: GeminiDeps = {}, logTag = "gemini"): Promise<string | null> {
  const env = deps.env ?? process.env;
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  const models = Array.from(new Set([modelName(env.GEMINI_MODEL, DEFAULT_GEMINI_MODEL), modelName(env.GEMINI_FALLBACK_MODEL, DEFAULT_GEMINI_FALLBACK_MODEL)]));
  const doFetch = deps.fetch ?? (fetch as unknown as GeminiFetch);
  const budget = Math.max(1, deps.timeoutMs ?? 12000);
  const deadline = Date.now() + budget;
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: request.system }] },
    contents: [{ role: "user", parts: request.parts }],
    ...(request.googleSearch ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: {
      temperature: request.temperature ?? 0,
      ...(request.schema && !request.googleSearch ? { responseMimeType: "application/json", responseSchema: request.schema } : {}),
    },
  });

  for (let index = 0; index < models.length; index++) {
    const last = index === models.length - 1;
    const remaining = deadline - Date.now();
    if (index > 0 && remaining < MIN_FALLBACK_MS) break;
    const attemptMs = last ? remaining : Math.max(1, Math.round(budget * FIRST_SHARE));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, attemptMs));
    try {
      const response = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${models[index]}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        console.warn(logTag, `status=${response.status ?? "unknown"} model=${index}`);
        const retryable = response.status === undefined || response.status === 429 || response.status >= 500;
        if (!retryable) return null;
        continue;
      }
      const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> };
      const text = (data?.candidates?.[0]?.content?.parts ?? []).map(part => typeof part?.text === "string" ? part.text : "").join("");
      if (text.trim()) return text;
      console.warn(logTag, `status=empty model=${index}`);
    } catch {
      console.warn(logTag, `status=${controller.signal.aborted ? "timeout" : "failed"} model=${index}`);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
