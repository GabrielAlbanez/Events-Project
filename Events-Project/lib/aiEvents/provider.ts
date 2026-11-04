import { publicCatalogUrl } from "./catalog";
export { publicCatalogUrl } from "./catalog";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";

export const AI_EVENT_SOURCE_DOMAINS = ["sympla.com.br", "eventim.com.br", "sescsp.org.br", "ingresse.com", "ticket360.com.br"] as const;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const SOURCE_TIMEOUT_MS = 15000;
const SOURCE_ERROR = "Não foi possível verificar a fonte oficial. Tente outra página de evento.";
const INCOMPLETE_ERROR = "A fonte precisa informar nome, início, término e endereço estruturado do evento.";

export interface VerifiedEventImport {
  sourceUrl: string;
  sourceHash: string;
  name: string;
  startDate: string;
  address: string;
  event: {
    nome: string; descricao: string; banner: string; carrossel: string[];
    dataInicio: string; dataFim: string; linkParaCompra: string; endereco: string;
    category: string; isFree: boolean; priceCents: number; timezone: string;
    startTime: string | null; endTime: string | null; lat: number | null; lng: number | null;
  };
}
type SourceDocument = { url: string; body: string };
interface ProviderDependencies {
  readSource?: (url: string) => Promise<SourceDocument>;
  now?: () => Date;
}
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const normalized = (value: string): string => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, "");
function plain(value: unknown): string {
  return text(value).replace(/<[^>]*>/g, " ").replace(/&(?:amp|quot|apos|lt|gt|nbsp);/g, token => ({ "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " " })[token] ?? " ").replace(/\s+/g, " ").trim();
}

/** Only curated public ticketing/cultural sources. */
export function canonicalSourceUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Use uma página HTTPS de uma das fontes permitidas."); }
  const host = url.hostname.toLowerCase();
  if (value.length > 2048 || /[\u0000-\u0020\\]/.test(value) || url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !AI_EVENT_SOURCE_DOMAINS.some(domain => host === domain || host.endsWith("." + domain))) {
    throw new Error("Use uma página HTTPS de uma das fontes permitidas.");
  }
  url.hash = "";
  for (const key of Array.from(url.searchParams.keys())) if (/^(utm_|gclid$|fbclid$)/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.toString();
}

export function isPublicSourceAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 0 || b === 168) || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19));
  }
  if (isIP(address) === 6) {
    const value = address.toLowerCase();
    // Only global-unicast IPv6; excludes loopback, mapped IPv4, link-local and ULA.
    return /^[23][0-9a-f]{0,3}:/.test(value) && !value.startsWith("2001:db8:");
  }
  return false;
}

