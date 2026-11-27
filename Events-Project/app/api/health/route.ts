import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthenticatedAdminId } from "@/lib/adminAuth";
import { ticketPaymentsConfigured } from "@/lib/ticketSecurity";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DB_TIMEOUT_MS = 3000;

/**
 * `payments` only says whether ticket payments are configured (no variable names or values) and is
 * included for authenticated admins only.
 */
type HealthResponse = { status: "ok" | "degraded"; db: "ok" | "error"; payments?: boolean; time: string };

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

async function isAdminRequest(request: NextRequest): Promise<boolean> {
  try {
    return Boolean(await getAuthenticatedAdminId(request));
  } catch {
    // Auth problems never break the probe; the caller simply gets the public view.
    return false;
  }
}

/** Public liveness/readiness probe: cheap DB ping, no caching, no sensitive details. */
export async function GET(request: NextRequest) {
  const [dbOk, isAdmin] = await Promise.all([pingDatabase(), isAdminRequest(request)]);
  const body: HealthResponse = {
    status: dbOk ? "ok" : "degraded",
    db: dbOk ? "ok" : "error",
    ...(isAdmin ? { payments: ticketPaymentsConfigured() } : {}),
    time: new Date().toISOString(),
  };
  return NextResponse.json(body, {
    status: dbOk ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
