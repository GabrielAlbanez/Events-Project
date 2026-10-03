import type { PrismaClient } from "@prisma/client";
import type { Server, Socket } from "socket.io";
import { canReadCommunityRoom, communityRoom } from "./communityAccess.mjs";
import { revokeRemovedAccount } from "./accountRevocation.mjs";

type Reply = { ok: boolean; reason?: "denied" | "unavailable" };

function subscriptionRoom(payload: unknown, userId?: string): string | null {
  if (payload && typeof payload === "object" && "user" in payload && payload.user === true) {
    if ("eventId" in payload || "roomId" in payload || "chatEventId" in payload || "partyEventId" in payload || "matchId" in payload) return null;
    return userId ? `user:${userId}` : null;
  }
  return communityRoom(payload);
}

export function registerCommunitySubscriptions(prisma: PrismaClient, socket: Socket): void {
  let windowStart = Date.now();
  let count = 0;
  let serial = 0;
  const versions = new Map<string, number>();
  const rooms = new Set<string>();
  socket.on("community-subscribe", async (payload: unknown, acknowledge?: unknown) => {
    const reply = (result: Reply) => { if (typeof acknowledge === "function") acknowledge(result); };
    if (Date.now() - windowStart > 60000) { windowStart = Date.now(); count = 0; }
    if (++count > 40) { reply({ ok: false, reason: "unavailable" }); return; }
    const room = subscriptionRoom(payload, socket.data.userId);
    if (!room) { reply({ ok: false, reason: "denied" }); return; }
    if (rooms.size >= 20 && !rooms.has(room)) { reply({ ok: false, reason: "unavailable" }); return; }
    const version = ++serial;
    versions.set(room, version);
    rooms.add(room);
    const reject = (reason: Reply["reason"]) => {
      if (versions.get(room) === version) {
        versions.delete(room); rooms.delete(room);
        if (reason === "denied" && !room.startsWith("user:")) void socket.leave(room);
      }
      reply({ ok: false, reason });
    };
    try {
      if (socket.data.expiresAt && socket.data.expiresAt <= Date.now()) { reject("denied"); return; }
      if (!await canReadCommunityRoom(prisma, room, socket.data.userId)) { reject("denied"); return; }
      if (!socket.connected || versions.get(room) !== version) { reject("unavailable"); return; }
      await socket.join(room);
      // Unsubscribe/disconnect can occur while an adapter completes its join.
      if (!socket.connected || versions.get(room) !== version) {
        if (!room.startsWith("user:")) await socket.leave(room);
        reject("unavailable"); return;
      }
      reply({ ok: true });
    } catch { reject("unavailable"); }
  });
  socket.on("community-unsubscribe", (payload: unknown) => {
    const room = subscriptionRoom(payload, socket.data.userId);
    if (!room) return;
    versions.delete(room); rooms.delete(room);
    // Personal room also carries notifications independent of this subscription.
    if (!room.startsWith("user:")) void socket.leave(room);
  });
  socket.on("disconnect", () => { versions.clear(); rooms.clear(); });
}

/** All messages contain only a room name. Private content stays in HTTP APIs. */
export async function dispatchCommunitySignal(prisma: PrismaClient, io: Server, room: string): Promise<void> {
  const personal = /^user:([a-zA-Z0-9_-]{1,128})$/.exec(room);
  if (personal && await revokeRemovedAccount(prisma, io, personal[1])) return;
  const members = Array.from(io.sockets.adapter.rooms.get(room) ?? []);
  let failed = false;
  for (let offset = 0; offset < members.length; offset += 25) {
    const results = await Promise.allSettled(members.slice(offset, offset + 25).map(async socketId => {
      const client = io.sockets.sockets.get(socketId);
      if (!client?.connected) return;
      if (client.data.expiresAt && client.data.expiresAt <= Date.now()) {
        client.emit("session-expired"); client.disconnect(true); return;
      }
      const allowed = await canReadCommunityRoom(prisma, room, client.data.userId);
      if (!client.connected) return;
      if (allowed) {
        client.emit("community-updated", { room });
        if (room.startsWith("user:")) client.emit("notification-updated");
      } else {
        await client.leave(room);
        client.emit("community-access-denied", { room });
        client.emit("community-updated", { room });
      }
    }));
    if (results.some(result => result.status === "rejected")) failed = true;
  }
  if (failed) throw new Error("Community dispatch temporarily unavailable");
}
