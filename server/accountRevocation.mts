import type { PrismaClient } from "@prisma/client";
import type { Server, Socket } from "socket.io";
import { credentialSessionValid } from "../lib/auth/sessionCredential.js";
import { validateSocketIdentity } from "./socketIdentity.mjs";
import { expireImpersonationSessions } from "../lib/auth/impersonation.js";

/** Identity is assigned from the verified session, never from client payloads. */
export function disconnectRemovedAccount(socket: Socket): void {
  if (!socket.connected) return;
  socket.emit("account-removed");
  socket.disconnect(true);
}

export async function revokeRemovedAccount(prisma: PrismaClient, io: Server, userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, password: true } });
  if (user) {
    for (const socket of Array.from(io.sockets.sockets.values())) {
      if (socket.connected && (socket.data.userId === userId || socket.data.authUserId === userId)) await validateSocketIdentity(prisma, socket);
    }
    return false;
  }
  for (const socket of Array.from(io.sockets.sockets.values())) {
    if (socket.data.userId === userId) {
      if (socket.data.impersonationId) await validateSocketIdentity(prisma, socket);
      else disconnectRemovedAccount(socket);
    }
  }
  return true;
}

/** Bulk fallback covers lost signals and sockets not yet joined to a room. */
export function createAccountRevocationPoller(prisma: PrismaClient, io: Server) {
  let running = false;
  let stopped = false;
  async function poll(): Promise<void> {
    if (running || stopped) return;
    running = true;
    try {
      const ids = Array.from(new Set(Array.from(io.sockets.sockets.values())
        .filter(socket => socket.connected && typeof socket.data.userId === "string")
        .map(socket => socket.data.userId as string)));
      for (let offset = 0; offset < ids.length && !stopped; offset += 200) {
        const batch = ids.slice(offset, offset + 200);
        const users = await prisma.user.findMany({ where: { id: { in: batch } }, select: { id: true, password: true } });
        if (stopped) return;
        const existing = new Set(users.map(user => user.id));
        const absent = new Set(batch.filter(id => !existing.has(id)));
        const passwords = new Map(users.map(user => [user.id, user.password]));
        for (const socket of Array.from(io.sockets.sockets.values())) {
          if (absent.has(socket.data.userId)) {
            if (socket.data.impersonationId) await validateSocketIdentity(prisma, socket);
            else disconnectRemovedAccount(socket);
          }
          else if (socket.connected && !socket.data.impersonationId && passwords.has(socket.data.userId) && !credentialSessionValid(socket.data.provider, socket.data.credentialStamp, passwords.get(socket.data.userId))) {
            socket.emit("session-expired"); socket.disconnect(true);
          }
        }
      }
      for (const socket of Array.from(io.sockets.sockets.values())) {
        if (stopped) return;
        if (socket.connected && typeof socket.data.userId === "string") await validateSocketIdentity(prisma, socket);
      }
    } catch {
      // A database outage is not evidence that an account was removed.
    } finally { running = false; }
  }
  return { poll, stop: () => { stopped = true; } };
}

export function startAccountRevocationWorker(prisma: PrismaClient, io: Server): () => void {
  const poller = createAccountRevocationPoller(prisma, io);
  const timer = setInterval(() => {
    void expireImpersonationSessions(prisma)
      .then(() => poller.poll())
      .catch(() => { /* A database outage must never be interpreted as an account ban. */ });
  }, 5000);
  timer.unref();
  return () => { clearInterval(timer); poller.stop(); };
}
