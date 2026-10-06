import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthenticatedAdminId } from "@/lib/adminAuth";
import { getImpersonationAudit } from "@/lib/services/impersonationAudit";
import { SuspensionError } from "@/lib/services/userSuspension";
export async function GET(request: NextRequest) {
  const adminId = await getAuthenticatedAdminId(request);
  if (!adminId) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  try { return NextResponse.json(await getImpersonationAudit(prisma, adminId, request.nextUrl.searchParams), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return NextResponse.json({ error: error instanceof SuspensionError ? error.message : "Não foi possível consultar a auditoria." }, { status: error instanceof SuspensionError ? error.status : 500 }); }
}
