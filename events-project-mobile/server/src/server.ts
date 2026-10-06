import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { File as NodeFile } from 'node:buffer';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { NextRequest } from 'next/server';
import { decode, encode, type JWT } from 'next-auth/jwt';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import prisma from '@/lib/prisma';
import { isAccountSuspended, accountSessionValid } from '@/lib/auth/accountAccess';
import { credentialStamp, credentialSessionValid } from '@/lib/auth/sessionCredential';
import { resolveImpersonationIdentity, startImpersonation, endImpersonation } from '@/lib/auth/impersonation';
import { publicEventSelect, getPublicEvent } from '@/lib/eventQueries';
import * as favorites from '@/lib/services/favorites';
import * as notifications from '@/lib/services/notifications';
import * as promoters from '@/lib/services/promoters';
import * as events from '@/lib/services/events';
import { registerUser } from '@/lib/services/registration';
import { verifyEmailToken } from '@/lib/services/emailVerification';
import { resetDataProfile } from '@/lib/services/profile';
import { criarSerieRecorrente } from '@/lib/services/recurrence';
import { recurrenceInputSchema } from '@/lib/recurrence';
import { getAdminUsersPage } from '@/lib/services/adminPagination';
import { alterRoleUser, deleteUser } from '@/lib/services/userAdministration';
import { validateEvents } from '@/app/(actions)/validateEvents/action';
import { deleteEvents } from '@/app/(actions)/deleteEvents/action';
import { getRecentEventHistory, getEventHistory } from '@/app/(actions)/eventHistory/action';
import type { ResolveCurrentUser } from '@/lib/services/authContext';
import type { User } from '@/types';
import { routes, matchTemplate } from './routes';
import { withRequestHeaders } from './request-context';
import { impersonationToken } from './session-token';
import { EngagementWindow } from './engagement-window';

