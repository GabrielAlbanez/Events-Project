import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { endImpersonation, resolveImpersonationIdentity } from "@/lib/auth/impersonation";
import { readImpersonationToken, sameOrigin, writeImpersonationCookie } from "@/lib/auth/impersonationHttp";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  const token = await readImpersonationToken(request);
  if (!token) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  try {
    await endImpersonation(prisma, token);
    delete token.impersonationId;
    delete token.impersonationView;
    const identity = await resolveImpersonationIdentity(prisma, token);
    if (!identity.user) return NextResponse.json({ error: "Sessão original indisponível. Entre novamente." }, { status: 401 });
    token.effectiveUserId = identity.user.id;
    token.effectiveRole = identity.user.role;
    token.accountBlocked = false;
    const response = NextResponse.json({ ok: true, redirectTo: "/" });
    await writeImpersonationCookie(request, response, token);
    return response;
  } catch { return NextResponse.json({ error: "Não foi possível restaurar a sessão." }, { status: 503 }); }
}
