import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAdminId } from "@/lib/adminAuth";
import prisma from "@/lib/prisma";
import { publicEventSelect } from "@/lib/eventQueries";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    if (!await getAuthenticatedAdminId(request)) return NextResponse.json({ message: "Acesso negado." }, { status: 403 });
    const events = await prisma.events.findMany({
      where: { status: { not: "DRAFT" } },
      select: { ...publicEventSelect, reviewNote: true, moderations: { orderBy: { createdAt: "desc" }, take: 1, select: { verdict: true, trust: true, reasons: true, aiUsed: true, createdAt: true } } },
      orderBy: { updatedAt: "desc" },
    });
    // Latest automatic triage only; reasons are plain strings written by the triage.
    return NextResponse.json(events.map(({ moderations, ...event }) => {
      const latest = moderations[0];
      return { ...event, triage: latest ? { verdict: latest.verdict, trust: latest.trust, reasons: Array.isArray(latest.reasons) ? latest.reasons.filter((reason): reason is string => typeof reason === "string") : [], aiUsed: latest.aiUsed, createdAt: latest.createdAt.toISOString() } : null };
    }));
  } catch { return NextResponse.json({ message: "Não foi possível carregar eventos." }, { status: 503 }); }
}