declare const __WEB_PROJECT_PATH__: string;
declare const __SERVER_ROOT__: string;
// Load only on the server, never into Expo. Existing process environment always wins.
loadEnv({ path: path.join(__SERVER_ROOT__, '.env'), quiet: true } as Parameters<typeof loadEnv>[0]);
loadEnv({ path: path.join(__WEB_PROJECT_PATH__, '.env.local'), quiet: true } as Parameters<typeof loadEnv>[0]);
loadEnv({ path: path.join(__WEB_PROJECT_PATH__, '.env'), quiet: true } as Parameters<typeof loadEnv>[0]);
process.chdir(__WEB_PROJECT_PATH__);
if (!globalThis.File) Object.defineProperty(globalThis, 'File', { value: NodeFile });
const secret = process.env.NEXTAUTH_SECRET;
if (!secret || secret.length < 32) throw new Error('Configure NEXTAUTH_SECRET com pelo menos 32 caracteres no servidor.');
if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL somente no servidor.');
const origin = new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000').origin;
const sessionSeconds = 60 * 60 * 24 * 7;
const oauth = new OAuth2Client();
const engagementWindow = new EngagementWindow();
const safeUserSelect = { id: true, name: true, email: true, image: true, role: true, emailVerified: true } as const;
class ApiError extends Error { constructor(readonly status: number, message: string) { super(message); } }
interface Identity { id: string; role: string; token: JWT; bearer: string; impersonation: ImpersonationView | null; }
interface ImpersonationView { id: string; adminId: string; adminName: string; userName: string; expiresAt: string; }
const loginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(72) }).strict();
const windows = new Map<string, { hits: number; until: number }>();
function throttle(key: string, maximum = 30): void {
  const now = Date.now();
  if (windows.size > 10000) for (const [entry, window] of windows) if (window.until < now) windows.delete(entry);
  const window = windows.get(key);
  if (!window || window.until < now) { windows.set(key, { hits: 1, until: now + 60000 }); return; }
  if (++window.hits > maximum) throw new ApiError(429, 'Aguarde um minuto antes de tentar novamente.');
}
async function bodyBytes(request: IncomingMessage, limit: number): Promise<Buffer> {
  if (Number(request.headers['content-length'] || 0) > limit) throw new ApiError(413, 'Arquivo ou solicitação muito grande.');
  const parts: Buffer[] = []; let size = 0;
  for await (const part of request) {
    const bytes = Buffer.isBuffer(part) ? part : Buffer.from(part as Uint8Array);
    size += bytes.length; if (size > limit) throw new ApiError(413, 'Arquivo ou solicitação muito grande.');
    parts.push(bytes);
  }
  return Buffer.concat(parts, size);
}
function json(bytes: Buffer): unknown {
  try { return JSON.parse(bytes.toString('utf8')) as unknown; } catch { throw new ApiError(400, 'Solicitação inválida.'); }
}
function checkedResult(value: unknown): unknown {
  if (value && typeof value === 'object') {
    const result = value as Record<string, unknown>;
    if (result.success === false || result.status === 'error') throw new ApiError(400, typeof result.message === 'string' ? result.message : typeof result.error === 'string' ? result.error : 'Não foi possível concluir.');
  }
  return value;
}
async function identity(request: IncomingMessage): Promise<Identity | null> {
  const authorization = request.headers.authorization;
  if (!authorization) return null;
  if (!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization) || authorization.length > 12000) throw new ApiError(401, 'Entre novamente na sua conta.');
  const bearer = authorization.slice(7);
  let token: JWT | null;
  try { token = await decode({ token: bearer, secret: secret! }); } catch { throw new ApiError(401, 'Entre novamente na sua conta.'); }
  if (!token || typeof token.id !== 'string' || !token.id || typeof token.exp !== 'number' || token.exp * 1000 <= Date.now() || !['credentials', 'google'].includes(String(token.provider))) throw new ApiError(401, 'Entre novamente na sua conta.');
  const user = await prisma.user.findUnique({ where: { id: token.id }, select: { id: true, role: true, password: true, suspendedAt: true, suspendedUntil: true, sessionVersion: true } });
  if (!user || isAccountSuspended(user) || !accountSessionValid(token.sessionVersion, user.sessionVersion) || !credentialSessionValid(token.provider, token.credentialStamp, user.password)) { await endImpersonation(prisma, token); throw new ApiError(401, 'Sua sessão foi encerrada. Entre novamente.'); }
  const effective = await resolveImpersonationIdentity(prisma, token);
  if (!effective.user || effective.blocked) throw new ApiError(403, 'Esta conta está indisponível no momento.');
  return { id: effective.user.id, role: effective.user.role, token, bearer, impersonation: effective.impersonation ? { ...effective.impersonation, adminId: String(token.id), adminName: typeof token.name === 'string' ? token.name : 'Administrador' } : null };
}
async function issueSession(userId: string, provider: 'credentials' | 'google') {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (isAccountSuspended(user)) throw new ApiError(403, 'Esta conta está suspensa.');
  if (provider === 'credentials' && (!user.password || !user.emailVerified)) throw new ApiError(401, 'Email ou senha inválidos. Verifique seu email.');
  const claims: JWT = {
    id: user.id, sub: user.id, provider, role: user.role, name: user.name, email: user.email,
    image: user.image, emailVerified: user.emailVerified, sessionVersion: user.sessionVersion,
    ...(provider === 'credentials' ? { credentialStamp: credentialStamp(user.password) } : {}),
  };
  const allowed = await resolveImpersonationIdentity(prisma, claims);
  if (allowed.blocked) throw new ApiError(403, 'Um administrador está acessando esta conta. Tente novamente após o encerramento desse acesso.');
  if (!allowed.user) throw new ApiError(401, 'Esta sessão não está mais disponível. Entre novamente.');
  const token = await encode({ secret: secret!, maxAge: sessionSeconds, token: claims });
  return { token, expiresAt: new Date(Date.now() + sessionSeconds * 1000).toISOString(), user: { id: user.id, name: user.name, email: user.email, image: user.image, role: user.role, emailVerified: user.emailVerified, provider } };
}
function requireIdentity(current: Identity | null): Identity { if (!current) throw new ApiError(401, 'Entre na sua conta para continuar.'); return current; }
function requireAdmin(current: Identity | null): Identity { const user = requireIdentity(current); if (user.role !== 'ADMIN') throw new ApiError(403, 'Acesso negado.'); return user; }
function requirePromoter(current: Identity | null): Identity { const user = requireIdentity(current); if (!['ADMIN', 'PROMOTER'].includes(user.role)) throw new ApiError(403, 'Acesso negado.'); return user; }
function forwardedRequest(url: URL, method: string, bytes: Buffer, headers: IncomingMessage['headers'], current: Identity | null): NextRequest {
  const forwarded = new Headers();
  if (headers['content-type']) forwarded.set('content-type', headers['content-type']);
  forwarded.set('origin', origin);
  if (current) forwarded.set('cookie', `next-auth.session-token=${current.bearer}; __Secure-next-auth.session-token=${current.bearer}`);
  // Never forward caller supplied cookies, Host, Origin, X-Forwarded-* or identity fields.
  return new NextRequest(new URL(url.pathname + url.search, origin), { method, headers: forwarded, ...(method !== 'GET' && method !== 'HEAD' ? { body: Uint8Array.from(bytes).buffer } : {}) });
}
async function sessionForToken(original: JWT) {
  const token = { ...original };
  const remaining = typeof token.exp === 'number' ? Math.floor(token.exp - Date.now() / 1000) : 0;
  if (remaining <= 0) throw new ApiError(401, 'Entre novamente na sua conta.');
  const effective = await resolveImpersonationIdentity(prisma, token);
  if (!effective.user || effective.blocked) throw new ApiError(403, 'Esta conta está indisponível no momento.');
  if (!effective.impersonation) {
    for (const key of ['impersonationId', 'impersonationView', 'effectiveName', 'effectiveEmail', 'effectiveImage', 'effectiveEmailVerified']) delete token[key];
  }
  token.effectiveUserId = effective.user.id;
  token.effectiveRole = effective.user.role;
  token.accountBlocked = false;
  const impersonation: ImpersonationView | null = effective.impersonation ? {
    ...effective.impersonation, adminId: String(token.id), adminName: typeof token.name === 'string' ? token.name : 'Administrador',
  } : null;
  const user = effective.user;
  return {
    token: await encode({ secret: secret!, token, maxAge: remaining }),
    expiresAt: new Date((Math.floor(Date.now() / 1000) + remaining) * 1000).toISOString(),
    user: { id: user.id, name: user.name, email: user.email, image: user.image, role: user.role,
      emailVerified: user.emailVerified, provider: token.provider, ...(impersonation ? { impersonation } : {}) },
    ...(impersonation ? { impersonation } : {}),
  };
}
async function manualEndpoint(url: URL, method: string, bytes: Buffer, current: Identity | null, remote: string): Promise<{ handled: boolean; data?: unknown }> {
  const pathname = url.pathname.slice(3);
  const resolve: ResolveCurrentUser = async () => current ? { id: current.id, role: current.role } : null;
  const admin = async () => requireAdmin(current).id;
  const parsed = () => json(bytes);
  let params: Record<string, string> | null;
  if (pathname === '/auth/logout' && method === 'POST') {
    const user = requireIdentity(current);
    await endImpersonation(prisma, user.token);
    return { handled: true, data: { ok: true } };
  }
  if (pathname === '/admin/impersonation/start' && method === 'POST') {
    const actor = requireAdmin(current);
    const input = z.object({ userId: z.string().uuid(), reason: z.string().trim().min(5).max(500) }).strict().parse(parsed());
    let record;
    try { record = await startImpersonation(prisma, actor.token, input.userId, remote.slice(0, 100), input.reason); }
    catch (error) {
      const domainMessages = ['Informe uma justificativa entre 5 e 500 caracteres.', 'Saia da visualização atual primeiro.', 'Acesso restrito ao administrador.', 'Não é permitido acessar a própria conta.', 'Essa conta não pode ser acessada.', 'Essa conta já está sendo acessada.'];
      if (error instanceof Error && domainMessages.includes(error.message)) throw new ApiError(400, error.message);
      throw error;
    }
    return { handled: true, data: await sessionForToken(impersonationToken(actor.token, record.id)) };
  }
  if (pathname === '/admin/impersonation/end' && method === 'POST') {
    const actor = requireIdentity(current);
    await endImpersonation(prisma, actor.token);
    const restored = impersonationToken(actor.token, null);
    return { handled: true, data: await sessionForToken(restored) };
  }
  if (pathname === '/admin/impersonation/status' && method === 'GET') {
    const actor = requireIdentity(current);
    const restoreRequired = Boolean(actor.token.impersonationId && !actor.impersonation);
    return { handled: true, data: { blocked: false, impersonation: actor.impersonation, restoreRequired,
      ...(restoreRequired ? { session: await sessionForToken(actor.token) } : {}) } };
  }
  if (pathname === '/auth/login' && method === 'POST') {
    const input = loginSchema.parse(parsed());
    const user = await prisma.user.findUnique({ where: { email: input.email }, include: { accounts: true } });
    if (!user || !user.password || !user.emailVerified || user.accounts.some(account => account.provider !== 'credentials') || !await bcrypt.compare(input.password, user.password)) throw new ApiError(401, 'Email ou senha inválidos. Verifique seu email.');
    return { handled: true, data: await issueSession(user.id, 'credentials') };
  }
  if (pathname === '/auth/google' && method === 'POST') {
    const { idToken } = z.object({ idToken: z.string().min(20).max(12000) }).strict().parse(parsed());
    const audiences = (process.env.GOOGLE_NATIVE_CLIENT_IDS || '').split(',').map(value => value.trim()).filter(Boolean);
    if (!audiences.length) throw new ApiError(503, 'Login Google ainda não foi configurado no servidor.');
    let payload;
    try { payload = (await oauth.verifyIdToken({ idToken, audience: audiences })).getPayload(); } catch { throw new ApiError(401, 'Não foi possível validar seu login Google.'); }
    if (!payload?.sub || !payload.email || !payload.email_verified) throw new ApiError(401, 'Use uma conta Google com email verificado.');
    const linked = await prisma.account.findUnique({ where: { provider_providerAccountId: { provider: 'google', providerAccountId: payload.sub } }, select: { userId: true } });
    let userId = linked?.userId;
    if (!userId) {
      // Email equality is not permission to link a credentials/other provider account.
      if (await prisma.user.findUnique({ where: { email: payload.email }, select: { id: true } })) throw new ApiError(409, 'Este email já usa outro método de login.');
      const created = await prisma.user.create({ data: { email: payload.email, name: payload.name ?? null, image: payload.picture ?? null, emailVerified: true, accounts: { create: { provider: 'google', providerAccountId: payload.sub, type: 'oauth' } } }, select: { id: true } });
      userId = created.id;
    }
    return { handled: true, data: await issueSession(userId, 'google') };
  }
  if (pathname === '/auth/register' && method === 'POST') {
    const input = z.object({ name: z.string(), email: z.string(), password: z.string() }).strict().parse(parsed());
    return { handled: true, data: checkedResult(await registerUser(input)) };
  }
  if (pathname === '/auth/verify' && method === 'GET') return { handled: true, data: checkedResult(await verifyEmailToken(url.searchParams.get('token'))) };
  if (pathname === '/me' && method === 'GET') {
    const user = requireIdentity(current);
    return { handled: true, data: { ...await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: safeUserSelect }), provider: user.token.provider, ...(user.impersonation ? { impersonation: user.impersonation } : {}) } };
  }
  if (pathname === '/profile' && method === 'GET') return { handled: true, data: await prisma.user.findUniqueOrThrow({ where: { id: requireIdentity(current).id }, select: { ...safeUserSelect, bio: true, contactUrl: true } }) };
  if (pathname === '/profile' && method === 'PATCH') {
    requireIdentity(current);
    const input = z.object({ name: z.string().optional(), email: z.string().email(), password: z.string().optional(), newPassword: z.string().optional() }).strict().parse(parsed());
    return { handled: true, data: checkedResult(await resetDataProfile(input, resolve)) };
  }
  if (pathname === '/events' && method === 'GET') return { handled: true, data: await prisma.events.findMany({ where: { status: 'PUBLISHED' }, select: publicEventSelect, orderBy: { dataInicio: 'asc' }, take: 1000 }) };
  if (pathname === '/events/mine' && method === 'GET') return { handled: true, data: await prisma.events.findMany({ where: { userId: requireIdentity(current).id }, select: { ...publicEventSelect, reviewNote: true }, orderBy: { updatedAt: 'desc' } }) };
  if (pathname === '/events' && method === 'POST') {
    const user = requirePromoter(current), form = await new Response(Uint8Array.from(bytes).buffer, { headers: { 'Content-Type': multipartHeader() } }).formData();
    return { handled: true, data: checkedResult(await (url.searchParams.get('submit') === 'false' ? events.salvarRascunho : events.salvarEvento)(form, user.id, resolve)) };
  }
  if ((params = matchTemplate('/events/:id', pathname))) {
    if (method === 'GET') {
      const event = await getPublicEvent(params.id) ?? (current ? await events.getOwnedEvent(params.id, resolve) : null);
      if (!event) throw new ApiError(404, 'Evento indisponível.');
      return { handled: true, data: event };
    }
    if (method === 'PUT') {
      requirePromoter(current);
      const form = await new Response(Uint8Array.from(bytes).buffer, { headers: { 'Content-Type': multipartHeader() } }).formData();
      return { handled: true, data: checkedResult(await events.atualizarEvento(params.id, form, url.searchParams.get('submit') !== 'false', resolve)) };
    }
  }
  if ((params = matchTemplate('/events/:id/duplicate', pathname)) && method === 'POST') { requirePromoter(current); return { handled: true, data: checkedResult(await events.duplicarEvento(params.id, resolve)) }; }
  if ((params = matchTemplate('/events/:id/cancel', pathname)) && method === 'POST') { requirePromoter(current); return { handled: true, data: checkedResult(await events.cancelarEvento(params.id, resolve)) }; }
  if ((params = matchTemplate('/events/:id/recurrence', pathname)) && method === 'POST') { requirePromoter(current); return { handled: true, data: checkedResult(await criarSerieRecorrente(params.id, recurrenceInputSchema.parse(parsed()), resolve)) }; }
  if ((params = matchTemplate('/events/:id/favorite', pathname))) {
    requireIdentity(current);
    if (method === 'GET') return { handled: true, data: await favorites.getFavoriteState(params.id, resolve) };
    if (method === 'POST') return { handled: true, data: checkedResult(await favorites.toggleFavorite(params.id, resolve)) };
  }
  if ((params = matchTemplate('/events/:id/reminder', pathname)) && method === 'PUT') { requireIdentity(current); const input = z.object({ minutes: z.number().int().nullable() }).strict().parse(parsed()); return { handled: true, data: checkedResult(await favorites.setEventReminder(params.id, input.minutes, resolve)) }; }
  if (pathname === '/favorites' && method === 'GET') { requireIdentity(current); return { handled: true, data: await favorites.getSavedEvents(resolve) }; }
  if (pathname === '/notifications' && method === 'GET') { requireIdentity(current); return { handled: true, data: await notifications.getNotificationPage(resolve, { before: url.searchParams.get('before') ?? undefined, unread: url.searchParams.get('unread') === 'true' }) }; }
  if (pathname === '/notifications/read-all' && method === 'PATCH') { requireIdentity(current); return { handled: true, data: await notifications.markNotificationRead(null, resolve) }; }
  if ((params = matchTemplate('/notifications/:id/read', pathname)) && method === 'PATCH') { requireIdentity(current); return { handled: true, data: await notifications.markNotificationRead(params.id, resolve) }; }
  if ((params = matchTemplate('/promoters/:id', pathname)) && method === 'GET') { const profile = await promoters.getPromoterProfile(params.id, resolve); if (!profile) throw new ApiError(404, 'Promotor indisponível.'); return { handled: true, data: profile }; }
  if ((params = matchTemplate('/promoters/:id/follow', pathname)) && method === 'POST') { requireIdentity(current); return { handled: true, data: checkedResult(await promoters.toggleFollow(params.id, resolve)) }; }
  if (pathname === '/promoter/profile' && method === 'GET') { requireIdentity(current); return { handled: true, data: await promoters.getMyPublicProfile(resolve) }; }
  if (pathname === '/promoter/profile' && method === 'PUT') { requirePromoter(current); const input = z.object({ bio: z.string(), contactUrl: z.string() }).strict().parse(parsed()); return { handled: true, data: checkedResult(await promoters.updatePromoterProfile(input, resolve)) }; }
  if (pathname === '/promoter/stats' && method === 'GET') { requirePromoter(current); return { handled: true, data: await promoters.getPromoterStats(resolve) }; }
  if (pathname === '/history' && method === 'GET') { requirePromoter(current); return { handled: true, data: checkedResult(await getRecentEventHistory()) }; }
  if ((params = matchTemplate('/events/:id/history', pathname)) && method === 'GET') { requirePromoter(current); return { handled: true, data: checkedResult(await getEventHistory(params.id)) }; }
  if (pathname === '/admin/users' && method === 'GET') { requireAdmin(current); return { handled: true, data: checkedResult(await getAdminUsersPage(admin, { page: Number(url.searchParams.get('page') || 1), q: url.searchParams.get('q') ?? undefined, role: url.searchParams.get('role') ?? undefined })) }; }
  if ((params = matchTemplate('/admin/users/:id/role', pathname)) && method === 'PATCH') {
    requireAdmin(current); const { role } = z.object({ role: z.enum(['BASIC', 'PROMOTER', 'ADMIN']) }).strict().parse(parsed());
    const target = await prisma.user.findUnique({ where: { id: params.id }, select: safeUserSelect });
    if (!target) throw new ApiError(404, 'Usuário indisponível.');
    return { handled: true, data: checkedResult(await alterRoleUser({ ...target, role: target.role, Events: [] } as User, role, admin)) };
  }
  if ((params = matchTemplate('/admin/users/:id', pathname)) && method === 'DELETE') {
    requireAdmin(current); const target = await prisma.user.findUnique({ where: { id: params.id }, select: safeUserSelect });
    if (!target) throw new ApiError(404, 'Usuário indisponível.');
    return { handled: true, data: checkedResult(await deleteUser({ ...target, Events: [] } as User, admin)) };
  }
  if (pathname === '/admin/events/validate' && method === 'POST') { const actor = requireAdmin(current); const { ids } = z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }).strict().parse(parsed()); return { handled: true, data: checkedResult(await validateEvents(ids, actor.id)) }; }
  if (pathname === '/admin/events' && method === 'DELETE') { const actor = requireAdmin(current); const { ids } = z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }).strict().parse(parsed()); return { handled: true, data: checkedResult(await deleteEvents(ids, actor.id)) }; }
  if ((params = matchTemplate('/admin/events/:id/correction', pathname)) && method === 'POST') { requireAdmin(current); const { reason } = z.object({ reason: z.string().min(5).max(2000) }).strict().parse(parsed()); return { handled: true, data: checkedResult(await events.solicitarCorrecao(params.id, reason, resolve)) }; }
  return { handled: false };
}
// Request-specific multipart type is passed via AsyncLocalStorage, avoiding cross-request mutable state.
import { AsyncLocalStorage } from 'node:async_hooks';
const multipartContext = new AsyncLocalStorage<string>();
function multipartHeader(): string { const value = multipartContext.getStore(); if (!value?.startsWith('multipart/form-data;')) throw new ApiError(400, 'Envie o formulário como multipart/form-data.'); return value; }

