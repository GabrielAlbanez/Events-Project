/** Runtime server configuration; never infer trusted domains from proxy headers. */
export function configuredPublicOrigin(): string | null {
  const value = process.env.NEXTAUTH_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.origin : null;
  } catch { return null; }
}

export function publicSiteUrl(): URL {
  const configured = configuredPublicOrigin();
  if (configured) return new URL(configured);
  if (process.env.NEXTAUTH_URL) throw new Error("INVALID_PUBLIC_URL");
  const fallback = new URL(process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000");
  if (!["http:", "https:"].includes(fallback.protocol) || fallback.username || fallback.password) throw new Error("INVALID_PUBLIC_URL");
  return new URL(fallback.origin);
}

export function isAllowedRequestOrigin(request: { headers: { get(name: string): string | null }; nextUrl: { origin: string } }, requireOrigin = false): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return !requireOrigin;
  return origin === request.nextUrl.origin || origin === configuredPublicOrigin();
}
