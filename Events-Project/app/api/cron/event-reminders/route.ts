import { NextRequest, NextResponse } from "next/server";
import { processDueEventReminders } from "@/lib/services/eventReminders";
import { verifyBearerSecret } from "@/lib/ticketSecurity";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };

/** Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET`. The response carries only counters. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret?.trim()) return NextResponse.json({ error: "not_configured" }, { status: 503, headers: noStore });
  if (!verifyBearerSecret(request.headers.get("authorization"), secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  try {
    return NextResponse.json(await processDueEventReminders(), { headers: noStore });
  } catch {
    console.warn("event-reminders-cron-failed");
    return NextResponse.json({ error: "failed" }, { status: 500, headers: noStore });
  }
}
