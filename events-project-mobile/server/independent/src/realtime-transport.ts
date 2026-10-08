import { createMobileAuthService, MobileAuthError } from './auth-service';
import type { AccessToken, MobileAuthRepository, Role } from './auth-service';

export type RealtimeSubscription =
  | { eventId: string }
  | { roomId: string }
  | { chatEventId: string }
  | { partyEventId: string }
  | { matchId: string }
  | { user: true };

export interface RealtimeUser {
  id: string;
  role: Role;
}

export interface RealtimeSocket {
  id: string;
  handshake: {
    auth?: unknown;
    headers?: Record<string, string | string[] | undefined>;
  };
  connected?: boolean;
  join(room: string): void | Promise<void>;
  leave(room: string): void | Promise<void>;
  on(event: string, listener: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
  to(room: string): { emit(event: string, ...args: unknown[]): void };
  disconnect(close?: boolean): void;
}

export interface RealtimeServer {
  use(middleware: (socket: RealtimeSocket, next: (error?: Error) => void) => void): void;
  on(event: 'connection', listener: (socket: RealtimeSocket) => void): void;
  to(room: string): { emit(event: string, ...args: unknown[]): void };
}

export interface RealtimeDomainAccess {
  /** Must enforce the relevant event, room, chat, party, or match policy for this actor. */
  canSubscribe(actor: RealtimeUser, subscription: RealtimeSubscription): Promise<boolean>;
}

export interface IndependentRealtimeOptions {
  authenticate(token: string): Promise<RealtimeUser>;
  domainAccess: RealtimeDomainAccess;
  readActiveUserIds?(): Promise<string[]>;
  onActiveUserIdsChanged?(userIds: string[]): void;
  now?: () => number;
  maxSockets?: number;
  maxSocketsPerUser?: number;
  maxSubscriptionsPerSocket?: number;
  maxTypingEntries?: number;
}

interface Connection {
  actor: RealtimeUser;
  token: string;
  checkedAt: number;
  checking: Promise<boolean> | null;
  rooms: Set<string>;
  roomSubscriptions: Map<string, RealtimeSubscription>;
  typingRooms: Set<string>;
  pendingSubscriptions: Map<string, number>;
  nextSubscriptionRequest: number;
  registered: boolean;
  limits: Map<string, { until: number; count: number }>;
}

interface TypingEntry {
  until: number;
  sockets: Set<RealtimeSocket>;
}

const identifierPattern = /^[A-Za-z0-9_-]{1,128}$/;
const idKeys = ['eventId', 'roomId', 'chatEventId', 'partyEventId', 'matchId'] as const;
const identifierRooms: Record<(typeof idKeys)[number], string> = {
  eventId: 'event',
  roomId: 'friends',
  chatEventId: 'chat',
  partyEventId: 'party',
  matchId: 'match',
};
const typingLifetimeMs = 5_000;
const sweepIntervalMs = 1_000;
const authenticationCacheMs = 3_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && identifierPattern.test(value);
}

function parseSubscription(value: unknown): RealtimeSubscription | null {
  if (!isRecord(value) || Object.keys(value).length !== 1) return null;
  if (value.user === true) return { user: true };
  for (const key of idKeys) {
    if (isIdentifier(value[key])) return { [key]: value[key] } as RealtimeSubscription;
  }
  return null;
}

function roomFor(subscription: RealtimeSubscription, actorId: string): string {
  if ('user' in subscription) return `user:${actorId}`;
  const key = idKeys.find(candidate => candidate in subscription);
  if (!key) throw new Error('Invalid realtime subscription.');
  const identifier = (subscription as unknown as Record<string, string>)[key];
  return `${identifierRooms[key]}:${identifier}`;
}

function tokenFromSocket(socket: RealtimeSocket): string | null {
  const auth = socket.handshake.auth;
  if (isRecord(auth) && Object.prototype.hasOwnProperty.call(auth, 'token')) {
    return typeof auth.token === 'string' && auth.token.length > 0 && auth.token.length <= 8192
      ? auth.token
      : null;
  }
  if (auth !== undefined && auth !== null && isRecord(auth) && Object.keys(auth).length > 0) return null;

  const header = socket.handshake.headers?.authorization;
  if (typeof header !== 'string' || header.length > 9000) return null;
  const match = /^Bearer ([^\s]+)$/i.exec(header);
  return match && match[1].length <= 8192 ? match[1] : null;
}

