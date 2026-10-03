import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAdminId } from "@/lib/adminAuth";
import prisma from "@/lib/prisma";
import { publicEventSelect } from "@/lib/eventQueries";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    if (!await getAuthenticatedAdminId(request)) return NextResponse.json({ message: "Acesso negado." }, { status: 403 });
    return NextResponse.json(await prisma.events.findMany({
      where: { status: { not: "DRAFT" } },
      select: { ...publicEventSelect, reviewNote: true }, orderBy: { updatedAt: "desc" },
    }));
  } catch { return NextResponse.json({ message: "Não foi possível carregar eventos." }, { status: 503 }); }
}
