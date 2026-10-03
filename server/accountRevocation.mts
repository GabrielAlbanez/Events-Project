import type { PrismaClient } from "@prisma/client";
import type { Server, Socket } from "socket.io";

/** Identity is assigned from the verified session, never from client payloads. */
export function disconnectRemovedAccount(socket: Socket): void {
  if (!socket.connected) return;
  socket.emit("account-removed");
  socket.disconnect(true);
}

export async function revokeRemovedAccount(prisma: PrismaClient, io: Server, userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (user) return false;
  for (const socket of Array.from(io.sockets.sockets.values())) {
    if (socket.data.userId === userId) disconnectRemovedAccount(socket);
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
        const users = await prisma.user.findMany({ where: { id: { in: batch } }, select: { id: true } });
        if (stopped) return;
        const existing = new Set(users.map(user => user.id));
        const absent = new Set(batch.filter(id => !existing.has(id)));
        for (const socket of Array.from(io.sockets.sockets.values())) {
          if (absent.has(socket.data.userId)) disconnectRemovedAccount(socket);
        }
      }
    } catch {
      // A database outage is not evidence that an account was removed.
    } finally { running = false; }
  }
  return { poll, stop: () => { stopped = true; } };
}

export function startAccountRevocationWorker(prisma: PrismaClient, io: Server): () => void {
  const poller = createAccountRevocationPoller(prisma, io);
  const timer = setInterval(() => { void poller.poll(); }, 5000);
  timer.unref();
  return () => { clearInterval(timer); poller.stop(); };
}
