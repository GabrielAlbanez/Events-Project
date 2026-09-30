import { roles, roleRoutes, publicRoutes } from "@/roles";

interface SessionIdentity {
  id?: unknown;
  role?: unknown;
  provider?: unknown;
}

export function isDevelopmentIdentityDisabled(provider: unknown): boolean {
  return provider === "dev-admin" &&
    (process.env.NODE_ENV !== "development" || process.env.DEV_AUTO_LOGIN_ADMIN !== "true");
}

export function getSessionRole(identity: SessionIdentity | null): string {
  if (!identity || isDevelopmentIdentityDisabled(identity.provider)) return "GUEST";
  if (typeof identity.id !== "string" || !identity.id) return "GUEST";
  return typeof identity.role === "string" && identity.role in roles ? identity.role : "GUEST";
}

export function isPublicPath(pathname: string): boolean {
  return publicRoutes.includes(pathname) || /^\/eventos\/[^/]+$/.test(pathname);
}

export function canAccessPath(role: string, pathname: string): boolean {
  if (/^\/eventos\/[^/]+\/editar$/.test(pathname)) {
    return role === "PROMOTER" || role === "ADMIN";
  }
  return roleRoutes[role]?.includes(pathname) ?? false;
}
