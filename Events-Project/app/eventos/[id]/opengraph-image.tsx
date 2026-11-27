import { ImageResponse } from "next/og";
import { getPublicEvent } from "@/lib/eventQueries";
import { normalizeEventImageUrl } from "@/lib/eventImageUrl";
import { publicSiteUrl } from "@/lib/publicUrl";
import { isTicketSaleActive } from "@/lib/services/tickets";
import type { Evento } from "@/types";

// Share preview for /eventos/[id] (WhatsApp, Instagram, X...). Runs on the default nodejs runtime because Prisma is used.
// Never throws: unknown events, database failures and unusable banners fall back to a branded EventMap card.
export const alt = "Evento no EventMap";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

/** Gives the share image an alt text with the event name; failures keep the generic one. */
export async function generateImageMetadata({ params }: Props) {
  const event = await getPublicEvent(params.id).catch(() => null);
  return [{ id: "card", alt: event?.nome ? `${truncate(event.nome, 110)} — EventMap` : alt, size, contentType }];
}

type Props = { params: { id: string } };
type CardData = {
  name: string;
  category: string;
  dateLine: string | null;
  place: string | null;
  price: string | null;
  status: "PUBLISHED" | "CANCELLED" | "ENDED";
  ticketSale: boolean;
  banner: string | null;
};

const BRAND_BLUE = "#2D52FF";
const BRAND_DEEP = "#1B36D4";
const BRAND_LIME = "#C6F432";
const INK = "#070B1F";
// Satori ignores the CSS "inset" shorthand: layers use explicit top/left/width/height.
const BANNER_TIMEOUT_MS = 3000;
const BANNER_MAX_BYTES = 5 * 1024 * 1024;
const CACHE_CONTROL = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";
// Satori only decodes PNG, JPEG and GIF: WebP/AVIF (and anything else) use the branded gradient instead.
const SATORI_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/gif"];
const UNSUPPORTED_IMAGE = /\.(webp|avif|svg)(\?|#|$)/i;

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const word = cut.lastIndexOf(" ");
  // Prefer a word boundary unless it would drop too much text.
  return (word > max * 0.6 ? cut.slice(0, word) : cut).replace(/[\s,;:–-]+$/, "") + "…";
}

/** Event dates are stored as wall-clock days ("YYYY-MM-DD"); format them in UTC so the server timezone never shifts the day. */
function formatDay(value: string, withYear: boolean): string | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const date = day ? new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]))) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", { weekday: withYear ? undefined : "short", day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" }).format(date);
}

function dateLine(event: Evento): string | null {
  const start = formatDay(event.dataInicio, true);
  if (!start) return null;
  const end = event.dataFim && event.dataFim.slice(0, 10) !== event.dataInicio.slice(0, 10) ? formatDay(event.dataFim, true) : null;
  // "5 a 6 de dezembro de 2026" in the same month, "30 de novembro a 2 de dezembro de 2026" otherwise.
  const sameMonth = end && start.replace(/^\d+ /, "") === end.replace(/^\d+ /, "");
  const days = end ? (sameMonth ? `${start.split(" ")[0]} a ${end}` : `${start.replace(/ de \d{4}$/, "")} a ${end}`) : start;
  if (!event.startTime) return days;
  // Times are wall-clock in the event timezone; name it (as the event page does) when it is not Brasília time.
  const zone = event.timezone && event.timezone !== "America/Sao_Paulo" ? ` (fuso ${event.timezone})` : "";
  return `${days} · ${event.startTime}${zone}`;
}

function priceLabel(event: Evento): string | null {
  if (event.isFree) return "Gratuito";
  return event.priceCents != null && event.priceCents > 0 ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(event.priceCents / 100) : null;
}

const privateHost = (hostname: string) =>
  hostname === "localhost" || hostname === "0.0.0.0" || hostname === "[::1]" || hostname.endsWith(".internal") || hostname.endsWith(".local") ||
  /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);

