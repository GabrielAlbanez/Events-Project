import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { PrismaClient } from "@prisma/client";
import nextEnv from "@next/env";
import { getToken } from "next-auth/jwt";
import { NextRequest } from "next/server.js";
import type { Socket } from "socket.io";
import { enforceSocketExpiration, enforceSocketCredentials } from "./server/socketSession.mjs";
import { startNotificationWorker } from "./server/notificationWorker.mjs";
import { dispatchCommunitySignal, registerCommunitySubscriptions } from "./server/communityGateway.mjs";
import { startCommunityWorker } from "./server/communityWorker.mjs";
import { disconnectRemovedAccount, startAccountRevocationWorker } from "./server/accountRevocation.mjs";
import { resolveSocketIdentity, validateSocketIdentity, emitAuthorizedRoom } from "./server/socketIdentity.mjs";
import { configuredPublicOrigin } from "./lib/publicUrl.js";
import { createSharedPresence } from "./server/sharedPresence.mjs";
import { registerChatSignals } from "./server/chatSignals.mjs";

nextEnv.loadEnvConfig(process.cwd());

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "8081", 10);
const allowedSocketOrigins = Array.from(new Set([
  ...(process.env.SOCKET_IO_ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean),
  ...(configuredPublicOrigin() ? [configuredPublicOrigin()!] : []),
]));

const prisma = new PrismaClient();
const activeUsers = new Map<string, string>();
const recentlyNotifiedValidations = new Map<string, number>();

type AuthenticatedSocket = Socket & { data: { userId?: string; expiresAt?: number } };

let io: Server | null = null;

