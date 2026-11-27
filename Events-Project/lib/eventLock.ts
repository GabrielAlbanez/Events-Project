import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

const ATTEMPTS = 5;
const RETRYABLE = new Set(["P2024", "P2028", "P2034"]);

/** Pool or transaction timeouts, write conflicts, and Postgres serialization failures or deadlocks behind a raw query. */
function isRetryable(error: unknown): boolean {
  const { code, meta, message } = (error ?? {}) as { code?: unknown; meta?: unknown; message?: unknown };
  if (typeof code !== "string") return false;
  if (RETRYABLE.has(code)) return true;
  return code === "P2010" && /\b(40001|40P01)\b/.test(`${String(message ?? "")}${JSON.stringify(meta ?? {})}`);
}

/**
 * Runs one seat-changing operation at a time per event. Under a rush, SERIALIZABLE transactions on the same event abort
 * each other and most people get an error; a transaction-scoped advisory lock makes them queue instead. The lock is
 * released on commit or rollback, works with transaction poolers, and never blocks other events.
 */
export async function withEventLock<T>(eventId: string, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const key = `event:${eventId}`;
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${key}::text, 0::bigint))`;
        return work(tx);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 20_000, timeout: 25_000 });
    } catch (error) {
      if (!isRetryable(error) || attempt >= ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * attempt + Math.random() * 150));
    }
  }
}