/** Absolute http(s) URL for a banner, or null. Private hosts are only allowed for the site's own origin (local uploads). */
function bannerUrl(value: string, site: URL): URL | null {
  const normalized = normalizeEventImageUrl(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized, site);
    if (!["http:", "https:"].includes(url.protocol) || UNSUPPORTED_IMAGE.test(url.pathname)) return null;
    return url.origin === site.origin || !privateHost(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

/** Downloads the banner with a short timeout and returns it as a data URL Satori can decode, or null. */
async function loadBanner(value: string): Promise<string | null> {
  try {
    const site = publicSiteUrl();
    let url = bannerUrl(value, site);
    // Follow at most two redirects by hand so every hop goes through the same host checks.
    for (let hop = 0; url && hop < 3; hop++) {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(BANNER_TIMEOUT_MS), headers: { accept: "image/png,image/jpeg,image/gif" } });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        url = location ? bannerUrl(new URL(location, url).href, site) : null;
        continue;
      }
      const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      // Rejects webp/avif/svg and HTML error pages before reading the body.
      if (!response.ok || !SATORI_IMAGE_TYPES.includes(type)) return null;
      if (Number(response.headers.get("content-length") || 0) > BANNER_MAX_BYTES) return null;
      const body = Buffer.from(await response.arrayBuffer());
      if (body.byteLength === 0 || body.byteLength > BANNER_MAX_BYTES) return null;
      return `data:${type === "image/jpg" ? "image/jpeg" : type};base64,${body.toString("base64")}`;
    }
    return null;
  } catch {
    return null;
  }
}

async function loadCard(id: string): Promise<CardData | null> {
  try {
    const event = await getPublicEvent(id);
    if (!event) return null;
    const status = event.status === "CANCELLED" || event.status === "ENDED" ? event.status : "PUBLISHED";
    const [ticketSale, banner] = await Promise.all([
      status === "PUBLISHED" ? isTicketSaleActive(event.id).catch(() => false) : Promise.resolve(false),
      event.banner ? loadBanner(event.banner) : Promise.resolve(null),
    ]);
    return {
      name: truncate(event.nome || "Evento", 110),
      category: truncate(event.category || "Evento", 28),
      dateLine: dateLine(event),
      place: event.endereco ? truncate(event.endereco.replace(/,?\s*(Brasil|Brazil)\s*$/i, ""), 72) : null,
      price: priceLabel(event),
      status,
      ticketSale,
      banner,
    };
  } catch {
    return null;
  }
}

function Logo({ size: px = 44 }: { size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <svg width={px} height={px} viewBox="0 0 40 40" fill="none">
        <path d="M20 3C12.3 3 6 9.2 6 16.8 6 26.5 16 33.5 20 38Z" fill={BRAND_BLUE} />
        <path d="M20 3C27.7 3 34 9.2 34 16.8 34 26.5 24 33.5 20 38Z" fill={BRAND_DEEP} />
        <circle cx="20" cy="16.5" r="6" fill={BRAND_LIME} />
      </svg>
      <div style={{ display: "flex", fontSize: Math.round(px * 0.72), fontWeight: 650, letterSpacing: "-0.04em", color: "#FFFFFF" }}>
        Event<span style={{ color: BRAND_LIME }}>Map</span>
      </div>
    </div>
  );
}

function Background({ banner }: { banner: string | null }) {
  return (
    <div style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, display: "flex" }}>
      {banner ? (
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
        <img src={banner} width={1200} height={630} style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, objectFit: "cover" }} />
      ) : (
        // One gradient per layer: Satori does not reliably paint comma-separated background lists.
        <div style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, display: "flex", backgroundImage: `linear-gradient(135deg, ${INK} 0%, #0E1A5C 55%, ${BRAND_DEEP} 100%)` }}>
          <div style={{ position: "absolute", top: -260, right: -180, display: "flex", width: 720, height: 720, borderRadius: 999, backgroundImage: "radial-gradient(circle, rgba(198,244,50,0.30) 0%, rgba(198,244,50,0) 65%)" }} />
          <div style={{ position: "absolute", bottom: -380, left: -260, display: "flex", width: 900, height: 900, borderRadius: 999, backgroundImage: "radial-gradient(circle, rgba(45,82,255,0.75) 0%, rgba(45,82,255,0) 65%)" }} />
        </div>
      )}
      <div style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, display: "flex", backgroundImage: banner ? "linear-gradient(180deg, rgba(7,11,31,0.60) 0%, rgba(7,11,31,0.30) 22%, rgba(7,11,31,0.86) 50%, rgba(7,11,31,0.97) 100%)" : "linear-gradient(180deg, rgba(7,11,31,0) 40%, rgba(7,11,31,0.55) 100%)" }} />
    </div>
  );
}

