import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { eventSummaryWithAi } from "@/lib/ai/service";

export const dynamic = "force-dynamic";

/** 5. Three-line summary of a published event. Cached in the database per version of the text. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const summary = await eventSummaryWithAi(params.id, { db: prisma });
    return NextResponse.json({ summary }, { headers: { "Cache-Control": summary ? "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" : "no-store" } });
  } catch {
    console.warn("ai-summary", "status=error");
    return NextResponse.json({ summary: null }, { headers: { "Cache-Control": "no-store" } });
  }
}
