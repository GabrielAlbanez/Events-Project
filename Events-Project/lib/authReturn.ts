/** Accept only same-site paths; never turn a query parameter into an open redirect. */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || value.length > 2048 || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const decoded = decodeURIComponent(value);
    if (/[\\\u0000-\u0020\u007f]/.test(decoded) || decoded.startsWith("//")) return "/";
    const url = new URL(value, "https://eventmap.invalid");
    const pathname = decodeURIComponent(url.pathname);
    if (url.origin !== "https://eventmap.invalid" || /^\/(?:login|register|api)(?:\/|$)/i.test(pathname)) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}

export function authPathWithReturn(path: "/login" | "/register", callbackUrl: string): string {
  const target = safeReturnPath(callbackUrl);
  return target === "/" ? path : `${path}?${new URLSearchParams({ callbackUrl: target })}`;
}