async function readOfficialSource(initialUrl: string): Promise<SourceDocument> {
  let current = canonicalSourceUrl(initialUrl);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const url = new URL(current);
    let dnsTimer: ReturnType<typeof setTimeout> | undefined;
    let addresses: Awaited<ReturnType<typeof lookup>>;
    try {
      addresses = await Promise.race([
        lookup(url.hostname, { all: true, verbatim: true }),
        new Promise<never>((_, reject) => { dnsTimer = setTimeout(() => reject(new Error(SOURCE_ERROR)), SOURCE_TIMEOUT_MS); }),
      ]) as unknown as Awaited<ReturnType<typeof lookup>>;
    } catch { throw new Error(SOURCE_ERROR); }
    finally { clearTimeout(dnsTimer); }
    // Use a separately typed result because node:dns has overloaded return types.
    const resolved = addresses as unknown as { address: string; family: number }[];
    if (!resolved.length || resolved.some(item => !isPublicSourceAddress(item.address))) throw new Error(SOURCE_ERROR);
    const chosen = resolved[0];
    const result = await new Promise<{ body: string; location: string | null }>((resolve, reject) => {
      const timeout = setTimeout(() => outgoing.destroy(new Error(SOURCE_ERROR)), SOURCE_TIMEOUT_MS);
      const outgoing = request(url, {
        method: "GET", family: chosen.family,
        // Pin the validated DNS address while preserving TLS hostname validation.
        lookup: (_host, _options, callback) => callback(null, chosen.address, chosen.family),
        headers: { Accept: "text/html,application/ld+json;q=0.9,application/json;q=0.8", "User-Agent": "EventMap/1.0 (event source verification)" },
      }, response => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
          const location = response.headers.location;
          response.resume(); clearTimeout(timeout);
          if (!location) reject(new Error(SOURCE_ERROR)); else resolve({ body: "", location });
          return;
        }
        if (response.statusCode !== 200 || !/^(text\/html|application\/(?:xhtml\+xml|ld\+json|json))(?:;|$)/i.test(response.headers["content-type"] ?? "")) {
          response.resume(); clearTimeout(timeout); reject(new Error(SOURCE_ERROR)); return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_SOURCE_BYTES) { outgoing.destroy(new Error(SOURCE_ERROR)); return; }
          chunks.push(chunk);
        });
        response.once("end", () => { clearTimeout(timeout); resolve({ body: Buffer.concat(chunks).toString("utf8"), location: null }); });
        response.once("error", () => { clearTimeout(timeout); reject(new Error(SOURCE_ERROR)); });
      });
      outgoing.once("error", () => { clearTimeout(timeout); reject(new Error(SOURCE_ERROR)); });
      outgoing.end();
    });
    if (!result.location) return { url: current, body: result.body };
    current = canonicalSourceUrl(new URL(result.location, current).toString());
  }
  throw new Error("A fonte redirecionou muitas vezes. Use a página final do evento.");
}

