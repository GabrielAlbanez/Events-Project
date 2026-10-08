import Busboy from 'busboy';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Transform } from 'node:stream';
import { Server as SocketIOServer } from 'socket.io';
import { createMobileAuthService, MobileAuthError } from './auth-service';
import type { GoogleProfile, MobileAuthRepository, AccessToken, MobileUser } from './auth-service';
import type { EventReader } from './event-repository';
import type { PostgresInteractionService } from './interaction-service';
import type { PostgresAccountService } from './account-service';
import type { PostgresPromoterService } from './promoter-service';
import type { EventActor, PostgresEventAuthoringService } from './event-authoring-service';
import type { EventReadActor, PostgresEventReadCalendarService } from './event-read-calendar-service';
import type { EventMediaActor, PostgresEventMediaService, UploadedEventImage } from './event-media-service';
import { createAdminRouteHandler, resolveMobileIdentity } from './admin-routes';
import type { PostgresAdminService } from './admin-service';
import type { VerifiedImpersonationToken } from './impersonation-token';
import { attachIndependentRealtime } from './realtime-transport';
import type { IndependentRealtimeTransport, RealtimeDomainAccess, RealtimeUser } from './realtime-transport';
import type { listenForProfileImageChanges } from './profile-image-notifications';
import type { PostgresCommunityService } from './community-service';
import type {
  EventChatSendInput,
  PostgresChatPartyService,
  PrivateChatControlInput,
  PrivateChatSendInput,
} from './chat-party-service';

interface RateEntry {
  hits: number;
  until: number;
}

export interface IndependentServerDependencies {
  repository: MobileAuthRepository;
  accounts: PostgresAccountService;
  promoters: PostgresPromoterService;
  events: EventReader;
  interactions: PostgresInteractionService;
  eventAuthoring: PostgresEventAuthoringService;
  eventReadCalendar: PostgresEventReadCalendarService;
  eventMedia: PostgresEventMediaService;
  admin: PostgresAdminService;
  impersonationTokens: {
    verify(token: string, allowExpiredForRestore?: boolean): VerifiedImpersonationToken;
  };
  community: PostgresCommunityService;
  chatParty: PostgresChatPartyService;
  realtimeAccess: RealtimeDomainAccess;
  readActiveUserIds?: () => Promise<string[]>;
  onActiveUserIdsChanged?: (userIds: string[]) => void;
  listenForProfileImageChanges?: (
    onChange: (userId: string) => void,
    onRoleChange?: (userId: string) => void,
  ) => () => Promise<void>;
  accessToken: AccessToken;
  verifyGoogleIdToken(idToken: string): Promise<GoogleProfile>;
  browserOrigins?: string[];
  now?: () => Date;
}

const closeHandlers = new WeakMap<Server, () => Promise<void>>();

export function closeIndependentAuthServer(server: Server): Promise<void> {
  const close = closeHandlers.get(server);
  if (!close) throw new Error('Independent mobile API server was not initialized.');
  return close();
}

interface MultipartForm {
  fields: Record<string, string>;
  files: Map<string, UploadedEventImage[]>;
}

const maxMultipartBytes = 56 * 1024 * 1024;
const maxImageBytes = 5 * 1024 * 1024;

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  response.end(JSON.stringify(body));
}

function sendRaw(
  response: ServerResponse,
  status: number,
  body: Buffer | string,
  headers: Record<string, string>,
): void {
  response.writeHead(status, {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...headers,
  });
  response.end(body);
}

async function readMultipart(request: IncomingMessage): Promise<MultipartForm> {
  const contentType = request.headers['content-type'];
  if (!contentType?.toLowerCase().startsWith('multipart/form-data')) {
    throw new MobileAuthError(415, 'Envie os dados como multipart/form-data.');
  }
  const length = Number(request.headers['content-length'] || 0);
  if (!Number.isFinite(length) || length > maxMultipartBytes) {
    throw new MobileAuthError(413, 'Arquivo ou solicitação muito grande.');
  }

  return new Promise((resolve, reject) => {
    let parser: ReturnType<typeof Busboy>;
    try {
      parser = Busboy({
        headers: request.headers,
        preservePath: false,
        limits: {
          fieldNameSize: 100,
          fieldSize: 16_000,
          fields: 32,
          fileSize: maxImageBytes,
          files: 11,
          parts: 43,
          headerPairs: 100,
        },
      });
    } catch {
      reject(new MobileAuthError(400, 'Formulário de arquivo inválido.'));
      return;
    }

    const fields: Record<string, string> = {};
    const files = new Map<string, UploadedEventImage[]>();
    let failure: MobileAuthError | null = null;
    let total = 0;
    const limitStream = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        total += chunk.length;
        if (total > maxMultipartBytes) {
          callback(new MobileAuthError(413, 'Arquivo ou solicitação muito grande.'));
          return;
        }
        callback(null, chunk);
      },
    });
    const fail = (error: MobileAuthError): void => {
      failure ??= error;
    };

    parser.on('field', (name, value, info) => {
      if (info.nameTruncated || info.valueTruncated || Object.prototype.hasOwnProperty.call(fields, name)) {
        fail(new MobileAuthError(400, 'Formulário de arquivo inválido.'));
        return;
      }
      fields[name] = value;
    });
    parser.on('file', (name, stream, info) => {
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('data', chunk => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        chunks.push(bytes);
      });
      stream.on('limit', () => fail(new MobileAuthError(413, 'Cada imagem deve ter no máximo 5 MB.')));
      stream.on('error', () => fail(new MobileAuthError(400, 'Não foi possível ler o arquivo enviado.')));
      stream.on('end', () => {
        if (stream.truncated) {
          fail(new MobileAuthError(413, 'Cada imagem deve ter no máximo 5 MB.'));
          return;
        }
        const current = files.get(name) ?? [];
        current.push({
          bytes: Buffer.concat(chunks, size),
          mimeType: info.mimeType.toLowerCase(),
          fileName: info.filename,
        });
        files.set(name, current);
      });
    });
    parser.on('fieldsLimit', () => fail(new MobileAuthError(413, 'O formulário contém campos demais.')));
    parser.on('filesLimit', () => fail(new MobileAuthError(413, 'O formulário contém arquivos demais.')));
    parser.on('partsLimit', () => fail(new MobileAuthError(413, 'O formulário contém partes demais.')));
    parser.on('error', () => fail(new MobileAuthError(400, 'Formulário de arquivo inválido.')));
    request.on('aborted', () => {
      fail(new MobileAuthError(400, 'O envio do arquivo foi interrompido.'));
      parser.destroy();
    });
    limitStream.on('error', error => {
      fail(error instanceof MobileAuthError ? error : new MobileAuthError(400, 'Formulário de arquivo inválido.'));
      parser.destroy();
    });
    parser.on('close', () => {
      if (failure) reject(failure);
      else resolve({ fields, files });
    });
    request.pipe(limitStream).pipe(parser);
  });
}

