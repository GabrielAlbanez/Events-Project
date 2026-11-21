/**
 * Normalizes event artwork references returned by the public catalog.
 * Pure and dependency-free so it can run on the server, in the browser and in offline checks.
 *
 * - trims whitespace and removes empty values;
 * - keeps same-site paths ("/uploads/...", "/branding/...") untouched;
 * - upgrades protocol-relative URLs ("//cdn...") to https;
 * - rewrites legacy uploads saved with a private development origin
 *   ("http://localhost:3000/uploads/<id>.jpg") to the portable "/uploads/<id>.jpg";
 * - discards anything that is not http(s), carries credentials or is not parseable.
 */
const privateHost = (hostname: string) =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" ||
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);
const legacyUpload = /^\/uploads\/([0-9a-f-]{36}|\d{13}-uploaded_image)\.(jpg|jpeg|png|webp|avif)$/i;

export function normalizeEventImageUrl(value: string | null | undefined): string {
  const source = typeof value === "string" ? value.trim() : "";
  if (!source || source.includes("\\")) return "";
  if (source.startsWith("/") && !source.startsWith("//")) return source;
  const absolute = source.startsWith("//") ? "https:" + source : source;
  if (!/^https?:\/\//i.test(absolute)) return "";
  try {
    const url = new URL(absolute);
    if (!url.hostname || url.username || url.password) return "";
    if (privateHost(url.hostname) && legacyUpload.test(url.pathname) && !url.search && !url.hash) return url.pathname;
    return absolute;
  } catch {
    return "";
  }
}

export function normalizeEventImages<T extends { banner: string; carrossel?: string[] }>(event: T): T {
  const banner = normalizeEventImageUrl(event.banner);
  if (!Array.isArray(event.carrossel)) return { ...event, banner };
  const carrossel = event.carrossel.map(normalizeEventImageUrl).filter(Boolean);
  return { ...event, banner, carrossel };
}
