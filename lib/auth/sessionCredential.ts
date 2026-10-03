import { createHmac, timingSafeEqual } from "node:crypto";

/** Only stored inside the encrypted JWT/socket metadata, never the public session. */
export function credentialStamp(passwordHash: string | null | undefined, secret = process.env.NEXTAUTH_SECRET): string | null {
  if (!passwordHash || !secret) return null;
  return createHmac("sha256", secret).update("eventmap-credential-session-v1\0").update(passwordHash).digest("hex");
}

export function credentialSessionValid(provider: unknown, stamp: unknown, passwordHash: string | null | undefined): boolean {
  if (provider !== "credentials") return true;
  const current = credentialStamp(passwordHash);
  if (!current || typeof stamp !== "string" || !/^[a-f0-9]{64}$/.test(stamp)) return false;
  return timingSafeEqual(Buffer.from(current, "hex"), Buffer.from(stamp, "hex"));
}