function acknowledgement(value: unknown): ((reply: { ok: boolean; online?: boolean }) => void) | null {
  return typeof value === 'function'
    ? value as (reply: { ok: boolean; online?: boolean }) => void
    : null;
}

function allowRate(connection: Connection, key: string, limit: number, windowMs: number, now: number): boolean {
  const entry = connection.limits.get(key);
  if (!entry || entry.until <= now) {
    connection.limits.set(key, { until: now + windowMs, count: 1 });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}

function positiveLimit(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && (value as number) > 0 ? value as number : fallback;
}

export function createRealtimeAuthenticator(
  dependencies: {
    repository: MobileAuthRepository;
    accessToken: AccessToken;
    now?: () => Date;
  },
): (token: string) => Promise<RealtimeUser> {
  const auth = createMobileAuthService(dependencies);
  return async token => {
    const user = await auth.currentUser(token);
    return { id: user.id, role: user.role };
  };
}

export interface RealtimeNotifier {
  /** Call after a domain mutation commits; user-scoped updates require an explicit recipient. */
  communityUpdated(subscription: Exclude<RealtimeSubscription, { user: true }>): void;
  communityUpdated(subscription: { user: true }, userId: string): void;
  profileImageUpdated(userId: string): void;
  roleUpdated(userId: string, role: Role): void;
  /** Revoke this user's room membership and notify them that access is no longer available. */
  communityAccessDenied(userId: string, subscription: RealtimeSubscription): void;
}

export interface IndependentRealtimeTransport extends RealtimeNotifier {
  revalidateUser(userId: string): Promise<void>;
  close(): void;
}

/**
 * Attach to an existing Socket.IO-compatible server. Clients authenticate with
 * `handshake.auth.token` or an Authorization Bearer header; cookies are ignored.
 * Each non-user subscription is denied unless the injected domain checker allows it.
 * Use the returned notifier from HTTP mutation handlers only after commit.
 */
export function attachIndependentRealtime(
  io: RealtimeServer,
  options: IndependentRealtimeOptions,
): IndependentRealtimeTransport {
  const now = options.now ?? Date.now;
  const maxSockets = positiveLimit(options.maxSockets, 5_000);
  const maxSocketsPerUser = positiveLimit(options.maxSocketsPerUser, 8);
  const maxSubscriptions = positiveLimit(options.maxSubscriptionsPerSocket, 32);
  const maxTypingEntries = positiveLimit(options.maxTypingEntries, 10_000);
  const connections = new WeakMap<RealtimeSocket, Connection>();
  const sockets = new Set<RealtimeSocket>();
  const socketsByUser = new Map<string, Set<RealtimeSocket>>();
  const socketsByRoom = new Map<string, Set<RealtimeSocket>>();
  const typing = new Map<string, Map<string, TypingEntry>>();
  let typingCount = 0;
  let closed = false;

  const emitTyping = (room: string, userId: string, until: number): void => {
    for (const socket of socketsByRoom.get(room) ?? []) {
      const recipient = connections.get(socket);
      if (recipient && recipient.actor.id !== userId && socket.connected !== false) {
        void revalidate(socket, recipient).then(allowed => {
          if (allowed && connections.get(socket) === recipient) socket.emit('typing', { room, userId, until });
        });
      }
    }
  };

  const stopTyping = (socket: RealtimeSocket, connection: Connection, room: string): void => {
    connection.typingRooms.delete(room);
    const users = typing.get(room);
    const entry = users?.get(connection.actor.id);
    if (!entry) return;
    entry.sockets.delete(socket);
    if (entry.sockets.size > 0) return;
    users?.delete(connection.actor.id);
    typingCount -= 1;
    if (users?.size === 0) typing.delete(room);
    emitTyping(room, connection.actor.id, now());
  };

  const clearTyping = (socket: RealtimeSocket, connection: Connection): void => {
    for (const room of [...connection.typingRooms]) stopTyping(socket, connection, room);
  };

  const leaveRoom = (socket: RealtimeSocket, connection: Connection, room: string): void => {
    connection.pendingSubscriptions.delete(room);
    if (!connection.rooms.delete(room)) return;
    connection.roomSubscriptions.delete(room);
    stopTyping(socket, connection, room);
    const members = socketsByRoom.get(room);
    members?.delete(socket);
    if (members?.size === 0) socketsByRoom.delete(room);
    void Promise.resolve(socket.leave(room)).catch(() => {});
  };

  const removeSocket = (socket: RealtimeSocket): void => {
    const connection = connections.get(socket);
    if (!connection) return;
    clearTyping(socket, connection);
    for (const room of connection.rooms) {
      const members = socketsByRoom.get(room);
      members?.delete(socket);
      if (members?.size === 0) socketsByRoom.delete(room);
    }
    connection.rooms.clear();
    sockets.delete(socket);
    const userSockets = socketsByUser.get(connection.actor.id);
    userSockets?.delete(socket);
    if (userSockets?.size === 0) socketsByUser.delete(connection.actor.id);
    options.onActiveUserIdsChanged?.([...socketsByUser.keys()]);
    connections.delete(socket);
  };

  const revalidate = (socket: RealtimeSocket, connection: Connection, force = false): Promise<boolean> => {
    if (connection.checking) return force
      ? connection.checking.then(valid => valid ? revalidate(socket, connection, true) : false)
      : connection.checking;
    if (!force && now() - connection.checkedAt < authenticationCacheMs) return Promise.resolve(true);
    connection.checkedAt = now();
    connection.checking = Promise.resolve().then(() => options.authenticate(connection.token)).then(actor => {
      if (connections.get(socket) !== connection || socket.connected === false) return false;
      if (actor.id !== connection.actor.id) throw new MobileAuthError(401, 'Identity changed.');
      connection.actor = actor;
      return true;
    }).catch(error => {
      connection.checkedAt = now() - authenticationCacheMs;
      if (connections.get(socket) === connection && (error?.status === 401 || error?.status === 403)) {
        socket.emit(error?.code === 'ACCOUNT_IMPERSONATED' ? 'account-impersonated' : 'session-expired');
        socket.disconnect(true);
        removeSocket(socket);
      }
      return false;
    }).finally(() => { connection.checking = null; });
    return connection.checking;
  };
  const canSubscribe = async (socket: RealtimeSocket, connection: Connection, subscription: RealtimeSubscription, force = false): Promise<boolean> => {
    if (!await revalidate(socket, connection, force)) {
      if (connections.get(socket) === connection && socket.connected !== false) throw new Error('Authentication temporarily unavailable.');
      return false;
    }
    return 'user' in subscription || options.domainAccess.canSubscribe(connection.actor, subscription);
  };
  const sweep = setInterval(() => {
    const timestamp = now();
    for (const socket of sockets) {
      const connection = connections.get(socket);
      if (connection && timestamp - connection.checkedAt >= 15_000) void revalidate(socket, connection, true);
    }
    for (const [room, users] of typing) {
      for (const [userId, entry] of users) {
        if (entry.until > timestamp) continue;
        for (const socket of entry.sockets) {
          connections.get(socket)?.typingRooms.delete(room);
        }
        users.delete(userId);
        typingCount -= 1;
        emitTyping(room, userId, timestamp);
      }
      if (users.size === 0) typing.delete(room);
    }
  }, sweepIntervalMs);
  sweep.unref?.();

  io.use((socket, next) => {
    if (closed) {
      next(new Error('Realtime unavailable.'));
      return;
    }
    const token = tokenFromSocket(socket);
    if (!token) {
      next(new Error('Unauthorized.'));
      return;
    }
    void options.authenticate(token).then(actor => {
      if (!actor || !isIdentifier(actor.id) || !['BASIC', 'PROMOTER', 'ADMIN'].includes(actor.role)) {
        next(new Error('Unauthorized.'));
        return;
      }
      connections.set(socket, {
        actor,
        token,
        checkedAt: now(),
        checking: null,
        rooms: new Set(),
        roomSubscriptions: new Map(),
        typingRooms: new Set(),
        pendingSubscriptions: new Map(),
        nextSubscriptionRequest: 0,
        registered: false,
        limits: new Map(),
      });
      next();
    }).catch(error => {
      const rejected = new Error('Unauthorized.') as Error & { data?: { code: string } };
      if (error?.code === 'ACCOUNT_IMPERSONATED') rejected.data = { code: error.code };
      next(rejected);
    });
  });

  io.on('connection', socket => {
    const connection = connections.get(socket);
    if (!connection) {
      socket.disconnect(true);
      return;
    }
    const userSockets = socketsByUser.get(connection.actor.id);
    if (sockets.size >= maxSockets || (userSockets?.size ?? 0) >= maxSocketsPerUser) {
      connections.delete(socket);
      socket.disconnect(true);
      return;
    }
    sockets.add(socket);
    const liveSockets = userSockets ?? new Set<RealtimeSocket>();
    liveSockets.add(socket);
    socketsByUser.set(connection.actor.id, liveSockets);
    options.onActiveUserIdsChanged?.([...socketsByUser.keys()]);

    socket.on('register-user', (...args: unknown[]) => {
      connection.registered = true;
      acknowledgement(args[0])?.({ ok: true });
    });

    socket.on('community-subscribe', (...args: unknown[]) => {
      const subscription = parseSubscription(args[0]);
      const ack = acknowledgement(args[1]);
      if (!subscription || !allowRate(connection, 'subscribe', 40, 10_000, now())) {
        ack?.({ ok: false });
        return;
      }
      const room = roomFor(subscription, connection.actor.id);
      if (!connection.pendingSubscriptions.has(room) && connection.pendingSubscriptions.size >= 8) {
        ack?.({ ok: false });
        return;
      }
      const requestId = ++connection.nextSubscriptionRequest;
      connection.pendingSubscriptions.set(room, requestId);
      void (async () => {
        const allowed = await canSubscribe(socket, connection, subscription, true);
        if (connections.get(socket) !== connection || connection.pendingSubscriptions.get(room) !== requestId) {
          ack?.({ ok: false });
          return;
        }
        connection.pendingSubscriptions.delete(room);
        if (!allowed) {
          leaveRoom(socket, connection, room);
          socket.emit('community-access-denied', { room });
          ack?.({ ok: false });
          return;
        }
        if (!connection.rooms.has(room) && connection.rooms.size >= maxSubscriptions) {
          ack?.({ ok: false });
          return;
        }
        await socket.join(room);
        connection.rooms.add(room);
        connection.roomSubscriptions.set(room, subscription);
        const members = socketsByRoom.get(room) ?? new Set<RealtimeSocket>();
        members.add(socket);
        socketsByRoom.set(room, members);
        ack?.({ ok: true });
      })().catch(() => {
        if (connection.pendingSubscriptions.get(room) === requestId) connection.pendingSubscriptions.delete(room);
        ack?.({ ok: false });
      });
    });

    socket.on('community-unsubscribe', (...args: unknown[]) => {
      const subscription = parseSubscription(args[0]);
      const ack = acknowledgement(args[1]);
      if (!subscription) {
        ack?.({ ok: false });
        return;
      }
      const room = roomFor(subscription, connection.actor.id);
      leaveRoom(socket, connection, room);
      ack?.({ ok: true });
    });

    socket.on('typing', (...args: unknown[]) => {
      const payload = args[0];
      if (
        !isRecord(payload)
        || Object.keys(payload).length !== 2
        || !isIdentifier(payload.matchId)
        || typeof payload.active !== 'boolean'
        || !allowRate(connection, 'typing', 12, 10_000, now())
      ) return;
      const subscription: RealtimeSubscription = { matchId: payload.matchId };
      void canSubscribe(socket, connection, subscription).then(allowed => {
        if (!allowed || connections.get(socket) !== connection) return;
        const room = roomFor(subscription, connection.actor.id);
        const users = typing.get(room);
        let entry = users?.get(connection.actor.id);
        if (!payload.active) {
          stopTyping(socket, connection, room);
          return;
        }
        if (!entry) {
          if (typingCount >= maxTypingEntries) return;
          entry = { until: 0, sockets: new Set() };
          const roomUsers = users ?? new Map<string, TypingEntry>();
          roomUsers.set(connection.actor.id, entry);
          typing.set(room, roomUsers);
          typingCount += 1;
        }
        entry.until = now() + typingLifetimeMs;
        entry.sockets.add(socket);
        connection.typingRooms.add(room);
        emitTyping(room, connection.actor.id, entry.until);
      }).catch(() => {});
    });

    socket.on('chat-sync', (...args: unknown[]) => {
      const payload = args[0];
      if (!isRecord(payload) || Object.keys(payload).length !== 1 || !isIdentifier(payload.matchId)
        || !allowRate(connection, 'chat-sync', 20, 10_000, now())) return;
      const subscription: RealtimeSubscription = { matchId: payload.matchId };
      void canSubscribe(socket, connection, subscription).then(allowed => {
        if (allowed && connections.get(socket) === connection) io.to(roomFor(subscription, connection.actor.id)).emit('community-updated', {
          room: roomFor(subscription, connection.actor.id),
        });
      }).catch(() => {});
    });

    socket.on('chat-presence', (...args: unknown[]) => {
      const payload = args[0];
      const ack = acknowledgement(args[1]);
      if (!isRecord(payload) || Object.keys(payload).length !== 1 || !isIdentifier(payload.matchId)
        || !ack || !allowRate(connection, 'chat-presence', 20, 10_000, now())) {
        ack?.({ ok: false });
        return;
      }
      const subscription: RealtimeSubscription = { matchId: payload.matchId };
      void canSubscribe(socket, connection, subscription).then(allowed => {
        if (connections.get(socket) !== connection) return;
        if (!allowed) {
          ack({ ok: false });
          return;
        }
        const room = roomFor(subscription, connection.actor.id);
        const online = [...(socketsByRoom.get(room) ?? [])].some(candidate => {
          const peer = connections.get(candidate);
          return candidate !== socket && candidate.connected !== false && peer?.registered
            && peer.actor.id !== connection.actor.id;
        });
        ack({ ok: true, online });
      }).catch(() => ack({ ok: false }));
    });

    socket.on('request-active-users', () => {
      if (!allowRate(connection, 'active-users', 5, 60_000, now())) return;
      void (async () => {
        if (!await revalidate(socket, connection, true)) return;
        if (connection.actor.role !== 'ADMIN') {
          socket.emit('active-users', []);
          return;
        }
        try {
          const userIds = new Set<string>([...socketsByUser.keys()]);
          for (const userId of await options.readActiveUserIds?.() ?? []) {
            if (isIdentifier(userId)) userIds.add(userId);
          }
          if (await revalidate(socket, connection, true) && connection.actor.role === 'ADMIN'
            && connections.get(socket) === connection && socket.connected !== false) {
            socket.emit('active-users', [...userIds].slice(0, maxSockets));
          }
        } catch (error) {
          console.error('Unable to read cross-platform active users:', error instanceof Error ? error.message : 'unknown error');
          socket.emit('active-users-error');
        }
      })();
    });

    socket.on('disconnect', () => removeSocket(socket));
  });

  const communityUpdated = (subscription: RealtimeSubscription, userId?: string): void => {
    const parsed = parseSubscription(subscription);
    if (!parsed) throw new Error('Invalid realtime subscription.');
    if ('user' in parsed && !isIdentifier(userId)) throw new Error('A user id is required for a user update.');
    const room = roomFor(parsed, userId ?? '');
    io.to(room).emit('community-updated', { room });
  };

  return {
    async revalidateUser(userId) {
      await Promise.all([...(socketsByUser.get(userId) ?? [])].map(socket => {
        const connection = connections.get(socket);
        return connection ? revalidate(socket, connection, true) : Promise.resolve(false);
      }));
    },
    communityUpdated,
    profileImageUpdated(userId) {
      if (!isIdentifier(userId)) throw new Error('Invalid realtime user id.');
      for (const socket of socketsByUser.get(userId) ?? []) {
        if (socket.connected !== false) socket.emit('profile-image-updated', { userId });
      }
    },
    roleUpdated(userId, role) {
      if (!isIdentifier(userId)) throw new Error('Invalid realtime user id.');
      if (!['BASIC', 'PROMOTER', 'ADMIN'].includes(role)) throw new Error('Invalid realtime user role.');
      for (const socket of socketsByUser.get(userId) ?? []) {
        const connection = connections.get(socket);
        if (!connection || socket.connected === false) continue;
        connection.actor.role = role;
        socket.emit('role-mudar', { newRole: role });
        for (const [room, subscription] of connection.roomSubscriptions) {
          if ('user' in subscription) continue;
          void options.domainAccess.canSubscribe(connection.actor, subscription).then(allowed => {
            if (allowed || connections.get(socket) !== connection || connection.actor.role !== role) return;
            leaveRoom(socket, connection, room);
            socket.emit('community-access-denied', { room });
          }).catch(() => {
            if (connections.get(socket) !== connection || connection.actor.role !== role) return;
            leaveRoom(socket, connection, room);
            socket.emit('community-access-denied', { room });
          });
        }
      }
    },
    communityAccessDenied(userId, subscription) {
      if (!isIdentifier(userId)) throw new Error('Invalid realtime user id.');
      const parsed = parseSubscription(subscription);
      if (!parsed) throw new Error('Invalid realtime subscription.');
      const room = roomFor(parsed, userId);
      for (const socket of socketsByUser.get(userId) ?? []) {
        const connection = connections.get(socket);
        if (!connection) continue;
        socket.emit('community-access-denied', { room });
        leaveRoom(socket, connection, room);
      }
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(sweep);
      for (const socket of sockets) socket.disconnect(true);
      for (const socket of sockets) removeSocket(socket);
      typing.clear();
      typingCount = 0;
      socketsByRoom.clear();
      socketsByUser.clear();
    },
  };
}