function submitRequested(url: URL): boolean {
  const values = url.searchParams.getAll('submit');
  if (!values.length) return true;
  if (values.length !== 1 || (values[0] !== 'true' && values[0] !== 'false')) {
    throw new MobileAuthError(400, 'Parâmetro submit inválido.');
  }
  return values[0] === 'true';
}

function parseNumericCursor(value: string | null): number | undefined {
  if (value === null || value === '') return undefined;
  if (!/^[1-9]\d{0,15}$/.test(value)) throw new MobileAuthError(400, 'Cursor inválido.');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new MobileAuthError(400, 'Cursor inválido.');
  return parsed;
}

function decodePathId(value: string, message = 'Recurso não encontrado.'): string {
  let id: string;
  try {
    id = decodeURIComponent(value);
  } catch {
    throw new MobileAuthError(404, message);
  }
  if (!id || /[\/\\\u0000]/.test(id)) throw new MobileAuthError(404, message);
  return id;
}

function actorForEvents(actor: { id: string; role: EventActor['role'] }): EventActor {
  return { id: actor.id, role: actor.role };
}

async function requireMobileUser(
  repository: MobileAuthRepository,
  actor: { id: string; role: string } | null,
): Promise<MobileUser> {
  if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para continuar.');
  const user = await repository.findUserById(actor.id);
  if (!user || user.role !== actor.role) throw new MobileAuthError(401, 'Sua sessão foi encerrada. Entre novamente.');
  return user;
}

function chatControlInput(value: unknown): PrivateChatControlInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MobileAuthError(400, 'Confira os campos informados.');
  }
  if ('action' in value && value.action === 'typing' && 'active' in value
    && typeof value.active === 'boolean' && Object.keys(value).length === 2) {
    return { action: 'typing', active: value.active };
  }
  if ('action' in value && value.action === 'receipt' && 'messageId' in value && 'read' in value
    && Number.isSafeInteger(value.messageId) && Number(value.messageId) > 0
    && typeof value.read === 'boolean' && Object.keys(value).length === 3) {
    return { action: 'receipt', messageId: Number(value.messageId), read: value.read };
  }
  throw new MobileAuthError(400, 'Confira os campos informados.');
}

function eventChatInput(value: unknown): EventChatSendInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !('text' in value) || typeof value.text !== 'string'
    || !('clientId' in value) || typeof value.clientId !== 'string'
    || Object.keys(value).length !== 2) {
    throw new MobileAuthError(400, 'Confira os campos informados.');
  }
  return { text: value.text, clientId: value.clientId };
}

function privateChatInput(value: unknown): PrivateChatSendInput {
  const imageId = value && typeof value === 'object' && !Array.isArray(value) && 'imageId' in value
    ? value.imageId
    : undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !('text' in value) || typeof value.text !== 'string'
    || !('clientId' in value) || typeof value.clientId !== 'string'
    || Object.keys(value).some(key => !['text', 'clientId', 'imageId'].includes(key))
    || (imageId !== undefined && typeof imageId !== 'string')) {
    throw new MobileAuthError(400, 'Confira os campos informados.');
  }
  return {
    text: value.text,
    clientId: value.clientId,
    ...(typeof imageId === 'string' && imageId ? { imageId } : {}),
  };
}

async function readJson(request: IncomingMessage, limit: number): Promise<unknown> {
  const length = Number(request.headers['content-length'] || 0);
  if (!Number.isFinite(length) || length > limit) {
    throw new MobileAuthError(413, 'Arquivo ou solicitação muito grande.');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += value.length;
    if (size > limit) throw new MobileAuthError(413, 'Arquivo ou solicitação muito grande.');
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks, size).toString('utf8')) as unknown;
  } catch {
    throw new MobileAuthError(400, 'Solicitação inválida.');
  }
}

function bearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization;
  if (!authorization || authorization.length > 9000 || !/^Bearer [A-Za-z0-9._-]+$/.test(authorization)) {
    throw new MobileAuthError(401, 'Entre na sua conta para continuar.');
  }
  return authorization.slice(7);
}

function googleIdToken(input: unknown): string {
  if (
    !input
    || typeof input !== 'object'
    || Array.isArray(input)
    || Object.keys(input).length !== 1
    || !('idToken' in input)
    || typeof input.idToken !== 'string'
    || input.idToken.length < 20
    || input.idToken.length > 12000
  ) {
    throw new MobileAuthError(400, 'Confira os campos informados.');
  }
  return input.idToken;
}

function consumeLimit(
  entries: Map<string, RateEntry>,
  key: string,
  limit: number,
  now: number,
): void {
  if (entries.size >= 10000) {
    for (const [entryKey, entry] of entries) {
      if (entry.until <= now) entries.delete(entryKey);
    }
    if (entries.size >= 10000 && !entries.has(key)) {
      throw new MobileAuthError(503, 'Aguarde antes de tentar novamente.');
    }
  }
  const current = entries.get(key);
  if (!current || current.until <= now) {
    entries.set(key, { hits: 1, until: now + 60_000 });
    return;
  }
  if (++current.hits > limit) throw new MobileAuthError(429, 'Aguarde um minuto antes de tentar novamente.');
}

