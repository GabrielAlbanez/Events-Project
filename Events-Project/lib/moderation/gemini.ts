import { geminiText, type GeminiFetch } from "../gemini/client";

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
  const eventText = `Nome: ${input.name.slice(0, 160)}
Categoria: ${input.category.slice(0, 80)}
Descrição: ${input.description.slice(0, 3000)}`;
  const parts: Array<Record<string, unknown>> = [{ text: eventText }];
  if (input.image) parts.push({ inline_data: { mime_type: input.image.mime, data: input.image.bytes.toString("base64") } });
  // Shared client: fast model first, one fallback model, key only in a header, status-only logs.
  const text = await geminiText({ system: instructions, parts, schema: responseSchema }, { env: deps.env, fetch: deps.fetch as GeminiFetch | undefined, timeoutMs: deps.timeoutMs ?? 12000 }, "event-triage-ai");
  return text === null ? null : parseVerdict({ candidates: [{ content: { parts: [{ text }] } }] });
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
