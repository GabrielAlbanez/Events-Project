/** Shapes shared by the Gemini helpers (lib/ai), their actions/routes and the UI. */

export type AiResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** 1. Fields suggested from a loose text or a poster. Every field is optional: the organizer reviews all of them. */
export interface EventDraftSuggestion {
  nome?: string;
  descricao?: string;
  category?: string;
  /** YYYY-MM-DD */
  dataInicio?: string;
  dataFim?: string;
  /** HH:mm */
  startTime?: string;
  endTime?: string;
  endereco?: string;
  isFree?: boolean;
  /** Reais with comma, as the form expects (e.g. "25,00"). */
  price?: string;
  organizerName?: string;
  ageRating?: string;
  LinkParaCompraIngresso?: string;
}

/** 2. Ready-to-paste promotion texts; the event link is appended by the server. */
export interface PromoCopy { instagram: string; whatsapp: string; stories: string[] }

/** 3. Tips before sending the event. */
export interface EventTips { tips: string[]; imageMatches: boolean | null; aiUsed: boolean }

/** 4. Natural-language search turned into the home filters (URL params q, periodo, categoria, gratis, preco). */
export interface SearchIntent {
  q: string;
  periodo: "todos" | "hoje" | "fim-de-semana" | "mes";
  categoria: string;
  gratis: boolean;
  /** Maximum price in reais, "" when not asked. */
  preco: string;
  nearMe: boolean;
  /** Short sentence telling the person how the search was understood. */
  understood: string;
}

/** 5. Three-line summary at the top of the event page. */
export interface EventSummary { what: string; forWho: string; bring: string }
