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
import { credentialSessionValid } from "./lib/auth/sessionCredential.js";

nextEnv.loadEnvConfig(process.cwd());

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "8081", 10);

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
  const httpServer = createServer(handle);
  io = new Server(httpServer, {
    cors: {
      origin: (process.env.SOCKET_IO_ALLOWED_ORIGINS || "").split(",").filter(Boolean),
      methods: ["GET", "POST"],
      credentials: true,
    },
    cookie: {
      name: "io",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    },
  });

  const stopNotifications = startNotificationWorker(prisma, (userId, event) => io!.to("user:" + userId).emit(event), () => io!.emit("update-events"));
  httpServer.on("close", stopNotifications);
  const stopCommunity = startCommunityWorker(prisma, (room) => dispatchCommunitySignal(prisma, io!, room));
  httpServer.on("close", stopCommunity);
  const stopAccountRevocation = startAccountRevocationWorker(prisma, io);
  httpServer.on("close", stopAccountRevocation);

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
      const user = await prisma.user.findUnique({
        where: { id: token.id },
        select: { id: true, password: true },
      });
      if (user) {
        if (!credentialSessionValid(token.provider, token.credentialStamp, user.password)) {
          const error = new Error("Session revoked") as Error & { data: { code: string } };
          error.data = { code: "SESSION_REVOKED" };
          return next(error);
        }
        socket.data.userId = user.id;
        socket.data.expiresAt = token.exp * 1000;
        socket.data.provider = token.provider;
        socket.data.credentialStamp = token.credentialStamp;
      } else {
        const error = new Error("Account removed") as Error & { data: { code: string } };
        error.data = { code: "ACCOUNT_REMOVED" };
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
    if (userId && authenticatedSocket.data.expiresAt) {
      enforceSocketExpiration(socket, authenticatedSocket.data.expiresAt);
    }

    const broadcastPresence = () => {
      io!.to("admins").emit("active-users", Array.from(new Set(activeUsers.values())));
    };

    const registerUser = async () => {
      if (!userId || !socket.connected) return;
      try {
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
      io!.to("admins").emit("update-users");
    });

    // Solicitar lista de usuários ativos
    socket.on("request-active-users", async () => {
      if (!userId) return;
      try {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
        if (user?.role !== "ADMIN") {
          socket.leave("admins");
          return;
        }
        socket.join("admins");
        socket.emit("active-users", Array.from(new Set(activeUsers.values())));
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
        io!.to("admins").emit("update-users");
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
            io!.to(`user:${event.userId}`).emit("event-validated", {
              eventId: event.id,
              eventName: event.nome,
              validatedAt: event.validatedAt.toISOString(),
            });
          }
          for (const ownerId of Array.from(notifiedOwners)) {
            io!.to(`user:${ownerId}`).emit("event-history-updated");
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