export function createIndependentAuthServer(dependencies: IndependentServerDependencies): Server {
  const auth = createMobileAuthService({
    repository: dependencies.repository,
    accessToken: dependencies.accessToken,
    now: dependencies.now,
  });
  const adminDependencies = {
    service: dependencies.admin,
    auth: { currentUser: (token: string) => auth.currentUser(token) },
    accessToken: dependencies.accessToken,
    impersonationTokens: dependencies.impersonationTokens,
  };
  const adminRoutes = createAdminRouteHandler(adminDependencies);
  const origins = new Set(dependencies.browserOrigins ?? []);
  const rates = new Map<string, RateEntry>();
  let realtime: IndependentRealtimeTransport | null = null;

  const server = createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin) {
      if (!origins.has(origin)) {
        send(response, 403, { message: 'Origem inválida.' });
        return;
      }
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
      response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    try {
      const url = new URL(request.url || '/', 'http://mobile.local');
      if (request.method === 'GET' && url.pathname === '/health') {
        send(response, 200, { data: { status: 'ok', service: 'eventmap-mobile-api' } });
        return;
      }

      const remote = request.socket.remoteAddress || 'unknown';
      consumeLimit(rates, `all:${remote}`, 180, Date.now());
      if (url.pathname.startsWith('/v1/auth/')) consumeLimit(rates, `auth:${remote}`, 12, Date.now());
      const isAdminRequest = url.pathname === '/v1/history' || url.pathname.startsWith('/v1/admin/');
      if (isAdminRequest) {
        const hasBody = Number(request.headers['content-length'] || 0) > 0
          || Boolean(request.headers['transfer-encoding']);
        const isJson = request.headers['content-type']?.toLowerCase().startsWith('application/json');
        const body = hasBody && isJson && request.method !== 'GET' && request.method !== 'HEAD'
          ? await readJson(request, 16_000)
          : undefined;
        const result = await adminRoutes({
          method: request.method || 'GET',
          path: `${url.pathname.slice('/v1'.length)}${url.search}`,
          authorization: request.headers.authorization,
          body,
          ip: remote,
        });
        if (result) {
          if (request.method === 'POST' && url.pathname === '/v1/admin/impersonation/start'
            && result.status === 200 && body && typeof body === 'object'
            && 'userId' in body && typeof body.userId === 'string') {
            await realtime?.revalidateUser(body.userId);
          }
          send(response, result.status, result.body);
          return;
        }
      }
      let actor: (Awaited<ReturnType<typeof auth.currentUser>> & {
        impersonation?: {
          id: string;
          adminId: string;
          adminName: string | null;
          userName: string | null;
          expiresAt: string;
        };
      }) | null = null;
      if (request.headers.authorization) {
        const identity = await resolveMobileIdentity(bearerToken(request), adminDependencies);
        actor = {
          ...identity.user,
          ...(identity.impersonation ? { impersonation: identity.impersonation } : {}),
        };
      }
      if (request.method === 'POST' && url.pathname === '/v1/auth/login') {
        const result = await dependencies.accounts.login(await readJson(request, 16_000));
        send(response, 200, { data: result });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/auth/register') {
        const result = await dependencies.accounts.register(await readJson(request, 16_000));
        send(response, 200, { data: result });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/auth/verify') {
        send(response, 200, { data: await dependencies.accounts.verifyEmail(url.searchParams.get('token')) });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/auth/recovery') {
        send(response, 200, { data: await dependencies.accounts.requestAccountLink(await readJson(request, 16_000), 'recovery') });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/auth/resend-verification') {
        send(response, 200, { data: await dependencies.accounts.requestAccountLink(await readJson(request, 16_000), 'verification') });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/auth/reset-password') {
        send(response, 200, { data: await dependencies.accounts.resetPassword(await readJson(request, 16_000)) });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/auth/logout') {
        if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para continuar.');
        send(response, 200, { data: { ok: true } });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/events') {
        send(response, 200, { data: await dependencies.events.listPublicEvents() });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/events/mine') {
        if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para continuar.');
        send(response, 200, { data: await dependencies.events.listOwnedEvents(actor.id) });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/events') {
        if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para publicar um evento.');
        const form = await readMultipart(request);
        const allowedFields = new Set([
          'nome', 'descricao', 'endereco', 'linkParaCompra', 'dataInicio', 'dataFim',
          'category', 'priceCents', 'isFree', 'capacity', 'lat', 'lng',
          'startTime', 'endTime', 'timezone',
        ]);
        if (
          Object.keys(form.fields).some(key => !allowedFields.has(key))
          || [...form.files.keys()].some(key => key !== 'banner' && key !== 'carrossel')
          || (form.files.get('banner')?.length ?? 0) > 1
          || (form.files.get('carrossel')?.length ?? 0) > 10
        ) throw new MobileAuthError(400, 'Confira os campos e imagens do evento.');
        const input: Record<string, unknown> = { ...form.fields };
        const banner = form.files.get('banner')?.[0];
        if (banner) input.banner = (await dependencies.eventMedia.save(actorForEvents(actor), banner)).url;
        const carouselFiles = form.files.get('carrossel') ?? [];
        if (carouselFiles.length) {
          input.carrossel = await Promise.all(carouselFiles.map(async file =>
            (await dependencies.eventMedia.save(actorForEvents(actor), file)).url));
        }
        send(response, 201, {
          data: await dependencies.eventAuthoring.create(
            actorForEvents(actor),
            input,
            submitRequested(url),
          ),
        });
        return;
      }
      const eventWriteMatch = request.method === 'PUT' && url.pathname.match(/^\/v1\/events\/([^/]+)$/);
      if (eventWriteMatch) {
        if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para atualizar o evento.');
        const eventId = decodeURIComponent(eventWriteMatch[1]);
        if (!eventId || /[\/\\\u0000]/.test(eventId)) throw new MobileAuthError(404, 'Evento não encontrado.');
        const form = await readMultipart(request);
        const allowedFields = new Set([
          'nome', 'descricao', 'endereco', 'linkParaCompra', 'dataInicio', 'dataFim',
          'category', 'priceCents', 'isFree', 'capacity', 'lat', 'lng',
          'startTime', 'endTime', 'timezone',
        ]);
        if (
          Object.keys(form.fields).some(key => !allowedFields.has(key))
          || [...form.files.keys()].some(key => key !== 'banner' && key !== 'carrossel')
          || (form.files.get('banner')?.length ?? 0) > 1
          || (form.files.get('carrossel')?.length ?? 0) > 10
        ) throw new MobileAuthError(400, 'Confira os campos e imagens do evento.');
        const input: Record<string, unknown> = { ...form.fields };
        const banner = form.files.get('banner')?.[0];
        if (banner) input.banner = (await dependencies.eventMedia.save(actorForEvents(actor), banner)).url;
        const carouselFiles = form.files.get('carrossel') ?? [];
        if (carouselFiles.length) {
          input.carrossel = await Promise.all(carouselFiles.map(async file =>
            (await dependencies.eventMedia.save(actorForEvents(actor), file)).url));
        }
        send(response, 200, {
          data: await dependencies.eventAuthoring.update(
            actorForEvents(actor),
            eventId,
            input,
            submitRequested(url),
          ),
        });
        return;
      }
      const eventActionMatch = url.pathname.match(/^\/v1\/events\/([^/]+)\/(cancel|duplicate|recurrence|history)$/);
      if (eventActionMatch) {
        let eventId: string;
        try {
          eventId = decodeURIComponent(eventActionMatch[1]);
        } catch {
          throw new MobileAuthError(404, 'Evento não encontrado.');
        }
        if (!eventId || /[\/\\\u0000]/.test(eventId)) throw new MobileAuthError(404, 'Evento não encontrado.');
        const action = eventActionMatch[2];
        if (action === 'history' && request.method === 'GET') {
          if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para consultar o histórico.');
          send(response, 200, {
            data: await dependencies.eventReadCalendar.eventHistory(actor, eventId),
          });
          return;
        }
        if (action === 'cancel' && request.method === 'POST') {
          if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para cancelar o evento.');
          send(response, 200, {
            data: await dependencies.eventAuthoring.cancel(actorForEvents(actor), eventId),
          });
          return;
        }
        if (action === 'duplicate' && request.method === 'POST') {
          if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para duplicar o evento.');
          send(response, 201, {
            data: await dependencies.eventAuthoring.duplicate(actorForEvents(actor), eventId),
          });
          return;
        }
        if (action === 'recurrence' && request.method === 'POST') {
          if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para criar recorrências.');
          send(response, 201, {
            data: await dependencies.eventAuthoring.createRecurrence(
              actorForEvents(actor),
              eventId,
              await readJson(request, 16_000),
            ),
          });
          return;
        }
      }
      const calendarMatch = request.method === 'GET' && url.pathname.match(/^\/v1\/event-calendar\/([^/]+)$/);
      if (calendarMatch) {
        let eventId: string;
        try {
          eventId = decodeURIComponent(calendarMatch[1]);
        } catch {
          throw new MobileAuthError(404, 'Evento não encontrado.');
        }
        const calendar = await dependencies.eventReadCalendar.calendar(
          eventId,
          actor ? { id: actor.id, role: actor.role } satisfies EventReadActor : null,
        );
        sendRaw(response, calendar.status, Buffer.from(calendar.body, 'utf8'), {
          'Content-Type': calendar.contentType,
          'Content-Disposition': calendar.headers['Content-Disposition'],
          'Cache-Control': calendar.headers['Cache-Control'],
          'Content-Length': String(Buffer.byteLength(calendar.body, 'utf8')),
        });
        return;
      }
      const eventMediaMatch = request.method === 'GET' && url.pathname.match(/^\/v1\/media\/events\/([^/]+)$/);
      if (eventMediaMatch) {
        let assetId: string;
        try {
          assetId = decodeURIComponent(eventMediaMatch[1]);
        } catch {
          throw new MobileAuthError(404, 'Imagem não encontrada.');
        }
        const media = await dependencies.eventMedia.read(
          assetId,
          actor ? { id: actor.id, role: actor.role } satisfies EventMediaActor : null,
        );
        sendRaw(response, media.status, media.body, {
          'Content-Type': media.contentType,
          'Content-Length': String(media.contentLength),
          'Cache-Control': media.cacheControl,
        });
        return;
      }
      const profileMediaMatch = request.method === 'GET'
        && url.pathname.match(/^\/v1\/media\/profile\/([^/]+)$/);
      if (profileMediaMatch) {
        const assetId = decodePathId(profileMediaMatch[1], 'Imagem não encontrada.');
        const media = await dependencies.eventMedia.readProfileImage(assetId);
        sendRaw(response, media.status, media.body, {
          'Content-Type': media.contentType,
          'Content-Length': String(media.contentLength),
          'Cache-Control': media.cacheControl,
        });
        return;
      }
      const legacyProfileMediaMatch = request.method === 'GET'
        && url.pathname.match(/^\/v1\/media\/profile\/legacy\/([^/]+)$/);
      if (legacyProfileMediaMatch) {
        const filename = decodePathId(legacyProfileMediaMatch[1], 'Imagem não encontrada.');
        const media = await dependencies.eventMedia.readLegacyProfileImage(filename);
        sendRaw(response, media.status, media.body, {
          'Content-Type': media.contentType,
          'Content-Length': String(media.contentLength),
          'Cache-Control': media.cacheControl,
        });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/profile/image') {
        if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para atualizar a foto de perfil.');
        const form = await readMultipart(request);
        if (Object.keys(form.fields).length || [...form.files.keys()].some(key => key !== 'file')
          || form.files.get('file')?.length !== 1) {
          throw new MobileAuthError(400, 'Envie uma imagem no campo file.');
        }
        const file = form.files.get('file')?.[0];
        if (!file) throw new MobileAuthError(400, 'Envie uma imagem no campo file.');
        const uploaded = await dependencies.eventMedia.saveProfileImage(actor, file);
        send(response, 200, { data: uploaded });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/upload') {
        if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para enviar imagens.');
        const purposeValues = url.searchParams.getAll('purpose');
        if (purposeValues.length > 1 || (purposeValues.length === 1 && purposeValues[0] !== 'party')) {
          throw new MobileAuthError(400, 'Finalidade de envio inválida.');
        }
        const form = await readMultipart(request);
        if (Object.keys(form.fields).length || [...form.files.keys()].some(key => key !== 'file')
          || form.files.get('file')?.length !== 1) {
          throw new MobileAuthError(400, 'Envie uma imagem no campo file.');
        }
        const file = form.files.get('file')?.[0];
        if (!file) throw new MobileAuthError(400, 'Envie uma imagem no campo file.');
        send(response, 201, { data: await dependencies.eventMedia.save(actor, file) });
        return;
      }
      const communityEventMatch = url.pathname.match(/^\/v1\/community\/events\/([^/]+)$/);
      if (communityEventMatch && (request.method === 'GET' || request.method === 'POST')) {
        const eventId = decodePathId(communityEventMatch[1], 'Evento indisponível.');
        if (request.method === 'GET') {
          send(response, 200, {
            data: await dependencies.community.snapshot(
              eventId,
              actor ? { id: actor.id, role: actor.role } : null,
            ),
          });
          return;
        }
        const user = await requireMobileUser(dependencies.repository, actor);
        const result = await dependencies.community.action(eventId, user, await readJson(request, 16_000));
        realtime?.communityUpdated({ eventId });
        send(response, 200, { data: result });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/community/rooms') {
        const user = await requireMobileUser(dependencies.repository, actor);
        send(response, 200, { data: await dependencies.community.rooms(user) });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/community/rooms') {
        const user = await requireMobileUser(dependencies.repository, actor);
        const result = await dependencies.community.createRoom(user, await readJson(request, 16_000));
        realtime?.communityUpdated({ user: true }, user.id);
        send(response, 201, { data: result });
        return;
      }
      const communityRoomMatch = url.pathname.match(/^\/v1\/community\/rooms\/([^/]+)$/);
      if (communityRoomMatch && (request.method === 'GET' || request.method === 'POST')) {
        const roomId = decodePathId(communityRoomMatch[1], 'Sala indisponível.');
        const user = await requireMobileUser(dependencies.repository, actor);
        if (request.method === 'GET') {
          send(response, 200, { data: await dependencies.community.room(roomId, user) });
          return;
        }
        const result = await dependencies.community.roomAction(roomId, user, await readJson(request, 16_000));
        realtime?.communityUpdated({ roomId });
        send(response, 200, { data: result });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/community/activity') {
        const user = await requireMobileUser(dependencies.repository, actor);
        send(response, 200, { data: await dependencies.community.activity(user) });
        return;
      }
      const eventChatMatch = url.pathname.match(/^\/v1\/event-chat\/([^/]+)$/);
      if (eventChatMatch && (request.method === 'GET' || request.method === 'POST')) {
        const eventId = decodePathId(eventChatMatch[1], 'Conversa indisponível.');
        const user = await requireMobileUser(dependencies.repository, actor);
        if (request.method === 'GET') {
          const before = parseNumericCursor(url.searchParams.get('before'));
          send(response, 200, { data: await dependencies.chatParty.chatHistory(eventId, user, before) });
          return;
        }
        const result = await dependencies.chatParty.chatSend(
          eventId,
          user,
          eventChatInput(await readJson(request, 16_000)),
        );
        realtime?.communityUpdated({ chatEventId: eventId });
        send(response, 200, { data: result });
        return;
      }
      const partyEventMatch = url.pathname.match(/^\/v1\/party-connections\/([^/]+)$/);
      if (partyEventMatch && (request.method === 'GET' || request.method === 'POST')) {
        const eventId = decodePathId(partyEventMatch[1], 'Conexões indisponíveis.');
        const user = await requireMobileUser(dependencies.repository, actor);
        if (request.method === 'GET') {
          send(response, 200, {
            data: await dependencies.chatParty.partySnapshot(eventId, user, url.searchParams.get('after')),
          });
          return;
        }
        const result = await dependencies.chatParty.partyAction(eventId, user, await readJson(request, 16_000));
        realtime?.communityUpdated({ partyEventId: eventId });
        send(response, 200, { data: result });
        return;
      }
      const privateImageMatch = request.method === 'GET'
        && url.pathname.match(/^\/v1\/party-connections\/([^/]+)\/matches\/([^/]+)\/images\/([^/]+)$/);
      if (privateImageMatch) {
        const user = await requireMobileUser(dependencies.repository, actor);
        const image = await dependencies.chatParty.privateImage(
          decodePathId(privateImageMatch[1], 'Imagem não encontrada.'),
          decodePathId(privateImageMatch[2], 'Imagem não encontrada.'),
          decodePathId(privateImageMatch[3], 'Imagem não encontrada.'),
          user,
        );
        sendRaw(response, 200, image.bytes, {
          'Content-Type': image.contentType,
          'Content-Length': String(image.bytes.length),
          'Cache-Control': 'private, no-store',
          'Content-Disposition': 'inline',
        });
        return;
      }
      const privateImagesMatch = request.method === 'POST'
        && url.pathname.match(/^\/v1\/party-connections\/([^/]+)\/matches\/([^/]+)\/images$/);
      if (privateImagesMatch) {
        const user = await requireMobileUser(dependencies.repository, actor);
        const form = await readMultipart(request);
        if (Object.keys(form.fields).length || [...form.files.keys()].some(key => key !== 'file')
          || form.files.get('file')?.length !== 1) {
          throw new MobileAuthError(400, 'Envie uma imagem no campo file.');
        }
        const file = form.files.get('file')?.[0];
        if (!file) throw new MobileAuthError(400, 'Envie uma imagem no campo file.');
        const uploaded = await dependencies.chatParty.uploadPrivateImage(
          decodePathId(privateImagesMatch[1], 'Conversa indisponível.'),
          decodePathId(privateImagesMatch[2], 'Conversa indisponível.'),
          user,
          file.bytes,
          file.mimeType,
        );
        send(response, 201, { data: uploaded });
        return;
      }
      const privateMatch = url.pathname.match(/^\/v1\/party-connections\/([^/]+)\/matches\/([^/]+)$/);
      if (privateMatch && ['GET', 'POST', 'PATCH'].includes(request.method || '')) {
        const eventId = decodePathId(privateMatch[1], 'Conversa indisponível.');
        const matchId = decodePathId(privateMatch[2], 'Conversa indisponível.');
        const user = await requireMobileUser(dependencies.repository, actor);
        if (request.method === 'GET') {
          const before = parseNumericCursor(url.searchParams.get('before'));
          send(response, 200, {
            data: await dependencies.chatParty.privateHistory(eventId, matchId, user, before),
          });
          return;
        }
        if (request.method === 'POST') {
          const result = await dependencies.chatParty.privateSend(
            eventId,
            matchId,
            user,
            privateChatInput(await readJson(request, 16_000)),
          );
          realtime?.communityUpdated({ matchId });
          send(response, 200, { data: result });
          return;
        }
        const result = await dependencies.chatParty.privateControl(
          eventId,
          matchId,
          user,
          chatControlInput(await readJson(request, 16_000)),
        );
        realtime?.communityUpdated({ matchId });
        send(response, 200, { data: result });
        return;
      }
      const engagementMatch = request.method === 'POST' && url.pathname.match(/^\/v1\/event-engagement\/([^/]+)$/);
      if (engagementMatch) {
        let eventId: string;
        try {
          eventId = decodeURIComponent(engagementMatch[1]);
        } catch {
          throw new MobileAuthError(404, 'Evento indisponível.');
        }
        if (!eventId || /[\/\\\u0000]/.test(eventId)) throw new MobileAuthError(404, 'Evento indisponível.');
        const body: unknown = await readJson(request, 2_000);
        if (
          !body || typeof body !== 'object' || Array.isArray(body)
          || Object.keys(body).length !== 1 || !('action' in body)
          || !(body.action === 'view' || body.action === 'ticket')
        ) throw new MobileAuthError(400, 'Confira os campos informados.');
        const identity = actor ? `user:${actor.id}` : `network:${remote}`;
        send(response, 200, {
          data: await dependencies.interactions.trackEngagement(identity, eventId, body.action),
        });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/favorites') {
        if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para continuar.');
        send(response, 200, { data: await dependencies.interactions.favorites(actor.id) });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/notifications') {
        if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para continuar.');
        send(response, 200, {
          data: await dependencies.interactions.notificationPage(
            actor.id,
            url.searchParams.get('before'),
            url.searchParams.get('unread') === 'true',
          ),
        });
        return;
      }
      if (request.method === 'PATCH' && url.pathname === '/v1/notifications/read-all') {
        if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para continuar.');
        send(response, 200, { data: await dependencies.interactions.markNotificationsRead(actor.id, null) });
        return;
      }
      const notificationReadMatch = request.method === 'PATCH' && url.pathname.match(/^\/v1\/notifications\/([^/]+)\/read$/);
      if (notificationReadMatch) {
        if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para continuar.');
        const notificationId = decodeURIComponent(notificationReadMatch[1]);
        send(response, 200, { data: await dependencies.interactions.markNotificationsRead(actor.id, notificationId) });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/me') {
        if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para continuar.');
        send(response, 200, { data: actor });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/profile') {
        if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para continuar.');
        send(response, 200, { data: await dependencies.accounts.profile(actor.id) });
        return;
      }
      if (request.method === 'PATCH' && url.pathname === '/v1/profile') {
        if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para continuar.');
        send(response, 200, { data: await dependencies.accounts.updateProfile(actor.id, await readJson(request, 16_000)) });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/promoter/profile') {
        if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para continuar.');
        send(response, 200, { data: await dependencies.promoters.myProfile(actor.id) });
        return;
      }
      if (request.method === 'PUT' && url.pathname === '/v1/promoter/profile') {
        if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para continuar.');
        send(response, 200, {
          data: await dependencies.promoters.updateProfile(actor, await readJson(request, 16_000)),
        });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/promoter/stats') {
        if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para continuar.');
        send(response, 200, { data: await dependencies.promoters.stats(actor) });
        return;
      }
      const followMatch = url.pathname.match(/^\/v1\/promoters\/([^/]+)\/follow$/);
      if (followMatch && request.method === 'POST') {
        if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para continuar.');
        send(response, 200, {
          data: await dependencies.promoters.toggleFollow(decodeURIComponent(followMatch[1]), actor.id),
        });
        return;
      }
      const promoterMatch = request.method === 'GET' && url.pathname.match(/^\/v1\/promoters\/([^/]+)$/);
      if (promoterMatch) {
        send(response, 200, {
          data: await dependencies.promoters.profile(decodeURIComponent(promoterMatch[1]), actor?.id ?? null),
        });
        return;
      }
      const eventMatch = request.method === 'GET' && url.pathname.match(/^\/v1\/events\/([^/]+)$/);
      if (eventMatch) {
        let eventId: string;
        try {
          eventId = decodeURIComponent(eventMatch[1]);
        } catch {
          throw new MobileAuthError(404, 'Evento indisponível.');
        }
        if (!eventId || /[\/\\\u0000]/.test(eventId)) {
          throw new MobileAuthError(404, 'Evento indisponível.');
        }
        const event = await dependencies.eventReadCalendar.read(
          eventId,
          actor ? { id: actor.id, role: actor.role } satisfies EventReadActor : null,
        );
        if (!event) throw new MobileAuthError(404, 'Evento indisponível.');
        send(response, 200, { data: event });
        return;
      }
      const favoriteMatch = url.pathname.match(/^\/v1\/events\/([^/]+)\/favorite$/);
      if (favoriteMatch) {
        const eventId = decodeURIComponent(favoriteMatch[1]);
        if (!eventId || /[\/\\\u0000]/.test(eventId)) throw new MobileAuthError(404, 'Evento indisponível.');
        if (request.method === 'GET') {
          send(response, 200, { data: await dependencies.interactions.favoriteState(eventId, actor?.id ?? null) });
          return;
        }
        if (request.method === 'POST') {
          if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para continuar.');
          send(response, 200, { data: await dependencies.interactions.toggleFavorite(eventId, actor.id) });
          return;
        }
      }
      const reminderMatch = request.method === 'PUT' && url.pathname.match(/^\/v1\/events\/([^/]+)\/reminder$/);
      if (reminderMatch) {
        if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para continuar.');
        const eventId = decodeURIComponent(reminderMatch[1]);
        const body: unknown = await readJson(request, 16_000);
        if (
          !body || typeof body !== 'object' || Array.isArray(body)
          || Object.keys(body).length !== 1 || !('minutes' in body)
          || !(body.minutes === null || Number.isSafeInteger(body.minutes))
        ) throw new MobileAuthError(400, 'Confira os campos informados.');
        send(response, 200, {
          data: await dependencies.interactions.setReminder(eventId, actor.id, body.minutes as number | null),
        });
        return;
      }
      const registrationMatch = url.pathname.match(/^\/v1\/events\/([^/]+)\/registration$/);
      if (registrationMatch) {
        const eventId = decodeURIComponent(registrationMatch[1]);
        if (request.method === 'GET') {
          send(response, 200, { data: await dependencies.interactions.registrationState(eventId, actor?.id ?? null) });
          return;
        }
        if (request.method === 'POST') {
          if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para confirmar presença.');
          send(response, 200, { data: await dependencies.interactions.registerForEvent(eventId, actor.id) });
          return;
        }
        if (request.method === 'DELETE') {
          if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para cancelar a inscrição.');
          send(response, 200, { data: await dependencies.interactions.cancelRegistration(eventId, actor.id) });
          return;
        }
      }
      const checkInTokenMatch = request.method === 'GET' && url.pathname.match(/^\/v1\/events\/([^/]+)\/check-in-token$/);
      if (checkInTokenMatch) {
        if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para mostrar o QR Code.');
        const eventId = decodeURIComponent(checkInTokenMatch[1]);
        send(response, 200, { data: await dependencies.interactions.issueCheckInToken(eventId, actor.id) });
        return;
      }
      const checkInMatch = url.pathname.match(/^\/v1\/events\/([^/]+)\/check-in$/);
      if (checkInMatch && request.method === 'GET') {
        if (!actor) throw new MobileAuthError(401, 'Acesso negado.');
        const eventId = decodeURIComponent(checkInMatch[1]);
        send(response, 200, { data: await dependencies.interactions.checkInRoster(eventId, actor) });
        return;
      }
      if (checkInMatch && request.method === 'POST') {
        if (!actor) throw new MobileAuthError(401, 'Acesso negado.');
        const body: unknown = await readJson(request, 16_000);
        if (!body || typeof body !== 'object' || Array.isArray(body) || !('token' in body) || typeof body.token !== 'string') {
          throw new MobileAuthError(400, 'Informe um QR Code válido.');
        }
        const eventId = decodeURIComponent(checkInMatch[1]);
        send(response, 200, { data: await dependencies.interactions.checkIn(eventId, actor, body.token) });
        return;
      }
      const checkInRosterMatch = request.method === 'GET' && url.pathname.match(/^\/v1\/events\/([^/]+)\/check-in-roster$/);
      if (checkInRosterMatch) {
        if (!actor) throw new MobileAuthError(401, 'Acesso negado.');
        const eventId = decodeURIComponent(checkInRosterMatch[1]);
        send(response, 200, { data: await dependencies.interactions.checkInRoster(eventId, actor) });
        return;
      }
      const reportMatch = request.method === 'POST' && url.pathname.match(/^\/v1\/events\/([^/]+)\/reports$/);
      if (reportMatch) {
        if (!actor) throw new MobileAuthError(401, 'Entre na sua conta para denunciar.');
        const body: unknown = await readJson(request, 16_000);
        if (
          !body || typeof body !== 'object' || Array.isArray(body)
          || !('reason' in body) || !('details' in body)
          || typeof body.reason !== 'string' || typeof body.details !== 'string'
        ) throw new MobileAuthError(400, 'Dados inválidos.');
        const eventId = decodeURIComponent(reportMatch[1]);
        send(response, 201, {
          data: await dependencies.interactions.reportEvent(eventId, actor.id, body.reason, body.details),
        });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/auth/google') {
        consumeLimit(rates, `google:${remote}`, 12, Date.now());
        if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
          throw new MobileAuthError(415, 'Envie os dados como application/json.');
        }
        const idToken = googleIdToken(await readJson(request, 16_000));
        const profile = await dependencies.verifyGoogleIdToken(idToken);
        send(response, 200, { data: await auth.googleLogin(profile) });
        return;
      }

      send(response, 404, { message: 'Recurso não encontrado.' });
    } catch (error) {
      if (error instanceof MobileAuthError) {
        send(response, error.status, { message: error.message });
        return;
      }
      console.error('Independent mobile auth request failed:', error instanceof Error ? error.message : 'unknown error');
      send(response, 503, { message: 'Serviço indisponível. Tente novamente em instantes.' });
    }
  });
  const io = new SocketIOServer(server, {
    serveClient: false,
    maxHttpBufferSize: 1_000_000,
    cors: { origin: [...origins], credentials: false },
  });
  const realtimeTransport = attachIndependentRealtime(io, {
    async authenticate(token): Promise<RealtimeUser> {
      const identity = await resolveMobileIdentity(token, adminDependencies);
      return { id: identity.user.id, role: identity.user.role };
    },
    domainAccess: dependencies.realtimeAccess,
    readActiveUserIds: dependencies.readActiveUserIds,
    onActiveUserIdsChanged: dependencies.onActiveUserIdsChanged,
    now: dependencies.now ? () => dependencies.now!().getTime() : undefined,
  });
  realtime = realtimeTransport;
  const stopProfileImageNotifications = dependencies.listenForProfileImageChanges?.(
    userId => realtimeTransport.profileImageUpdated(userId),
    userId => {
      void dependencies.repository.findUserById(userId).then(user => {
        if (user) realtimeTransport.roleUpdated(userId, user.role);
      }).catch(error => {
        console.error('Unable to verify a notified account role:', error instanceof Error ? error.message : 'unknown error');
      });
    },
  );
  server.on('close', () => realtimeTransport.close());
  closeHandlers.set(server, async () => {
    await new Promise<void>(resolve => io.close(() => resolve()));
    await stopProfileImageNotifications?.();
    realtimeTransport.close();
  });
  return server;
}
