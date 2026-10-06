import type { PrismaClient } from "@prisma/client";
import { canReadEventChat } from "./eventChatAccess.mjs";
import { canReadPartyConnections, canReadPartyMatch } from "./partyConnectionsAccess.mjs";

export type CommunitySubscription = { eventId?: string; roomId?: string; chatEventId?: string; partyEventId?: string; matchId?: string };

export function communityRoom(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as CommunitySubscription;
  const validId = (id: unknown): id is string => typeof id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
  const selectors = ["eventId", "roomId", "chatEventId", "partyEventId", "matchId"] as const;
  const present = selectors.filter(key => value[key] !== undefined);
  if (present.length !== 1 || "user" in payload) return null;
  const key = present[0], id = value[key];
  if (!validId(id)) return null;
  const prefix = { eventId: "event", roomId: "friends", chatEventId: "chat", partyEventId: "party", matchId: "match" };
  return `${prefix[key]}:${id}`;
}

/** Recheck database membership; a previously joined room is not an access grant. */
export async function canReadCommunityRoom(prisma: PrismaClient, room: string, userId?: string): Promise<boolean> {
  const [kind, id, extra] = room.split(":");
  if (!id || extra || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return false;
  if (kind === "chat") return canReadEventChat(prisma, id, userId);
  if (kind === "party") return canReadPartyConnections(prisma, id, userId);
  if (kind === "match") return canReadPartyMatch(prisma, id, userId);
  if (kind === "user") return Boolean(userId && userId === id && await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }));
  if (kind === "friends") {
    if (!userId) return false;
    return Boolean(await prisma.friendsRoomMember.findUnique({ where: { roomId_userId: { roomId: id, userId } }, select: { userId: true } }));
  }
  if (kind !== "event") return false;
  const event = await prisma.events.findUnique({ where: { id }, select: { status: true, userId: true } });
  if (!event) return false;
  if (event.status === "PUBLISHED" || event.status === "ENDED") return true;
  if (!userId) return false;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) return false;
  if (event.userId === userId || user.role === "ADMIN") return true;
  return Boolean(await prisma.communityTeamMember.findUnique({ where: { eventId_userId: { eventId: id, userId } }, select: { userId: true } }));
}
