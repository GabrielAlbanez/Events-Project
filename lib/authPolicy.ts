import { roles, roleRoutes, publicRoutes } from "@/roles";

interface SessionIdentity {
  id?: unknown;
  role?: unknown;
  provider?: unknown;
}

export function isDevelopmentIdentityDisabled(provider: unknown): boolean {
  return provider === "dev-admin";
}

export function getSessionRole(identity: SessionIdentity | null): string {
  if (!identity || isDevelopmentIdentityDisabled(identity.provider)) return "GUEST";
  if (typeof identity.id !== "string" || !identity.id) return "GUEST";
  return typeof identity.role === "string" && identity.role in roles ? identity.role : "GUEST";
}

export function isPublicPath(pathname: string): boolean {
  return publicRoutes.includes(pathname) || /^\/eventos\/[^/]+(?:\/comunidade)?$/.test(pathname);
}

export function canAccessPath(role: string, pathname: string): boolean {
  if (pathname === "/admin/conexoes-denuncias") return role === "ADMIN";
  if (/^\/eventos\/[^/]+\/conexoes(?:\/[^/]+)?$/.test(pathname)) {
    return role === "BASIC" || role === "PROMOTER" || role === "ADMIN";
  }
  if (/^\/eventos\/[^/]+\/chat$/.test(pathname)) {
    return role === "BASIC" || role === "PROMOTER" || role === "ADMIN";
  }
  if (pathname === "/atividade") {
    return role === "BASIC" || role === "PROMOTER" || role === "ADMIN";
  }
  if (/^\/salas(?:\/[^/]+)?$/.test(pathname)) {
    return role === "BASIC" || role === "PROMOTER" || role === "ADMIN";
  }
  if (/^\/eventos\/[^/]+\/editar$/.test(pathname)) {
    return role === "PROMOTER" || role === "ADMIN";
  }
  return roleRoutes[role]?.includes(pathname) ?? false;
}
