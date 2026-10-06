import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthenticatedAdminId } from "@/lib/adminAuth";
import { sameOrigin } from "@/lib/auth/impersonationHttp";
import { changeUserSuspension, SuspensionError } from "@/lib/services/userSuspension";
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  const adminId = await getAuthenticatedAdminId(request);
  if (!adminId) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  try {
    const suspension = await changeUserSuspension(prisma, adminId, params.id, await request.json());
    return NextResponse.json({ ok: true, suspension }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof SuspensionError ? error.message : "Não foi possível alterar a suspensão." }, { status: error instanceof SuspensionError ? error.status : error instanceof SyntaxError ? 400 : 500 });
  }
}
