import { encode, getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import { isAllowedRequestOrigin } from "@/lib/publicUrl";
import { credentialSessionValid, credentialStamp } from "@/lib/auth/sessionCredential";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  if (!isAllowedRequestOrigin(request, true)) return new NextResponse(null, { status: 403 });

  const secret = process.env.SOCKET_TICKET_SECRET;
  if (!secret) return new NextResponse(null, { status: 503 });

  const token = await getToken({ req: request });
  const headers = { "Cache-Control": "no-store" };
  if (!token || typeof token.id !== "string" || token.provider === "dev-admin") {
    return new NextResponse(null, { status: 204, headers });
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof token.exp !== "number" || token.exp <= now) {
    return new NextResponse(null, { status: 401, headers });
  }

  let socketCredentialStamp: string | null = null;
  if (token.provider === "credentials") {
    const user = await prisma.user.findUnique({
      where: { id: token.id },
      select: { password: true },
    });
    if (!credentialSessionValid(token.provider, token.credentialStamp, user?.password)) {
      return new NextResponse(null, { status: 401, headers });
    }
    socketCredentialStamp = credentialStamp(user?.password, secret);
  }

  const ticket = await encode({
    secret,
    maxAge: Math.min(60, token.exp - now),
    token: {
      id: token.id,
      provider: token.provider,
      sessionVersion: token.sessionVersion,
      credentialStamp: socketCredentialStamp,
      impersonationId: token.impersonationId,
      effectiveUserId: token.effectiveUserId,
      effectiveRole: token.effectiveRole,
      socketSessionExp: token.exp,
    },
  });
  return NextResponse.json({ ticket }, { headers });
}
