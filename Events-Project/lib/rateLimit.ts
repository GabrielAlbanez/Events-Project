import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";

/**
 * Persistent fixed-window rate limits for authentication flows.
 *
 * Counters are rows in the existing `VerificationToken` table (identifier
 * `auth-rate:<scope>:<kind>:<sha256>:<window>`), the same strategy already used by
 * password recovery. They are shared by every web instance (Vercel functions and the
 * socket server) without a new schema. Emails and IPs are stored only as hashes.
 *
 * Client buckets need a trustworthy IP. Proxy headers are read only when
 * TRUST_PROXY_IP=true; otherwise every request shares the "global" key.
 */
export type RateLimitScope = "login" | "register";
export type RateLimitBucket = { identifier: string; limit: number };
type RateLimitDb = Pick<Prisma.TransactionClient, "verificationToken" | "$executeRaw">;

export const RATE_LIMIT_PREFIX = "auth-rate:";
export const GLOBAL_CLIENT_KEY = "global";

export const RATE_LIMIT_POLICIES: Record<RateLimitScope, { windowMs: number; email: number; client: number; global: number | null }> = {
  // Failed logins only. No shared global bucket: one attacker must not lock everyone out.
  login: { windowMs: 15 * 60000, email: 10, client: 50, global: null },
  // Every registration attempt sends an e-mail, so the global bucket is a circuit breaker.
  register: { windowMs: 60 * 60000, email: 3, client: 10, global: 200 },
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

type HeaderSource = Headers | { get(name: string): string | null } | Record<string, unknown> | undefined | null;

function readHeader(source: HeaderSource, name: string): string | null {
  if (!source) return null;
  if (typeof (source as { get?: unknown }).get === "function") return (source as { get(name: string): string | null }).get(name);
  const value = (source as Record<string, unknown>)[name];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

/** Client identifier for rate limits; falls back to a shared key unless a trusted proxy sets the IP. */
export function clientKeyFromHeaders(source: HeaderSource): string {
  if (process.env.TRUST_PROXY_IP !== "true") return GLOBAL_CLIENT_KEY;
  const forwarded = readHeader(source, "x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || readHeader(source, "x-real-ip")?.trim();
  return ip ? ip.slice(0, 100) : GLOBAL_CLIENT_KEY;
}

/** Client key for server actions, which receive no request object. */
export async function requestClientKey(): Promise<string> {
  if (process.env.TRUST_PROXY_IP !== "true") return GLOBAL_CLIENT_KEY;
  try {
    const { headers } = await import("next/headers");
    return clientKeyFromHeaders(headers());
  } catch {
    return GLOBAL_CLIENT_KEY;
  }
}

export function rateLimitBuckets(scope: RateLimitScope, email: string, clientKey: string, now = new Date()): RateLimitBucket[] {
  const policy = RATE_LIMIT_POLICIES[scope];
  const window = Math.floor(now.getTime() / policy.windowMs);
  const buckets: RateLimitBucket[] = [{ identifier: `${RATE_LIMIT_PREFIX}${scope}:email:${sha256(normalizeEmail(email))}:${window}`, limit: policy.email }];
  if (clientKey !== GLOBAL_CLIENT_KEY) buckets.push({ identifier: `${RATE_LIMIT_PREFIX}${scope}:client:${sha256(clientKey)}:${window}`, limit: policy.client });
  else if (policy.global !== null) buckets.push({ identifier: `${RATE_LIMIT_PREFIX}${scope}:client:global:${window}`, limit: policy.global });
  // Stable order avoids advisory-lock deadlocks between concurrent requests.
  return buckets.sort((a, b) => a.identifier.localeCompare(b.identifier));
}

function windowEnd(scope: RateLimitScope, now: Date): Date {
  const { windowMs } = RATE_LIMIT_POLICIES[scope];
  return new Date((Math.floor(now.getTime() / windowMs) + 1) * windowMs);
}

async function countExceeded(db: RateLimitDb, buckets: RateLimitBucket[]): Promise<boolean> {
  for (const bucket of buckets) {
    if (await db.verificationToken.count({ where: { identifier: bucket.identifier } }) >= bucket.limit) return true;
  }
  return false;
}

async function insertHits(db: RateLimitDb, scope: RateLimitScope, buckets: RateLimitBucket[], now: Date): Promise<void> {
  const expires = windowEnd(scope, now);
  for (const bucket of buckets) {
    await db.verificationToken.create({ data: { identifier: bucket.identifier, token: `rate:${randomBytes(24).toString("hex")}`, expires } });
  }
  await db.verificationToken.deleteMany({ where: { identifier: { startsWith: RATE_LIMIT_PREFIX }, expires: { lt: now } } });
}

/**
 * Lock-free reservation for login attempts: the attempt is recorded BEFORE the password
 * check and then counted, so a burst of parallel requests cannot all pass a stale
 * read. Each request counts its own row, so at most `limit` admitted rows can coexist
 * in a bucket. Returns the reserved tokens, or null (rows removed) when limited.
 */
export async function reserveRateLimitHit(db: RateLimitDb, scope: RateLimitScope, buckets: RateLimitBucket[], now = new Date()): Promise<string[] | null> {
  const expires = windowEnd(scope, now);
  const tokens: string[] = [];
  try {
    for (const bucket of buckets) {
      const token = `rate:${randomBytes(24).toString("hex")}`;
      await db.verificationToken.create({ data: { identifier: bucket.identifier, token, expires } });
      tokens.push(token);
    }
    for (const bucket of buckets) {
      if (await db.verificationToken.count({ where: { identifier: bucket.identifier } }) > bucket.limit) {
        await releaseRateLimitHit(db, tokens);
        return null;
      }
    }
  } catch (error) {
    await releaseRateLimitHit(db, tokens).catch(() => undefined);
    throw error;
  }
  await db.verificationToken.deleteMany({ where: { identifier: { startsWith: RATE_LIMIT_PREFIX }, expires: { lt: now } } });
  return tokens;
}

/** Drops reserved rows of an attempt that must not count as a failure. */
export async function releaseRateLimitHit(db: RateLimitDb, tokens: string[]): Promise<void> {
  if (tokens.length) await db.verificationToken.deleteMany({ where: { token: { in: tokens } } });
}

/** Read-only check (kept for callers that only need to inspect a bucket). */
export async function isRateLimited(db: RateLimitDb, buckets: RateLimitBucket[]): Promise<boolean> {
  return countExceeded(db, buckets);
}

/** Records one failed attempt. Small overshoot under concurrency is acceptable for failures. */
export async function recordRateLimitHit(db: RateLimitDb, scope: RateLimitScope, buckets: RateLimitBucket[], now = new Date()): Promise<void> {
  await insertHits(db, scope, buckets, now);
}

/**
 * Atomic check-and-consume inside a transaction (advisory lock per bucket).
 * Returns false when any bucket is exhausted; nothing is recorded in that case.
 */
export async function consumeRateLimit(tx: RateLimitDb, scope: RateLimitScope, buckets: RateLimitBucket[], now = new Date()): Promise<boolean> {
  for (const bucket of buckets) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${bucket.identifier}, 0))`;
  if (await countExceeded(tx, buckets)) return false;
  await insertHits(tx, scope, buckets, now);
  return true;
}

/** Forget failed logins for an e-mail after a successful sign-in. */
export async function clearRateLimit(db: RateLimitDb, buckets: RateLimitBucket[]): Promise<void> {
  const emailBuckets = buckets.filter(bucket => bucket.identifier.includes(":email:")).map(bucket => bucket.identifier);
  if (emailBuckets.length) await db.verificationToken.deleteMany({ where: { identifier: { in: emailBuckets } } });
}