function eventNodes(body: string): Record<string, unknown>[] {
  if (Buffer.byteLength(body, "utf8") > MAX_SOURCE_BYTES) throw new Error(SOURCE_ERROR);
  const documents: unknown[] = [];
  if (/^\s*[\[{]/.test(body)) { try { documents.push(JSON.parse(body)); } catch { /* HTML below may still have valid JSON-LD. */ } }
  const scripts = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = scripts.exec(body)) && documents.length < 30) { try { documents.push(JSON.parse(match[1])); } catch { /* A malformed block is not evidence. */ } }
  const found: Record<string, unknown>[] = [];
  let visited = 0;
  const walk = (value: unknown, depth = 0): void => {
    if (depth > 10 || ++visited > 10000) return;
    if (Array.isArray(value)) { value.forEach(item => walk(item, depth + 1)); return; }
    const node = record(value); if (!node) return;
    const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
    if (types.some(type => /(?:^|[/#])[A-Za-z]*Event$/.test(text(type)))) found.push(node);
    Object.values(node).forEach(item => { if (item !== null && typeof item === "object") walk(item, depth + 1); });
  };
  documents.forEach(document => walk(document));
  const unique = new Map(found.map(node => [JSON.stringify([node.name, node.startDate, node.endDate, node.location]), node]));
  return Array.from(unique.values());
}

const REGION_TIMEZONES: Record<string, string> = {
  ac: "America/Rio_Branco", acre: "America/Rio_Branco", am: "America/Manaus", amazonas: "America/Manaus",
  rr: "America/Boa_Vista", roraima: "America/Boa_Vista", ro: "America/Porto_Velho", rondonia: "America/Porto_Velho",
  mt: "America/Cuiaba", matogrosso: "America/Cuiaba", ms: "America/Campo_Grande", matogrossodosul: "America/Campo_Grande",
};
const BRAZIL_REGIONS = new Set(["al", "alagoas", "ap", "amapa", "ba", "bahia", "ce", "ceara", "df", "distritofederal", "es", "espiritosanto", "go", "goias", "ma", "maranhao", "mg", "minasgerais", "pa", "para", "pb", "paraiba", "pe", "pernambuco", "pi", "piaui", "pr", "parana", "rj", "riodejaneiro", "rn", "riograndedonorte", "rs", "riograndedosul", "sc", "santacatarina", "se", "sergipe", "sp", "saopaulo", "to", "tocantins"]);
function sourceTimezone(node: Record<string, unknown>, region: string, city: string): string {
  const schedule = record(Array.isArray(node.eventSchedule) ? node.eventSchedule[0] : node.eventSchedule);
  const specified = text(schedule?.scheduleTimezone);
  if (specified) { try { new Intl.DateTimeFormat("pt-BR", { timeZone: specified }); return specified; } catch { throw new Error(INCOMPLETE_ERROR); } }
  const key = normalized(region);
  if (REGION_TIMEZONES[key]) return REGION_TIMEZONES[key];
  if (BRAZIL_REGIONS.has(key) || normalized(city) === "saopaulo") return "America/Sao_Paulo";
  throw new Error("A fonte precisa permitir confirmar o fuso horário do evento.");
}
function localParts(value: Date, timezone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value);
  const get = (key: string) => parts.find(part => part.type === key)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** Facts come from the publisher's Event JSON-LD, not from model-generated prose. */
export function parseOfficialEvent(body: string, sourceUrl: string, requestedCity: string | undefined, now: Date): VerifiedEventImport {
  const canonical = canonicalSourceUrl(sourceUrl), nodes = eventNodes(body);
  const matching = nodes.filter(node => { try { return canonicalSourceUrl(text(node.url) || text(node["@id"])) === canonical; } catch { return false; } });
  const node = matching.length === 1 ? matching[0] : nodes.length === 1 ? nodes[0] : null;
  if (!node) throw new Error(nodes.length ? "A página contém vários eventos. Use uma fonte específica para um único evento." : INCOMPLETE_ERROR);
  if (/cancelled|postponed|onlineeventattendance/i.test(text(node.eventStatus) + " " + text(node.eventAttendanceMode))) throw new Error("A fonte não confirma um evento presencial com data vigente.");
  const name = plain(node.name), startRaw = text(node.startDate), endRaw = text(node.endDate);
  const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!name || name.length < 3 || name.length > 160 || !instant.test(startRaw) || !instant.test(endRaw)) throw new Error(INCOMPLETE_ERROR);
  for (const raw of [startRaw, endRaw]) {
    const calendar = new Date(raw.slice(0, 10));
    if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== raw.slice(0, 10)) throw new Error(INCOMPLETE_ERROR);
  }
  const start = new Date(startRaw), end = new Date(endRaw);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw new Error(INCOMPLETE_ERROR);
  if (start <= now || start.getTime() > now.getTime() + 730 * 86400000) throw new Error("O evento precisa ter uma data futura confirmada nos próximos dois anos.");
  const location = record(node.location), address = record(location?.address);
  const street = plain(address?.streetAddress), city = plain(address?.addressLocality), region = plain(address?.addressRegion);
  if (!street || !city || street.length < 3 || (requestedCity && normalized(requestedCity) !== normalized(city))) throw new Error("O endereço da fonte está incompleto ou não corresponde à cidade escolhida.");
  const country = text(address?.addressCountry) || text(record(address?.addressCountry)?.name);
  if (country && !["br", "brazil", "brasil"].includes(normalized(country))) throw new Error("A fonte precisa confirmar um endereço no Brasil.");
  const addressText = [street, city, region, plain(address?.postalCode)].filter(Boolean).join(", ");
  if (addressText.length > 500) throw new Error(INCOMPLETE_ERROR);
  const timezone = sourceTimezone(node, region, city), from = localParts(start, timezone), to = localParts(end, timezone);
  const offer = record(Array.isArray(node.offers) ? node.offers[0] : node.offers);
  const rawPrice = typeof offer?.price === "number" ? String(offer.price) : text(offer?.price);
  const price = /^\d+(?:[.,]\d{1,2})?$/.test(rawPrice) ? Number(rawPrice.replace(",", ".")) : null;
  const isFree = node.isAccessibleForFree === true || price === 0;
  const priceCents = isFree ? 0 : price !== null && text(offer?.priceCurrency).toUpperCase() === "BRL" ? Math.round(price * 100) : 0;
  if (priceCents > 100000000) throw new Error(INCOMPLETE_ERROR);
  let banner = "/branding/eventmap-event-placeholder.svg";
  const image = Array.isArray(node.image) ? node.image[0] : node.image;
  try { banner = canonicalSourceUrl(text(image) || text(record(image)?.url)); } catch { /* Explicitly illustrative owned fallback, not an invented event photo. */ }
  const geo = record(location?.geo), latitude = Number(geo?.latitude), longitude = Number(geo?.longitude);
  const hasGeo = geo?.latitude != null && geo?.longitude != null && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  const types = (Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]]).map(text).join(" ");
  const category = /MusicEvent/.test(types) ? "Música" : /FoodEvent/.test(types) ? "Gastronomia" : /SportsEvent/.test(types) ? "Esportes" : /TheaterEvent/.test(types) ? "Teatro" : /ExhibitionEvent/.test(types) ? "Arte e cultura" : "Outros";
  const event = {
    nome: name, descricao: `${name}. Evento presencial em ${plain(location?.name) || city}. Consulte a fonte oficial para programação, ingressos e condições de participação.`,
    banner, carrossel: [], dataInicio: from.date, dataFim: to.date, linkParaCompra: canonical, endereco: addressText,
    category, isFree, priceCents, timezone, startTime: from.time, endTime: to.time, lat: hasGeo ? latitude : null, lng: hasGeo ? longitude : null,
  };
  return { sourceUrl: canonical, sourceHash: createHash("sha256").update(JSON.stringify(event)).digest("hex"), name, startDate: start.toISOString(), address: addressText, event };
}

