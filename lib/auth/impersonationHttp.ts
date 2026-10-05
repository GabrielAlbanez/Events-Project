import { encode, getToken, type JWT } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveImpersonationIdentity } from "@/lib/auth/impersonation";

export function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (origin === request.nextUrl.origin) return true;
  // A tunnel changes the browser origin; only trust the configured public URL.
  const publicUrl = process.env.NEXTAUTH_URL;
  if (!publicUrl) return false;
  try {
    return origin === new URL(publicUrl).origin;
  } catch {
    return false;
  }
}

export async function readImpersonationToken(request: NextRequest) {
  return getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
}

export async function writeImpersonationCookie(request: NextRequest, response: NextResponse, token: JWT) {
  const secure = process.env.NEXTAUTH_URL?.startsWith("https://") ?? request.nextUrl.protocol === "https:";
  const name = secure ? "__Secure-next-auth.session-token" : "next-auth.session-token";
  const remaining = typeof token.exp === "number" ? Math.floor(token.exp - Date.now() / 1000) : 180;
  if (remaining <= 0) throw new Error("Sessão expirada. Entre novamente.");
  const maxAge = remaining;
  const value = await encode({ token, secret: process.env.NEXTAUTH_SECRET!, maxAge });
  // Clear stale NextAuth chunks before writing the replacement encrypted cookie.
  for (const cookie of request.cookies.getAll()) if (cookie.name === name || cookie.name.startsWith(name + ".")) response.cookies.set(cookie.name, "", { maxAge: 0, path: "/", httpOnly: true, secure, sameSite: "lax" });
  const chunkSize = 3800;
  for (let offset = 0; offset < value.length; offset += chunkSize) response.cookies.set(value.length > chunkSize ? `${name}.${offset / chunkSize}` : name, value.slice(offset, offset + chunkSize), { maxAge, path: "/", httpOnly: true, secure, sameSite: "lax" });
  response.headers.set("Cache-Control", "no-store");
}

export async function impersonationStatus(request: NextRequest) {
  const token = await readImpersonationToken(request);
  if (!token) return NextResponse.json({ blocked: false, impersonation: null, restoreRequired: false }, { headers: { "Cache-Control": "no-store" } });
  const identity = await resolveImpersonationIdentity(prisma, token);
  const restoreRequired = Boolean(token.impersonationId && !identity.impersonation && identity.user);
  const response = NextResponse.json({ blocked: identity.blocked, impersonation: identity.impersonation ? { userName: identity.impersonation.userName, expiresAt: identity.impersonation.expiresAt } : null, restoreRequired }, { headers: { "Cache-Control": "no-store" } });
  if (restoreRequired && identity.user) {
    delete token.impersonationId;
    delete token.impersonationView;
    token.effectiveUserId = identity.user.id;
    token.effectiveRole = identity.user.role;
    token.accountBlocked = false;
    await writeImpersonationCookie(request, response, token);
  }
  return response;
}
