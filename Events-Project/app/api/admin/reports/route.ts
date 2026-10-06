import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAdminId } from "@/lib/adminAuth";
import { listEventReports } from "@/lib/services/eventReports";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!await getAuthenticatedAdminId(request)) return NextResponse.json({ message: "Acesso negado." }, { status: 403 });
  try {
    return NextResponse.json({ reports: await listEventReports() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "Não foi possível carregar denúncias." }, { status: 503 });
  }
}
