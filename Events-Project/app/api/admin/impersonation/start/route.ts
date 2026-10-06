import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { endImpersonation, resolveImpersonationIdentity, startImpersonation } from "@/lib/auth/impersonation";
import { readImpersonationToken, sameOrigin, writeImpersonationCookie } from "@/lib/auth/impersonationHttp";
import { isIP } from "node:net";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  const token = await readImpersonationToken(request);
  if (!token) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  let createdSessionId: string | undefined;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !("userId" in body) || typeof body.userId !== "string" || body.userId.length > 100 || !("reason" in body) || typeof body.reason !== "string" || body.reason.trim().length < 5 || body.reason.trim().length > 500) return NextResponse.json({ error: "Informe a conta e uma justificativa entre 5 e 500 caracteres." }, { status: 400 });
    const address = request.ip ?? request.headers.get("x-eventmap-client-ip");
    const ip = address && isIP(address) ? address : null;
    const record = await startImpersonation(prisma, token, body.userId, ip, body.reason);
    createdSessionId = record.id;
    token.impersonationId = record.id;
    const identity = await resolveImpersonationIdentity(prisma, token);
    token.effectiveUserId = identity.user?.id ?? "";
    token.effectiveRole = identity.user?.role ?? null;
    const response = NextResponse.json({ ok: true, redirectTo: "/" });
    await writeImpersonationCookie(request, response, token);
    return response;
  } catch (error) {
    if (createdSessionId) await endImpersonation(prisma, { ...token, impersonationId: createdSessionId }).catch(() => undefined);
    const permitted = ["Saia da visualização atual primeiro.", "Acesso restrito ao administrador.", "Não é permitido acessar a própria conta.", "Essa conta não pode ser acessada.", "Essa conta já está sendo acessada."];
    const message = error instanceof Error && permitted.includes(error.message) ? error.message : "Não foi possível iniciar a visualização.";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}

