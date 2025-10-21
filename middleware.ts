import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { roles, roleRoutes, publicRoutes } from "./roles";

type Role = keyof typeof roles;

export async function middleware(req: NextRequest) {
  const token = await getToken({ req });
  const path = req.nextUrl.pathname.replace(/\/$/, ""); // remove barra no final

  console.log("Request Path:", path);
  console.log("Token:", token);

  // Role padrão
  const userRole: Role = (token?.role as Role) || roles.GUEST;
  console.log("User Role:", userRole);

  // Rota pública
  if (publicRoutes.includes(path)) {
    console.log("Public route:", path);
    return NextResponse.next();
  }

  // Bloqueia login/register para usuários autenticados
  if (["/login", "/register"].includes(path)) {
    if (userRole !== roles.GUEST) {
      console.log("Authenticated user trying to access guest-only route:", path);
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  // Usuário não autenticado → redireciona
  if (!token) {
    console.log("No token found, redirecting to login");
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Verifica rotas permitidas pela role
  const allowedRoutes = roleRoutes[userRole] || [];
  if (!allowedRoutes.includes(path)) {
    console.log("Access denied to route:", path);
    return NextResponse.redirect(new URL("/403", req.url)); // melhor UX
  }

  console.log("Access granted:", path);
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/admin/:path*",
    "/Profile/:path*",
    "/CriarEvento/:path*",
    "/myEvents/:path*",
    "/login",
    "/register",
  ],
};
