/**
 * Optional second opinion from Google's Gemini API (free tier). Turned on by GEMINI_API_KEY.
 * Sends only public event content (name, description, category, cover image), never data about
 * the organizer. Any failure (no key, quota, timeout, malformed answer) returns null so the
 * triage falls back to the fixed rules and, when in doubt, to an admin.
 */
export type AiCategory = "ok" | "mismatch" | "low_quality" | "adult" | "violence" | "hate" | "scam" | "other";
export interface AiVerdict { matches: boolean; serious: boolean; category: AiCategory; reason: string }
export interface AiReviewInput { name: string; description: string; category: string; image: { bytes: Buffer; mime: string } | null }
type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }>;
export interface AiDeps { env?: Record<string, string | undefined>; fetch?: FetchLike; timeoutMs?: number }

const categories: AiCategory[] = ["ok", "mismatch", "low_quality", "adult", "violence", "hate", "scam", "other"];
export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";
const MAX_REASON = 300;

const instructions = [
  "Você revisa eventos enviados a um site brasileiro de descoberta de eventos.",
  "Compare a imagem de capa com o nome, a categoria e a descrição do evento.",
  "matches = true se a imagem combina com o evento (cartaz, local, artistas, público, tema). false se não tem relação (ex.: foto aleatória, meme, print de tela sem relação).",
  "serious = true somente para conteúdo adulto/sexual, violência explícita, discurso de ódio, armas/drogas ou indícios claros de golpe.",
  "category: ok, mismatch, low_quality (imagem ilegível, borrada ou só texto ilegível), adult, violence, hate, scam ou other.",
  "reason: uma frase curta em português do Brasil, dirigida ao organizador, dizendo o que corrigir. Não invente fatos.",
].join("\n");

const responseSchema = {
  type: "OBJECT",
  properties: {
    matches: { type: "BOOLEAN" },
    serious: { type: "BOOLEAN" },
    category: { type: "STRING", enum: categories },
    reason: { type: "STRING" },
  },
  required: ["matches", "serious", "category", "reason"],
};

export async function reviewWithGemini(input: AiReviewInput, deps: AiDeps = {}): Promise<AiVerdict | null> {
  const env = deps.env ?? process.env;
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  const model = (env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL).replace(/[^\w.-]/g, "");
  const doFetch = deps.fetch ?? (fetch as unknown as FetchLike);
  const eventText = `Nome: ${input.name.slice(0, 160)}\nCategoria: ${input.category.slice(0, 80)}\nDescrição: ${input.description.slice(0, 3000)}`;
  const parts: Array<Record<string, unknown>> = [{ text: eventText }];
  if (input.image) parts.push({ inline_data: { mime_type: input.image.mime, data: input.image.bytes.toString("base64") } });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 12000);
  try {
    const response = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: instructions }] },
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn("event-triage-ai", `status=${response.status ?? "unknown"}`);
      return null;
    }
    return parseVerdict(await response.json());
  } catch {
    console.warn("event-triage-ai", "status=failed");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseVerdict(body: unknown): AiVerdict | null {
  try {
    const text = (body as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> })?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") return null;
    const data = JSON.parse(text) as Record<string, unknown>;
    if (typeof data.matches !== "boolean" || typeof data.serious !== "boolean" || typeof data.reason !== "string") return null;
    const category = categories.includes(data.category as AiCategory) ? (data.category as AiCategory) : "other";
    return { matches: data.matches, serious: data.serious, category, reason: data.reason.replace(/\s+/g, " ").trim().slice(0, MAX_REASON) };
  } catch {
    return null;
  }
}
