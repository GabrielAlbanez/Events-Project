import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { roles, roleRoutes, publicRoutes } from "./roles";

type Role = keyof typeof roles;

export async function middleware(req: NextRequest) {
  const token = await getToken({ req });
  const { pathname } = req.nextUrl;

  // Avoid logging token or sensitive auth artifacts
  console.log("Request Pathname:", pathname);

  // Define role como GUEST se não houver token
  const userRole: Role = (token?.role as Role) || roles.GUEST;
  console.log("User Role:", userRole);

  // Verifica se a rota é pública
  const isPublicRoute = publicRoutes.includes(pathname);

  // Se for uma rota pública, permite o acesso
  if (isPublicRoute) {
    console.log("Public route accessed:", pathname);
    return NextResponse.next();
  }

  // Verifica se é uma rota restrita a GUEST
  if (pathname === "/login" || pathname === "/register") {
    if (userRole !== roles.GUEST) {
      console.log("Authenticated user trying to access GUEST-only route:", pathname);
      return NextResponse.redirect(new URL("/", req.url));
    }
    console.log("GUEST accessing allowed route:", pathname);
    return NextResponse.next();
  }

  // Se o token estiver ausente, redireciona para /login
  if (!token) {
    console.log("No token found, redirecting to login");
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Busca as rotas permitidas com base na role
  const allowedRoutes = roleRoutes[userRole] || [];
  console.log("Allowed Routes for Role:", allowedRoutes);

  // Redireciona para a página inicial se a rota não for permitida
  if (!allowedRoutes.includes(pathname)) {
    console.log("Access denied to route:", pathname);
    return NextResponse.redirect(new URL("/", req.url));
  }

  console.log("Access granted to route:", pathname);
  return NextResponse.next();
}

export const config = {
  // Limit middleware to protected application routes only; avoid applying on static/assets
  matcher: ["/admin", "/Profile", "/CriarEvento", "/myEvents", "/login", "/register"],
};