function send(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(value));
}
const corsOrigins = new Set((process.env.NATIVE_BROWSER_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
const server = createServer(async (request, response) => {
  const incomingOrigin = request.headers.origin;
  if (incomingOrigin && corsOrigins.has(incomingOrigin)) {
    response.setHeader('Access-Control-Allow-Origin', incomingOrigin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  }
  if (request.method === 'OPTIONS') { if (incomingOrigin && !corsOrigins.has(incomingOrigin)) { send(response, 403, { message: 'Origem inválida.' }); return; } response.writeHead(204); response.end(); return; }
  try {
    if (incomingOrigin && !corsOrigins.has(incomingOrigin)) throw new ApiError(403, 'Origem inválida.');
    const url = new URL(request.url || '/', 'http://native.local');
    if (url.pathname === '/health' && request.method === 'GET') { send(response, 200, { data: { status: 'ok', service: 'eventmap-native-api' } }); return; }
    // Serve legacy relative image URLs through the same existing public media validation.
    if (/^\/(?:uploads|api\/media)\/[^/]+$/.test(url.pathname) && request.method === 'GET') url.pathname = '/v1/media/' + url.pathname.split('/').at(-1);
    if (/^\/api\/party-connections\/[^/]+\/matches\/[^/]+\/images\/[^/]+$/.test(url.pathname) && request.method === 'GET') url.pathname = '/v1' + url.pathname.slice(4);
    if (!url.pathname.startsWith('/v1/')) throw new ApiError(404, 'Recurso não encontrado.');
    const method = request.method || 'GET';
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(method)) throw new ApiError(405, 'Método não permitido.');
    const remote = request.socket.remoteAddress || 'unknown';
    throttle(`requests:${remote}`, 180);
    if (url.pathname.startsWith('/v1/auth/')) throttle(`auth:${remote}`, 12);
    let contentType = request.headers['content-type'] || '';
    const multipart = contentType.startsWith('multipart/form-data;');
    const eventMultipart = multipart && /^\/v1\/events(?:\/[^/]+)?$/.test(url.pathname);
    let bytes = await bodyBytes(request, eventMultipart ? 56 * 1024 * 1024 : multipart ? 6 * 1024 * 1024 : 16000);
    const current = await identity(request);
    // Set identity in the trusted adapter, never accept an upload actor from the client.
    if (url.pathname === '/v1/upload' && method === 'POST') {
      const user = requireIdentity(current);
      if (!multipart) throw new ApiError(400, 'Envie a imagem como multipart/form-data.');
      const form = await new Response(Uint8Array.from(bytes).buffer, { headers: { 'Content-Type': contentType } }).formData();
      form.set('userId', user.id);
      const encoded = new Request('http://native.local', { method: 'POST', body: form });
      bytes = Buffer.from(await encoded.arrayBuffer()); contentType = encoded.headers.get('content-type')!;
    }
    const adapted = forwardedRequest(url, method, bytes, { 'content-type': contentType }, current);
    await withRequestHeaders(adapted.headers, async () => multipartContext.run(contentType, async () => {
      const manual = await manualEndpoint(url, method, bytes, current, remote);
      if (manual.handled) { send(response, 200, { data: manual.data }); return; }
      const pathname = url.pathname.slice(3);
      for (const route of routes) {
        const params = matchTemplate(route.template, pathname);
        if (!params) continue;
        if (route.admin) requireAdmin(current);
        else if (!route.public || method !== 'GET' && !pathname.startsWith('/auth/') && !pathname.startsWith('/event-engagement/')) requireIdentity(current);
        const handler = route.module[method as keyof typeof route.module];
        if (!handler) throw new ApiError(405, 'Método não permitido.');
        const result = pathname.startsWith('/event-engagement/') && method === 'POST'
          ? await engagementWindow.run(current ? `user:${current.id}` : `network:${remote}`, params.id, z.object({ action: z.enum(['view', 'ticket']) }).parse(json(bytes)).action, () => handler(adapted, { params }))
          : await handler(adapted, { params });
        if (route.binary && result.ok) {
          const allowed = ['content-type', 'cache-control', 'content-disposition', 'x-content-type-options'];
          const headers: Record<string, string> = {};
          for (const name of allowed) { const value = result.headers.get(name); if (value) headers[name] = value; }
          response.writeHead(result.status, headers); response.end(Buffer.from(await result.arrayBuffer())); return;
        }
        let payload: unknown;
        try { payload = await result.json(); } catch { throw new ApiError(result.ok ? 503 : result.status, 'Não foi possível concluir.'); }
        if (!result.ok) {
          const detail = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
          throw new ApiError(result.status, typeof detail.message === 'string' ? detail.message : typeof detail.error === 'string' ? detail.error : 'Não foi possível concluir.');
        }
        if (pathname === '/upload') {
          const uploaded = z.object({ filePath: z.string() }).parse(payload);
          payload = { url: uploaded.filePath };
        }
        send(response, result.status, { data: checkedResult(payload) }); return;
      }
      throw new ApiError(404, 'Recurso não encontrado.');
    }));
  } catch (error) {
    const status = error instanceof ApiError ? error.status : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 503;
    send(response, status, { message: error instanceof ApiError ? error.message : status === 400 ? 'Confira os campos informados.' : 'Serviço indisponível. Tente novamente em instantes.' });
  }
});
server.requestTimeout = 30000;
server.headersTimeout = 10000;
const port = Number(process.env.NATIVE_API_PORT || 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('NATIVE_API_PORT inválida.');
server.listen(port, process.env.NATIVE_API_HOST || '127.0.0.1', () => console.log(`API nativa disponível na porta ${port}.`));
async function shutdown(): Promise<void> { server.close(); await prisma.$disconnect(); }
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
