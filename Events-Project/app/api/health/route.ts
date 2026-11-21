import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DB_TIMEOUT_MS = 3000;

type HealthResponse = { status: "ok" | "degraded"; db: "ok" | "error"; time: string };

async function pingDatabase(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), DB_TIMEOUT_MS); });
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
    return true;
  } catch {
    // No driver message, host or connection string ever reaches the response or logs.
    console.warn("Health check: database unavailable.");
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Public liveness/readiness probe: cheap DB ping, no caching, no sensitive details. */
export async function GET() {
  const dbOk = await pingDatabase();
  const body: HealthResponse = { status: dbOk ? "ok" : "degraded", db: dbOk ? "ok" : "error", time: new Date().toISOString() };
  return NextResponse.json(body, {
    status: dbOk ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
