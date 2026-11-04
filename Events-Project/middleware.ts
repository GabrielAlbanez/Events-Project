import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { canAccessPath, getSessionRole, isPublicPath } from "@/lib/authPolicy";
import { authPathWithReturn } from "@/lib/authReturn";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // A JWT can outlive its account/session. Auth pages validate it on the server.
  if (pathname === "/login" || pathname === "/register") return NextResponse.next();
  const token = await getToken({ req: request });
  const role = getSessionRole(token ? { id: token.impersonationId ? token.effectiveUserId : token.id, role: token.impersonationId ? token.effectiveRole : token.role, provider: token.provider } : null);

  if (isPublicPath(pathname)) return NextResponse.next();

  if (role === "GUEST") {
    return NextResponse.redirect(new URL(authPathWithReturn("/login", pathname + request.nextUrl.search), request.url));
  }

  return canAccessPath(role, pathname)
    ? NextResponse.next()
    : NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/admin/:path*", "/Profile", "/perfil-conexoes", "/CriarEvento", "/myEvents/:path*", "/resultados", "/salvos", "/notificacoes", "/atividade", "/salas/:path*", "/eventos/:path*", "/login", "/register"],
};
