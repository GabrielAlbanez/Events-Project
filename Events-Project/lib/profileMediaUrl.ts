/** Resolve shared profile assets against the website, never a device-only API origin. */
export function profileMediaUrl(src?: string | null): string | null {
  const source = src?.trim();
  if (!source) return null;
  if (source.startsWith('blob:')) {
    try { return new URL(source).protocol === 'blob:' ? source : null; } catch { return null; }
  }
  try {
    const url = new URL(source, 'https://profile.invalid');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const match = /^\/v1\/media\/(profile|events)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(url.pathname);
    if (match && !url.search && !url.hash) return (match[1] === 'profile' ? '/api/profile-media/' : '/api/party-profile-media/') + match[2];
    if (source.startsWith('/') && !source.startsWith('//') && !source.includes('\\')) return source;
    if (!/^(https?:)?\/\//i.test(source)) return null;
    // Only migrate known legacy upload references from private development origins.
    const privateHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]' || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname);
    if (privateHost && /^\/uploads\/([0-9a-f-]{36}|\d{13}-uploaded_image)\.(jpg|png|webp|avif)$/i.test(url.pathname) && !url.search && !url.hash) return url.pathname;
    return source.startsWith('//') ? 'https:' + source : source;
  } catch { return null; }
}

export function profileImageIsOptimized(src: string): boolean {
  if (src.startsWith('/api/party-profile-media/')) return false;
  if (src.startsWith('/') && !src.startsWith('//')) return true;
  try {
    const url = new URL(src);
    return url.protocol === 'https:' && !url.port && ['lh3.googleusercontent.com', 'cdnb.artstation.com', 'pbs.twimg.com'].includes(url.hostname);
  } catch { return false; }
}
