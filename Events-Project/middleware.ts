import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { canAccessPath, getSessionRole, isPublicPath } from "@/lib/authPolicy";

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request });
  const pathname = request.nextUrl.pathname;
  const role = getSessionRole(token ? { id: token.impersonationId ? token.effectiveUserId : token.id, role: token.impersonationId ? token.effectiveRole : token.role, provider: token.provider } : null);

  if (isPublicPath(pathname)) return NextResponse.next();

  if (pathname === "/login" || pathname === "/register") {
    return role === "GUEST"
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/", request.url));
  }

  if (role === "GUEST") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return canAccessPath(role, pathname)
    ? NextResponse.next()
    : NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/admin", "/admin/conexoes-denuncias", "/admin/auditoria", "/Profile", "/CriarEvento", "/myEvents", "/resultados", "/salvos", "/notificacoes", "/atividade", "/salas/:path*", "/eventos/:path*", "/login", "/register"],
};