/** Links are data only. Never execute the publisher's scripts, including Next hydration. */
export function publicEventLinks(body: string, catalogUrl: string): string[] {
  if (Buffer.byteLength(body, "utf8") > MAX_SOURCE_BYTES) throw new Error(SOURCE_ERROR);
  const links = new Set<string>();
  const pattern = /https:\/\/(?:www\.)?sympla\.com\.br\/evento\/[^\s"'<>\\]+/gi;
  for (let match = pattern.exec(body); match; match = pattern.exec(body)) {
    try {
      const url = new URL(canonicalSourceUrl(match[0].replace(/&amp;/g, "&")), catalogUrl);
      // Tracking does not identify an event; only the published numeric event ID does.
      if (!/^\/evento\/[^/]+\/\d+\/?$/.test(url.pathname)) continue;
      url.search = ""; links.add(url.toString());
      if (links.size === 24) break;
    } catch { /* Not a specific allowed event page. */ }
  }
  return Array.from(links);
}

/** Publisher-specific public JSON adapter. Require explicit ISO instants and admission facts. */
export function parsePublicEvent(body: string, sourceUrl: string, city: string | undefined, now: Date): VerifiedEventImport {
  const canonical = canonicalSourceUrl(sourceUrl), host = new URL(canonical).hostname;
  const script = /<script\b(?=[^>]*\bid=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script\s*>/i.exec(body);
  if (!(host === "www.sympla.com.br" || host === "sympla.com.br") || !script) return parseOfficialEvent(body, canonical, city, now);
  let root: Record<string, unknown> | null;
  try { root = record(JSON.parse(script[1])); } catch { throw new Error(INCOMPLETE_ERROR); }
  const hydration = record(record(record(root?.props)?.pageProps)?.hydrationData);
  const event = record(record(hydration?.eventHydration)?.event);
  if (!event) return parseOfficialEvent(body, canonical, city, now);
  if (event.published !== true || event.cancelled === true || event.privateEvent === true || event.onlineInfo) throw new Error("A fonte não confirma um evento público presencial vigente.");
  if (canonicalSourceUrl(text(event.newUrl)) !== canonical || !canonical.endsWith("/" + String(event.id))) throw new Error(INCOMPLETE_ERROR);
  const address = record(event.eventsAddress);
  const free = event.paymentEventType === "free" || event.paymentEventType === "unpaid";
  const description = plain(event.detail || event.strippedDetail);
  const matches = description.matchAll(/\b(?:ingressos?|entrada)\s*[:–-]\s*R\$\s*(\d+(?:\.\d{3})*(?:,\d{2})?)(?![\d,.])/gi);
  const prices = new Set(Array.from(matches, match => Number(match[1].replace(/\./g, "").replace(",", "."))));
  const price = prices.size === 1 ? prices.values().next().value ?? 0 : 0;
  if (!free && (event.paymentEventType !== "paid" || price <= 0 || price > 1000000)) {
    throw new Error("A fonte não informa um preço de ingresso verificável.");
  }
  const node = {
    "@type": "Event", name: event.name, url: canonical,
    startDate: record(event.startDateMultiFormat)?.ISO8601,
    endDate: record(event.endDateMultiFormat)?.ISO8601,
    image: event.logoUrl, isAccessibleForFree: free,
    offers: free ? { price: "0", priceCurrency: "BRL" } : { price: String(price), priceCurrency: "BRL" },
    location: { name: address?.name, geo: address?.geolocation, address: {
      streetAddress: [text(address?.address), text(address?.addressNum)].filter(Boolean).join(", "),
      addressLocality: address?.city, addressRegion: address?.state, postalCode: address?.zipCode,
      addressCountry: address?.country,
    } },
  };
  return parseOfficialEvent(JSON.stringify(node), canonical, city, now);
}

export function createAiEventProvider(dependencies: ProviderDependencies = {}) {
  const now = dependencies.now ?? (() => new Date());
  const readSource = dependencies.readSource ?? readOfficialSource;
  async function inspect(url: string, city?: string): Promise<VerifiedEventImport> {
    const canonical = canonicalSourceUrl(url);
    let source: SourceDocument;
    try { source = await readSource(canonical); } catch { throw new Error(SOURCE_ERROR); }
    return parsePublicEvent(source.body, canonicalSourceUrl(source.url), city, now());
  }
  return {
    // Compatibility with the existing API. Public catalogs require no credentials.
    aiConfigured: () => true,
    async discoverEventSources(city: string, max: number, alreadyKnown?: (url: string) => Promise<boolean>): Promise<string[]> {
      const limit = Math.min(5, Math.max(1, Math.floor(max)));
      const catalog = publicCatalogUrl(city);
      const verified = new Set<string>();
      const visited = new Set<string>();
      const deadline = Date.now() + 45_000;
      let inspected = 0;
      for (let page = 1; page <= 4 && Date.now() < deadline; page++) {
        const pageUrl = page === 1 ? catalog : catalog + "?page=" + page;
        let document: SourceDocument;
        try { document = await readSource(pageUrl); }
        catch (error) {
          if (page === 1) throw error;
          break;
        }
        const links = publicEventLinks(document.body, document.url).filter(url => !visited.has(url));
        if (!links.length) break;
        for (const url of links) {
          if (inspected >= 32 || Date.now() >= deadline) return Array.from(verified);
          visited.add(url);
          if (await alreadyKnown?.(url)) continue;
          inspected++;
          let event: VerifiedEventImport;
          try { event = await inspect(url, city); }
          catch { continue; }
          if (!(await alreadyKnown?.(event.sourceUrl))) verified.add(event.sourceUrl);
          if (verified.size >= limit) return Array.from(verified);
        }
      }
      if (!visited.size) throw new Error("O catálogo público não forneceu links de eventos verificáveis.");
      return Array.from(verified);
    },
    inspectEventSource: inspect,
  };
}
const provider = createAiEventProvider();
export const aiConfigured = provider.aiConfigured;
export const discoverEventSources = provider.discoverEventSources;
export const inspectEventSource = provider.inspectEventSource;
