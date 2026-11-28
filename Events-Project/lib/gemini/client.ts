/**
 * Minimal client for Google's Gemini API (free tier), turned on by GEMINI_API_KEY.
 * Returns the model's text, or null on any failure (no key, quota, timeout, malformed answer),
 * so every caller has a non-AI fallback. Logs only status codes, never content or the key.
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

export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";

export function geminiEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.GEMINI_API_KEY?.trim());
}

export async function geminiText(request: GeminiRequest, deps: GeminiDeps = {}, logTag = "gemini"): Promise<string | null> {
  const env = deps.env ?? process.env;
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  const model = (env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL).replace(/[^\w.-]/g, "");
  const doFetch = deps.fetch ?? (fetch as unknown as GeminiFetch);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, deps.timeoutMs ?? 12000));
  try {
    const response = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: request.system }] },
        contents: [{ role: "user", parts: request.parts }],
        ...(request.googleSearch ? { tools: [{ google_search: {} }] } : {}),
        generationConfig: {
          temperature: request.temperature ?? 0,
          ...(request.schema && !request.googleSearch ? { responseMimeType: "application/json", responseSchema: request.schema } : {}),
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(logTag, `status=${response.status ?? "unknown"}`);
      return null;
    }
    const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> };
    const text = (body?.candidates?.[0]?.content?.parts ?? []).map(part => typeof part?.text === "string" ? part.text : "").join("");
    return text.trim() ? text : null;
  } catch {
    console.warn(logTag, "status=failed");
    return null;
  } finally {
    clearTimeout(timer);
  }
}
