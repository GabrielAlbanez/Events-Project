import { MobileAuthError } from './auth-service';
import type { AccessToken, LoginResult } from './auth-service';
import type {
  PostgresAdminService,
} from './admin-service';
import type { VerifiedImpersonationToken } from './impersonation-token';
import type { Role } from './auth-service';

interface AuthUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: Role;
  emailVerified: boolean | null;
  provider: 'credentials' | 'google';
}

export interface MobileRequestIdentity {
  user: AuthUser;
  impersonation: {
    id: string;
    adminId: string;
    adminName: string | null;
    userName: string | null;
    expiresAt: string;
  } | null;
}

export interface AdminRouteInput {
  method: string;
  path: string;
  authorization?: string | null;
  body?: unknown;
  ip?: string | null;
}

export interface AdminRouteResponse {
  status: number;
  body: { data: unknown } | { message: string };
}

export interface AdminRouteDependencies {
  service: PostgresAdminService;
  auth: { currentUser(token: string): Promise<AuthUser> };
  accessToken: AccessToken;
  impersonationTokens: {
    verify(token: string, allowExpiredForRestore?: boolean): VerifiedImpersonationToken;
  };
}

const roleNames = new Set(['BASIC', 'PROMOTER', 'ADMIN']);

function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MobileAuthError(400, 'Solicitação inválida.');
  }
  return value as Record<string, unknown>;
}

function pathId(value: string): string {
  try {
    const result = decodeURIComponent(value);
    if (!result || /[\/\\\u0000]/.test(result)) throw new Error('bad id');
    return result;
  } catch {
    throw new MobileAuthError(404, 'Recurso não encontrado.');
  }
}

function parsePage(value: string | null): number | undefined {
  if (value === null || value === '') return undefined;
  if (!/^\d{1,6}$/.test(value)) throw new MobileAuthError(400, 'Página inválida.');
  const page = Number(value);
  if (page < 1) throw new MobileAuthError(400, 'Página inválida.');
  return page;
}

function bearer(value: string | null | undefined): string {
  if (!value || value.length > 9000 || !/^Bearer [^\s]+$/i.test(value)) {
    throw new MobileAuthError(401, 'Entre na sua conta para continuar.');
  }
  return value.slice(7);
}

function roleFilter(value: string | null): Role | '' | undefined {
  if (!value) return undefined;
  if (!roleNames.has(value)) throw new MobileAuthError(400, 'Permissão inválida.');
  return value as Role;
}

function reportStatusFilter(value: string | null): 'PENDING' | 'RESOLVED' | 'DISMISSED' | undefined {
  if (!value) return undefined;
  if (value !== 'PENDING' && value !== 'RESOLVED' && value !== 'DISMISSED') {
    throw new MobileAuthError(400, 'Status de denúncia inválido.');
  }
  return value;
}

async function standardAdmin(
  token: string,
  dependencies: AdminRouteDependencies,
): Promise<AuthUser> {
  const identity = await resolveMobileIdentity(token, dependencies);
  if (identity.impersonation || identity.user.role !== 'ADMIN') {
    throw new MobileAuthError(403, 'Esta operação é reservada a administradores.');
  }
  return identity.user;
}

/**
 * Resolves either an ordinary bearer or an active, DB-backed support bearer.
 * Use this from protected mobile routes when adding impersonation support.
 */
export async function resolveMobileIdentity(
  token: string,
  dependencies: AdminRouteDependencies,
): Promise<MobileRequestIdentity> {
  let ordinaryClaims: ReturnType<AccessToken['verify']> | null = null;
  try {
    ordinaryClaims = dependencies.accessToken.verify(token);
  } catch {
    ordinaryClaims = null;
  }
  if (ordinaryClaims) {
    const user = await dependencies.auth.currentUser(token);
    if (user.id !== ordinaryClaims.subject) {
      throw new MobileAuthError(401, 'Sua sessão foi encerrada. Entre novamente.');
    }
    return { user, impersonation: null };
  }
  const claims = await impersonationClaims(token, dependencies, false);
  const valid = await dependencies.service.validateImpersonationToken(claims);
  return {
    user: valid.user as AuthUser,
    impersonation: {
      id: valid.id,
      adminId: valid.adminId,
      adminName: valid.adminName,
      userName: valid.userName,
      expiresAt: valid.expiresAt,
    },
  };
}

async function impersonationClaims(
  token: string,
  dependencies: AdminRouteDependencies,
  allowExpired: boolean,
): Promise<VerifiedImpersonationToken> {
  try {
    return dependencies.impersonationTokens.verify(token, allowExpired);
  } catch {
    throw new MobileAuthError(401, 'Sessão de suporte inválida ou expirada.');
  }
}

function success(data: unknown, status = 200): AdminRouteResponse {
  return { status, body: { data } };
}

function adminPath(path: string): boolean {
  return path === '/admin/users'
    || path.startsWith('/admin/users/')
    || path === '/admin/events'
    || path.startsWith('/admin/events/')
    || path === '/admin/reports'
    || path.startsWith('/admin/reports/')
    || path === '/admin/party-reports'
    || path === '/admin/impersonation/audit'
    || path.startsWith('/admin/impersonation/');
}

/**
 * Standalone dispatcher for the mobile admin URLs. Mount before shared middleware
 * that calls MobileAuthService.currentUser, because it intentionally does not
 * accept the distinct, short-lived impersonation token.
 */
