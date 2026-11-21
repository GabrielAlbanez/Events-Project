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

// The event share image (opengraph-image) is public: link-preview crawlers are anonymous and it only renders public events.
export function isPublicPath(pathname: string): boolean {
  return publicRoutes.includes(pathname) || ["/recuperar-senha", "/redefinir-senha", "/confirmar-email"].includes(pathname) || /^\/eventos\/[^/]+(?:\/comunidade|\/opengraph-image(?:\/[^/]+)?)?$/.test(pathname);
}

export function canAccessPath(role: string, pathname: string): boolean {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return role === "ADMIN";
  // Event team members (CommunityTeamMember) may be BASIC; the check-in API enforces owner/team/admin.
  if (/^\/myEvents\/[^/]+\/checkin$/.test(pathname)) return role === "BASIC" || role === "PROMOTER" || role === "ADMIN";
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
  // Paid highlight orders: the page and its actions also enforce event ownership.
  if (/^\/myEvents\/[^/]+\/destaque$/.test(pathname)) return role === "PROMOTER" || role === "ADMIN";
  // Ticket sales: organizers connect Mercado Pago and see sales; every signed-in user can see the tickets they bought.
  if (pathname === "/myEvents/pagamentos") return role === "PROMOTER" || role === "ADMIN";
  if (pathname === "/ingressos") return role === "BASIC" || role === "PROMOTER" || role === "ADMIN";
  if (/^\/eventos\/[^/]+\/editar$/.test(pathname)) {
    return role === "PROMOTER" || role === "ADMIN";
  }
  return roleRoutes[role]?.includes(pathname) ?? false;
}
