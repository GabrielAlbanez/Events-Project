import { NextRequest, NextResponse } from "next/server";
import { reconcileRecentTicketOrders } from "@/lib/services/tickets";
import { verifyBearerSecret } from "@/lib/ticketSecurity";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };

/**
 * Daily safety net for missed Mercado Pago webhooks (vercel.json). Vercel Cron calls it with
 * `Authorization: Bearer $CRON_SECRET`; anything else is refused. The response carries only counters.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret?.trim()) return NextResponse.json({ error: "not_configured" }, { status: 503, headers: noStore });
  if (!verifyBearerSecret(request.headers.get("authorization"), secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  try {
    const report = await reconcileRecentTicketOrders();
    return NextResponse.json(report, { headers: noStore });
  } catch {
    console.warn("ticket-reconcile-cron-failed");
    return NextResponse.json({ error: "failed" }, { status: 500, headers: noStore });
  }
}
