// Dados da página /conheca. Funções puras: o servidor resume o catálogo público e formata os rótulos;
// os componentes de cliente só recebem objetos simples e serializáveis. Sem acesso a banco aqui.

/** Campos mínimos de um evento público usados pela landing (projeção de PublicEvent). */
export type LandingCatalogSource = {
  id: string;
  nome: string;
  banner: string | null;
  category: string;
  dataInicio: string;
  dataFim: string;
  startTime: string | null;
  endereco: string;
  isFree: boolean;
  priceCents: number;
  validate: boolean;
  status: string;
};

export type LandingEvent = {
  /** null nos eventos de exemplo (sem página real). */
  href: string | null;
  id: string;
  name: string;
  category: string;
  /** Banner real (URL segura) ou null → bloco neutro. */
  image: string | null;
  dateLabel: string;
  priceLabel: string;
  isFree: boolean;
  priceCents: number;
  place: string;
  /** Distância e posição no mapa: sempre ilustrativas. */
  km: number;
  x: number;
  y: number;
};

export type LandingFigures = {
  today: number;
  nextWeek: number;
  categories: number;
  free: number;
};

export type LandingCatalog = {
  /** true quando os eventos vêm da agenda real; false = conteúdo de exemplo. */
  real: boolean;
  events: LandingEvent[];
  figures: LandingFigures;
};

export type CatalogSummary = { picks: LandingCatalogSource[]; figures: LandingFigures };

export const EMPTY_FIGURES: LandingFigures = { today: 0, nextWeek: 0, categories: 0, free: 0 };

/** Mapa simulado: viewBox 100 × 80 com o visitante no centro e raio máximo (10 km) de 36 unidades. */
export const MAP_VIEWBOX = { width: 100, height: 80, centerX: 50, centerY: 40, maxRadius: 36, maxKm: 10 } as const;

/** Escala ilustrativa em raiz quadrada: espalha os eventos próximos para os pins não se sobreporem no celular. */
export const mapRadius = (km: number) => MAP_VIEWBOX.maxRadius * Math.sqrt(Math.min(km, MAP_VIEWBOX.maxKm) / MAP_VIEWBOX.maxKm);

const ILLUSTRATIVE_KM = [0.8, 1.2, 2.6, 3.4, 4.6, 6.8, 8.5, 9.2];
const ILLUSTRATIVE_ANGLE = [160, -60, 40, 230, 120, -20, 200, 80];
const MAX_PICKS = 12;

export const DISTANCE_OPTIONS = [2, 5, 10] as const;
export type DistanceOption = (typeof DISTANCE_OPTIONS)[number];

export const PRICE_OPTIONS = [
  { value: "qualquer", label: "Qualquer preço" },
  { value: "gratuito", label: "Gratuito" },
  { value: "pago", label: "Pago" },
] as const;
export type PriceFilter = (typeof PRICE_OPTIONS)[number]["value"];

