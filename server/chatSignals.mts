import type { PrismaClient } from "@prisma/client";
import type { Server, Socket } from "socket.io";
import { canReadCommunityRoom, communityRoom } from "./communityAccess.mjs";
import { validateSocketIdentity } from "./socketIdentity.mjs";
import { dispatchCommunitySignal } from "./communityGateway.mjs";

/** Transient hints only. Messages remain durable and authoritative in the API. */
export function registerChatSignals(prisma: PrismaClient, io: Server, socket: Socket) {
  let lastTyping = 0, lastSync = 0, busy = false;
  socket.on("typing", async (payload: unknown) => {
    if (busy || !payload || typeof payload !== "object" || !("active" in payload) || typeof payload.active !== "boolean") return;
    const room = communityRoom(payload);
    if (!room?.startsWith("match:") || Date.now() - lastTyping < (payload.active ? 1000 : 200)) return;
    lastTyping = Date.now(); busy = true;
    try {
      if (!await validateSocketIdentity(prisma, socket) || !await canReadCommunityRoom(prisma, room, socket.data.userId)) return;
      const active = payload.active;
      for (const id of Array.from(io.sockets.adapter.rooms.get(room) ?? [])) {
        const peer = io.sockets.sockets.get(id);
        if (!peer?.connected || peer.data.userId === socket.data.userId) continue;
        if (!await validateSocketIdentity(prisma, peer) || !await canReadCommunityRoom(prisma, room, peer.data.userId)) continue;
        if (socket.connected && peer.connected) peer.emit("typing", { room, userId: socket.data.userId, until: active ? Date.now() + 5000 : 0 });
      }
    } catch { /* Durable typing expiry and the HTTP fallback remain authoritative. */ }
    finally { busy = false; }
  });
  socket.on("chat-sync", async (payload: unknown) => {
    const room = communityRoom(payload);
    if (!room?.startsWith("match:") || Date.now() - lastSync < 1000) return;
    lastSync = Date.now();
    try {
      if (await validateSocketIdentity(prisma, socket) && await canReadCommunityRoom(prisma, room, socket.data.userId)) await dispatchCommunitySignal(prisma, io, room);
    } catch { /* Transactional outbox retries delivery on the next worker tick. */ }
  });
}