export function createAdminRouteHandler(dependencies: AdminRouteDependencies) {
  return async (input: AdminRouteInput): Promise<AdminRouteResponse | null> => {
    let url: URL;
    try {
      url = new URL(input.path, 'http://mobile.local');
    } catch {
      return null;
    }
    const path = url.pathname;
    if (!adminPath(path) && path !== '/history') return null;

    try {
      const token = bearer(input.authorization);
      const isStatus = input.method === 'GET' && path === '/admin/impersonation/status';
      const isEnd = input.method === 'POST' && path === '/admin/impersonation/end';

      if (isStatus || isEnd) {
        const claims = await impersonationClaims(token, dependencies, true);
        if (isEnd) {
          const result: LoginResult = await dependencies.service.endImpersonationWithToken(claims);
          return success(result);
        }
        const result = await dependencies.service.impersonationTokenStatus(claims);
        if (!result.restoreRequired) await dependencies.service.validateImpersonationToken(claims);
        return success(result);
      }

      if (path === '/admin/impersonation/start' && input.method === 'POST') {
        const admin = await standardAdmin(token, dependencies);
        const body = objectBody(input.body);
        return success(await dependencies.service.startImpersonation(
          admin.id,
          typeof body.userId === 'string' ? pathId(body.userId) : '',
          { reason: body.reason },
          { ip: input.ip },
          admin.provider,
        ));
      }

      const adminActor = await standardAdmin(token, dependencies);
      const page = parsePage(url.searchParams.get('page'));
      if (path === '/admin/users' && input.method === 'GET') {
        const role = roleFilter(url.searchParams.get('role'));
        return success(await dependencies.service.listUsers(
          adminActor.id,
          { page, q: url.searchParams.get('q') ?? undefined, role },
        ));
      }
      if (path === '/admin/events' && input.method === 'GET') {
        return success(await dependencies.service.listAdminEvents(adminActor.id));
      }
      if (path === '/admin/events' && input.method === 'DELETE') {
        return success(await dependencies.service.deleteEvents(
          adminActor.id,
          objectBody(input.body) as { ids: unknown },
        ));
      }
      if (path === '/admin/events/validate' && input.method === 'POST') {
        return success(await dependencies.service.validateEvents(
          adminActor.id,
          objectBody(input.body) as { ids: unknown },
        ));
      }
      const correction = path.match(/^\/admin\/events\/([^/]+)\/correction$/);
      if (correction && input.method === 'POST') {
        return success(await dependencies.service.requestEventCorrections(
          adminActor.id,
          pathId(correction[1]),
          objectBody(input.body) as { reason: unknown },
        ));
      }
      const userEvents = path.match(/^\/admin\/users\/([^/]+)\/events$/);
      if (userEvents && input.method === 'GET') {
        return success(await dependencies.service.userEvents(
          adminActor.id,
          pathId(userEvents[1]),
        ));
      }
      const role = path.match(/^\/admin\/users\/([^/]+)\/role$/);
      if (role && input.method === 'PATCH') {
        return success(await dependencies.service.updateUserRole(
          adminActor.id,
          pathId(role[1]),
          objectBody(input.body) as { role: unknown },
        ));
      }
      const suspension = path.match(/^\/admin\/users\/([^/]+)\/suspension$/);
      if (suspension && input.method === 'POST') {
        return success(await dependencies.service.setSuspension(
          adminActor.id,
          pathId(suspension[1]),
          objectBody(input.body) as { action: 'suspend' | 'resume'; reason: string; until?: string | null },
        ));
      }
      const user = path.match(/^\/admin\/users\/([^/]+)$/);
      if (user && input.method === 'DELETE') {
        return success(await dependencies.service.deleteUser(
          adminActor.id,
          pathId(user[1]),
        ));
      }
      if (path === '/admin/reports' && input.method === 'GET') {
        const status = reportStatusFilter(url.searchParams.get('status'));
        return success(await dependencies.service.listEventReports(
          adminActor.id,
          { page, status },
        ));
      }
      const report = path.match(/^\/admin\/reports\/([^/]+)$/);
      if (report && input.method === 'PATCH') {
        return success(await dependencies.service.reviewEventReport(
          adminActor.id,
          pathId(report[1]),
          objectBody(input.body) as { status: 'RESOLVED' | 'DISMISSED'; resolutionNote?: string },
        ));
      }
      if (path === '/admin/party-reports' && input.method === 'GET') {
        const status = reportStatusFilter(url.searchParams.get('status'));
        return success(await dependencies.service.listPartyReports(
          adminActor.id,
          { page, status },
        ));
      }
      if (path === '/admin/party-reports' && input.method === 'POST') {
        const body = objectBody(input.body);
        return success(await dependencies.service.reviewPartyReport(
          adminActor.id,
          typeof body.id === 'string' ? pathId(body.id) : '',
          { status: body.status },
        ));
      }
      if (path === '/history' && input.method === 'GET') {
        return success(await dependencies.service.listEventHistory(
          adminActor.id,
          {
            page,
            eventId: url.searchParams.get('eventId') ?? undefined,
            q: url.searchParams.get('q') ?? undefined,
          },
        ));
      }
      if (path === '/admin/impersonation/audit' && input.method === 'GET') {
        return success(await dependencies.service.listImpersonationAudit(
          adminActor.id,
          { page, q: url.searchParams.get('q') ?? undefined },
        ));
      }
      return { status: 405, body: { message: 'Método ou rota não disponível.' } };
    } catch (error) {
      if (error instanceof MobileAuthError) {
        return { status: error.status, body: { message: error.message } };
      }
      return { status: 500, body: { message: 'Não foi possível concluir esta operação.' } };
    }
  };
}