export const formatKm = (km: number) => `${km.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;

// Arredondado para que servidor e navegador gerem exatamente o mesmo estilo (sem divergência de hidratação).
const round = (value: number) => Math.round(value * 100) / 100;

function mapPosition(index: number) {
  const km = ILLUSTRATIVE_KM[index % ILLUSTRATIVE_KM.length];
  const radians = (ILLUSTRATIVE_ANGLE[index % ILLUSTRATIVE_ANGLE.length] * Math.PI) / 180;
  const radius = mapRadius(km);
  return {
    km,
    x: round(((MAP_VIEWBOX.centerX + Math.cos(radians) * radius) / MAP_VIEWBOX.width) * 100),
    y: round(((MAP_VIEWBOX.centerY + Math.sin(radians) * radius) / MAP_VIEWBOX.height) * 100),
  };
}

/** Mesma regra de HomeEventImage: caminho local ou http(s) sem credenciais. O placeholder genérico não conta como banner. */
export function safeImageUrl(value: string | null | undefined): string | null {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate || candidate.includes("eventmap-event-placeholder")) return null;
  if (candidate.startsWith("/") && !candidate.startsWith("//") && !candidate.includes("\\")) return candidate;
  if (/^https?:\/\//i.test(candidate)) {
    try {
      const url = new URL(candidate);
      return url.hostname && !url.username && !url.password ? candidate : null;
    } catch {
      return null;
    }
  }
  return null;
}

const DAY = /^\d{4}-\d{2}-\d{2}/;
const dayOf = (value: string | null | undefined) => (typeof value === "string" && DAY.test(value) ? value.slice(0, 10) : null);

/** Data de hoje (AAAA-MM-DD) no fuso de São Paulo. */
export function todayInBrazil(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function addDays(day: string, amount: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + amount)).toISOString().slice(0, 10);
}

type Dated = { row: LandingCatalogSource; start: string; end: string };

/**
 * Resume o catálogo: só eventos validados, não cancelados e ainda por acontecer.
 * Números reais (zero quando não há) e até 12 eventos, preferindo os que têm banner utilizável.
 */
export function summarizeCatalog(rows: LandingCatalogSource[], now: Date): CatalogSummary {
  const today = todayInBrazil(now);
  const weekEnd = addDays(today, 7);
  const upcoming: Dated[] = [];
  for (const row of rows) {
    if (!row.validate || row.status === "CANCELLED") continue;
    const start = dayOf(row.dataInicio);
    const end = dayOf(row.dataFim) ?? start;
    if (start && end && end >= today) upcoming.push({ row, start, end });
  }
  upcoming.sort((a, b) => (a.start === b.start ? a.row.id.localeCompare(b.row.id) : a.start < b.start ? -1 : 1));

  const figures: LandingFigures = {
    today: upcoming.filter(item => item.start <= today).length,
    nextWeek: upcoming.filter(item => item.start <= weekEnd).length,
    categories: new Set(upcoming.map(item => item.row.category.trim()).filter(Boolean)).size,
    free: upcoming.filter(item => item.row.isFree).length,
  };

  const withBanner = upcoming.filter(item => safeImageUrl(item.row.banner));
  const pool = withBanner.length >= 3 ? withBanner : [...withBanner, ...upcoming.filter(item => !safeImageUrl(item.row.banner))];
  return { picks: pool.slice(0, MAX_PICKS).map(item => item.row), figures };
}

const priceFormat = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function dateLabel(row: LandingCatalogSource): string {
  const day = dayOf(row.dataInicio);
  if (!day) return "";
  const [year, month, date] = day.split("-").map(Number);
  const label = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, date, 12)));
  const time = typeof row.startTime === "string" && /^\d{1,2}:\d{2}/.test(row.startTime) ? ` · ${row.startTime.slice(0, 5)}` : "";
  return `${label}${time}`;
}

/** Eventos de exemplo, usados só quando a agenda não pode ser lida ou está vazia. Sem foto: bloco neutro. */
const FALLBACK: Omit<LandingEvent, "km" | "x" | "y">[] = [
  { href: null, id: "codigo", name: "Código & Café", category: "Tecnologia", image: null, dateLabel: "Hoje · 19:00", priceLabel: "Gratuito", isFree: true, priceCents: 0, place: "Rua Augusta · Consolação" },
  { href: null, id: "jazz", name: "Jazz no Terraço", category: "Música", image: null, dateLabel: "Hoje · 21:00", priceLabel: "R$ 60,00", isFree: false, priceCents: 6000, place: "Terraço Augusta · Consolação" },
  { href: null, id: "live", name: "Noite Live Session", category: "Música", image: null, dateLabel: "Sáb · 22:00", priceLabel: "R$ 45,00", isFree: false, priceCents: 4500, place: "Casa Bela Vista · Bixiga" },
  { href: null, id: "feira", name: "Feira Criativa", category: "Feira", image: null, dateLabel: "Sáb · 10:00", priceLabel: "Gratuito", isFree: true, priceCents: 0, place: "Praça Roosevelt · Centro" },
  { href: null, id: "mesa", name: "Mesa de Origens", category: "Gastronomia", image: null, dateLabel: "Sáb · 20:00", priceLabel: "R$ 120,00", isFree: false, priceCents: 12000, place: "Mercado de Pinheiros" },
  { href: null, id: "cinema", name: "Cinema na Laje", category: "Cinema", image: null, dateLabel: "Hoje · 20:00", priceLabel: "R$ 20,00", isFree: false, priceCents: 2000, place: "Laje Cultural · Santana" },
  { href: null, id: "sunset", name: "Festival Pôr do Sol", category: "Música", image: null, dateLabel: "Dom · 16:00", priceLabel: "Gratuito", isFree: true, priceCents: 0, place: "Parque Villa-Lobos" },
  { href: null, id: "corrida", name: "Corrida Noturna 5K", category: "Esporte", image: null, dateLabel: "Dom · 07:00", priceLabel: "R$ 80,00", isFree: false, priceCents: 8000, place: "Parque Ibirapuera" },
];

/** Monta os dados da landing. Com menos de 3 eventos reais, usa o conteúdo de exemplo e esconde os números. */
export function buildLandingCatalog(summary: CatalogSummary | null): LandingCatalog {
  const picks = summary?.picks ?? [];
  if (picks.length < 3) {
    return { real: false, figures: EMPTY_FIGURES, events: FALLBACK.map((event, index) => ({ ...event, ...mapPosition(index) })) };
  }
  return {
    real: true,
    figures: summary?.figures ?? EMPTY_FIGURES,
    events: picks.map((row, index) => ({
      href: `/eventos/${encodeURIComponent(row.id)}`,
      id: row.id,
      name: row.nome,
      category: row.category.trim() || "Outros",
      image: safeImageUrl(row.banner),
      dateLabel: dateLabel(row),
      priceLabel: row.isFree ? "Gratuito" : row.priceCents > 0 ? priceFormat(row.priceCents) : "Valor na página do evento",
      isFree: row.isFree,
      priceCents: row.priceCents,
      place: row.endereco.trim(),
      ...mapPosition(index),
    })),
  };
}

/** Categorias presentes, das mais frequentes para as menos (no máximo `limit`). */
export function categoriesOf(events: LandingEvent[], limit = 6): string[] {
  const counts = new Map<string, number>();
  for (const event of events) counts.set(event.category, (counts.get(event.category) ?? 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR")).slice(0, limit).map(([name]) => name);
}