// ✅ Exporta a instância do Socket.IO
export const getIoServer = () => {
  if (!io) throw new Error("Socket.IO não inicializado");
  return io;
};

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  const httpServer = createServer((request, response) => {
    request.headers["x-eventmap-client-ip"] = request.socket.remoteAddress ?? "";
    return handle(request, response);
  });
  io = new Server(httpServer, {
    cors: {
      origin: allowedSocketOrigins,
      methods: ["GET", "POST"],
      credentials: true,
    },
    allowRequest: (request, callback) => {
      const origin = request.headers.origin;
      callback(null, !origin || allowedSocketOrigins.includes(origin));
    },
    cookie: {
      name: "io",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    },
  });

  const stopNotifications = startNotificationWorker(prisma, (userId, event) => {
    void emitAuthorizedRoom(prisma, io!, "user:" + userId, event).catch(() => console.warn("Notification socket delivery unavailable."));
  }, () => io!.emit("update-events"));
  httpServer.on("close", stopNotifications);
  const stopCommunity = startCommunityWorker(prisma, (room) => dispatchCommunitySignal(prisma, io!, room));
  httpServer.on("close", stopCommunity);
  const stopAccountRevocation = startAccountRevocationWorker(prisma, io);
  httpServer.on("close", stopAccountRevocation);

  const sharedPresence = createSharedPresence({
    getLocalUserIds: () => Array.from(new Set(activeUsers.values())),
    onChange: (userIds) => emitAuthorizedRoom(prisma, io!, "admins", "active-users", userIds),
  });
  httpServer.on("close", () => { void sharedPresence.stop(); });
  const shutdown = () => {
    void sharedPresence.stop().finally(() => { process.exit(0); });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  // The NextAuth JWT is carried by the HTTP upgrade request. Anonymous sockets
  // may receive public event updates, but never acquire a user identity.
  io.use(async (socket, next) => {
    try {
      const token = await getToken({
        req: new NextRequest("http://localhost", {
          headers: { cookie: socket.request.headers.cookie ?? "" },
        }),
        secret: process.env.NEXTAUTH_SECRET,
      });
      if (typeof token?.id !== "string" || !token.id) return next();
      if (typeof token.exp !== "number" || token.exp * 1000 <= Date.now()) return next();
      if (token.provider === "dev-admin") return next();
      const identity = await resolveSocketIdentity(prisma, token);
      if (typeof identity !== "string") {
        socket.data.userId = identity.id;
        socket.data.authUserId = token.id;
        socket.data.impersonationId = token.impersonationId;
        socket.data.effectiveRole = identity.role;
        socket.data.expiresAt = token.exp * 1000;
        socket.data.provider = token.provider;
        socket.data.credentialStamp = token.credentialStamp;
        socket.data.sessionVersion = token.sessionVersion;
      } else {
        const error = new Error("Socket identity unavailable") as Error & { data: { code: string } };
        error.data = { code: identity };
        return next(error);
      }
      next();
    } catch {
      next(new Error("Unable to verify socket session"));
    }
  });

  io.on("connection", (socket) => {
    const authenticatedSocket = socket as AuthenticatedSocket;
    const userId = authenticatedSocket.data.userId;
    enforceSocketCredentials(prisma, socket);
    registerCommunitySubscriptions(prisma, socket);
    registerChatSignals(prisma, io!, socket);
    if (userId && authenticatedSocket.data.expiresAt) {
      enforceSocketExpiration(socket, authenticatedSocket.data.expiresAt);
    }

    const broadcastPresence = () => {
      void sharedPresence.poll();
    };

    const registerUser = async () => {
      if (!userId || !socket.connected) return;
      try {
        if (!await validateSocketIdentity(prisma, socket)) return;
        const user = await prisma.user.findUnique({
          where: { id: userId }, select: { role: true },
        });
        if (!socket.connected) return;
        if (!user) { disconnectRemovedAccount(socket); return; }
        socket.join(`user:${userId}`);
        if (user.role === "ADMIN") socket.join("admins");
        else socket.leave("admins");
        activeUsers.set(socket.id, userId);
        broadcastPresence();
      } catch {
        console.error("Unable to register socket user.");
      }
    };

    void registerUser();

    // Registrar usuário ativo
    socket.on("register-user", () => {
      void registerUser();
    });


    let lastUserUpdateNotification = 0;
    socket.on("request-update-users", () => {
      const now = Date.now();
      if (now - lastUserUpdateNotification < 2000) return;
      lastUserUpdateNotification = now;
      // This is an invalidation signal only. The admin page fetches data through
      // its own HTTP endpoint, so a guest signup can safely trigger a refresh.
      void emitAuthorizedRoom(prisma, io!, "admins", "update-users").catch(() => console.warn("User socket delivery unavailable."));
    });

    // Solicitar lista de usuários ativos
    socket.on("request-active-users", async () => {
      if (!userId) return;
      try {
        if (!await validateSocketIdentity(prisma, socket)) return;
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
        if (user?.role !== "ADMIN") {
          socket.leave("admins");
          return;
        }
        socket.join("admins");
        await sharedPresence.poll();
        if (socket.connected && await validateSocketIdentity(prisma, socket)) {
          socket.emit("active-users", sharedPresence.getSnapshot());
        }
      } catch {
        console.error("Unable to verify access to active users.");
      }
    });

    // Atualizar role do usuário
    socket.on("role-updated", async (payload: { userId?: unknown; newRole?: unknown }) => {
      if (!userId || typeof payload?.userId !== "string") return;
      try {
        const [sender, target] = await Promise.all([
          prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
          prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true } }),
        ]);
        if (sender?.role !== "ADMIN" || !target || payload.newRole !== target.role) return;
        for (const targetSocket of Array.from(io!.sockets.sockets.values())) {
          if (targetSocket.data.userId !== payload.userId) continue;
          if (target.role === "ADMIN") targetSocket.join("admins");
          else targetSocket.leave("admins");
          targetSocket.emit("role-mudar", { newRole: target.role });
        }
        await emitAuthorizedRoom(prisma, io!, "admins", "update-users");
      } catch {
        console.error("Unable to notify sockets of role change.");
      }
    });

    socket.on("create-event", async () => {
      if (!userId) return;
      try {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
        if (user?.role === "ADMIN" || user?.role === "PROMOTER") io!.emit("update-events");
      } catch {
        console.error("Unable to notify sockets of event change.");
      }
    });

    socket.on("events-changed", async (payload?: { validatedEventIds?: unknown }) => {
      if (!userId) return;
      try {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
        if (user?.role !== "ADMIN") return;

        const submittedIds = payload?.validatedEventIds;
        if (Array.isArray(submittedIds) && submittedIds.length > 0 && submittedIds.length <= 100 &&
          submittedIds.every((id): id is string => typeof id === "string" && id.length > 0)) {
          const events = await prisma.events.findMany({
            where: {
              id: { in: submittedIds },
              validate: true,
              validatedBy: userId,
              validatedAt: { gte: new Date(Date.now() - 30_000), lte: new Date() },
              userId: { not: null },
            },
            select: { id: true, nome: true, userId: true, validatedAt: true },
          });
          const now = Date.now();
          for (const [key, expiresAt] of Array.from(recentlyNotifiedValidations.entries())) {
            if (expiresAt <= now) recentlyNotifiedValidations.delete(key);
          }
          const notifiedOwners = new Set<string>();
          for (const event of events) {
            if (!event.userId || !event.validatedAt) continue;
            const notificationKey = `${event.id}:${event.validatedAt.toISOString()}`;
            if (recentlyNotifiedValidations.has(notificationKey)) continue;
            recentlyNotifiedValidations.set(notificationKey, now + 30_000);
            notifiedOwners.add(event.userId);
            await emitAuthorizedRoom(prisma, io!, `user:${event.userId}`, "event-validated", {
              eventId: event.id,
              eventName: event.nome,
              validatedAt: event.validatedAt.toISOString(),
            });
          }
          for (const ownerId of Array.from(notifiedOwners)) {
            await emitAuthorizedRoom(prisma, io!, `user:${ownerId}`, "event-history-updated");
          }
        }
        io!.emit("update-events");
      } catch {
        console.error("Unable to notify sockets of event change.");
      }
    });

    // Desconexão do usuário
    socket.on("user-disconnected", () => {
      activeUsers.delete(socket.id);
      broadcastPresence();
      socket.disconnect(true);
    });
    socket.on("disconnect", () => {
      activeUsers.delete(socket.id);
      broadcastPresence();
    });
  });

  httpServer.listen(port, () => {
    console.log(`🚀 Ready on http://${hostname}:${port}`);
  });
  httpServer.on("error", (error) => {
    console.error("Erro ao iniciar o servidor HTTP/Socket.IO:", error);
    process.exit(1);
  });
}).catch((error) => {
  console.error("Erro ao preparar o Next.js:", error);
  process.exit(1);
});
