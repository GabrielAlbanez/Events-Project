/** Only accept HTTPS photo hosts returned by Google; retain user-uploaded avatars. */
export function googleProfileImage(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /^lh\d+\.googleusercontent\.com$/.test(url.hostname)
      && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}

export function refreshedGoogleImage(current: string | null, incoming: unknown): string | null {
  if (current && !googleProfileImage(current)) return null;
  const image = googleProfileImage(incoming);
  return image && image !== current ? image : null;
}
