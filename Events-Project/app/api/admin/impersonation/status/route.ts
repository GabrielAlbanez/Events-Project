import { NextRequest, NextResponse } from "next/server";
import { impersonationStatus } from "@/lib/auth/impersonationHttp";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try { return await impersonationStatus(request); }
  catch { return NextResponse.json({ error: "Não foi possível verificar a sessão." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
