/** Serve shared profile assets through this application's own origin. */
export function profileMediaUrl(src?: string | null): string | null {
  if (!src) return null;
  try {
    const url = new URL(src, 'https://profile.invalid');
    if (!['http:', 'https:'].includes(url.protocol) || url.search || url.hash) return src;
    const match = /^\/v1\/media\/profile\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(url.pathname);
    return match ? '/api/profile-media/' + match[1] : src;
  } catch { return src; }
}