function Chip({ label, tone }: { label: string; tone: "light" | "lime" | "danger" | "muted" }) {
  const styles = {
    light: { background: "rgba(255,255,255,0.16)", color: "#FFFFFF", border: "2px solid rgba(255,255,255,0.35)" },
    lime: { background: BRAND_LIME, color: INK, border: `2px solid ${BRAND_LIME}` },
    danger: { background: "#E5484D", color: "#FFFFFF", border: "2px solid #E5484D" },
    muted: { background: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.85)", border: "2px solid rgba(255,255,255,0.25)" },
  }[tone];
  return <div style={{ display: "flex", flexShrink: 0, alignItems: "center", height: 52, padding: "0 24px", whiteSpace: "nowrap", borderRadius: 999, fontSize: 26, fontWeight: 600, ...styles }}>{label}</div>;
}

function titleSize(name: string): number {
  if (name.length <= 32) return 76;
  if (name.length <= 56) return 64;
  if (name.length <= 80) return 54;
  return 46;
}

function EventCard({ card }: { card: CardData }) {
  const chips: { label: string; tone: "light" | "lime" | "danger" | "muted" }[] = [];
  if (card.status === "CANCELLED") chips.push({ label: "Evento cancelado", tone: "danger" });
  else if (card.status === "ENDED") chips.push({ label: "Evento encerrado", tone: "muted" });
  else {
    if (card.ticketSale) chips.push({ label: "Ingressos à venda", tone: "lime" });
    if (card.price) chips.push({ label: card.price, tone: "light" });
  }
  const meta = "rgba(255,255,255,0.88)";
  return (
    <div style={{ position: "relative", display: "flex", width: "100%", height: "100%", background: INK, color: "#FFFFFF", fontFamily: "Noto Sans, sans-serif" }}>
      <Background banner={card.banner} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: "48px 64px 52px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Logo />
          <div style={{ display: "flex", padding: "10px 22px", borderRadius: 999, background: "rgba(7,11,31,0.55)", border: "2px solid rgba(255,255,255,0.22)", fontSize: 24, fontWeight: 600, color: "#FFFFFF" }}>{card.category}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {chips.length > 0 && <div style={{ display: "flex", gap: 14 }}>{chips.map(chip => <Chip key={chip.label} label={chip.label} tone={chip.tone} />)}</div>}
          <div style={{ display: "block", maxWidth: 1072, fontSize: titleSize(card.name), fontWeight: 700, lineHeight: 1.08, letterSpacing: "-0.03em", lineClamp: 3, overflow: "hidden" }}>{card.name}</div>
          {(card.dateLine || card.place) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 30, color: meta }}>
              {card.dateLine && <div style={{ display: "flex", alignItems: "center", gap: 14 }}><div style={{ display: "flex", width: 12, height: 12, borderRadius: 999, background: BRAND_LIME }} />{card.dateLine}</div>}
              {card.place && <div style={{ display: "flex", alignItems: "center", gap: 14 }}><div style={{ display: "flex", width: 12, height: 12, borderRadius: 999, background: BRAND_BLUE, border: "2px solid #FFFFFF" }} />{card.place}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FallbackCard() {
  return (
    <div style={{ position: "relative", display: "flex", width: "100%", height: "100%", background: INK, color: "#FFFFFF", fontFamily: "Noto Sans, sans-serif" }}>
      <Background banner={null} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "center", gap: 32, width: "100%", height: "100%", padding: "64px 80px" }}>
        <Logo size={88} />
        <div style={{ display: "flex", maxWidth: 900, fontSize: 56, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.03em" }}>Descubra eventos perto de você</div>
        <div style={{ display: "flex", fontSize: 30, color: "rgba(255,255,255,0.82)" }}>Agenda, mapa e ingressos em um só lugar.</div>
      </div>
    </div>
  );
}

// Uses the font bundled with next/og (Noto Sans): the app's Geist is a variable font, which Satori cannot parse.
async function render(element: JSX.Element): Promise<ArrayBuffer> {
  const response = new ImageResponse(element, size);
  // Rendering is lazy: read the body here so Satori failures can still fall back instead of breaking the stream.
  return response.arrayBuffer();
}

export default async function EventOpenGraphImage({ params }: Props): Promise<Response> {
  let body: ArrayBuffer;
  try {
    const card = await loadCard(params.id);
    body = await render(card ? <EventCard card={card} /> : <FallbackCard />);
  } catch {
    body = await render(<FallbackCard />);
  }
  return new Response(body, { headers: { "Content-Type": contentType, "Cache-Control": CACHE_CONTROL } });
}
