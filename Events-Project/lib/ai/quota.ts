import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";

/**
 * Fixed-window limits for Gemini features, so one person (or a bot) cannot spend the
 * free-tier quota. Rows live in `VerificationToken` (same strategy as lib/rateLimit.ts),
 * identifiers hold only hashes. A small overshoot under concurrency is acceptable here.
 */
type QuotaDb = Pick<Prisma.TransactionClient, "verificationToken">;
export type AiFeature = "draft" | "promo" | "tips" | "search" | "summary";
export interface AiLimit { perKey: number; perKeyWindowMs: number; global: number; globalWindowMs: number }

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
export const AI_LIMITS: Record<AiFeature, AiLimit> = {
  draft: { perKey: 15, perKeyWindowMs: HOUR, global: 300, globalWindowMs: DAY },
  promo: { perKey: 15, perKeyWindowMs: HOUR, global: 300, globalWindowMs: DAY },
  tips: { perKey: 20, perKeyWindowMs: HOUR, global: 300, globalWindowMs: DAY },
  search: { perKey: 20, perKeyWindowMs: HOUR, global: 400, globalWindowMs: DAY },
  summary: { perKey: 1_000_000, perKeyWindowMs: HOUR, global: 300, globalWindowMs: DAY },
};
export const AI_QUOTA_PREFIX = "ai-rate:";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const windowStart = (now: Date, size: number) => Math.floor(now.getTime() / size) * size;

/** Consumes one use. Returns false (and records nothing) when the person or the whole feature is over the limit. */
export async function consumeAiQuota(db: QuotaDb, feature: AiFeature, key: string, now = new Date(), limits: AiLimit = AI_LIMITS[feature]): Promise<boolean> {
  const buckets = [
    { identifier: `${AI_QUOTA_PREFIX}${feature}:k:${sha256(key)}:${windowStart(now, limits.perKeyWindowMs)}`, limit: limits.perKey, expires: new Date(windowStart(now, limits.perKeyWindowMs) + limits.perKeyWindowMs) },
    { identifier: `${AI_QUOTA_PREFIX}${feature}:g:${windowStart(now, limits.globalWindowMs)}`, limit: limits.global, expires: new Date(windowStart(now, limits.globalWindowMs) + limits.globalWindowMs) },
  ];
  for (const bucket of buckets) {
    if (await db.verificationToken.count({ where: { identifier: bucket.identifier } }) >= bucket.limit) return false;
  }
  for (const bucket of buckets) {
    await db.verificationToken.create({ data: { identifier: bucket.identifier, token: `ai:${randomBytes(24).toString("hex")}`, expires: bucket.expires } });
  }
  await db.verificationToken.deleteMany({ where: { identifier: { startsWith: AI_QUOTA_PREFIX }, expires: { lt: now } } }).catch(() => undefined);
  return true;
}
