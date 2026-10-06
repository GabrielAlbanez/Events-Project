import prisma from "@/lib/prisma";
import { Prisma, PartyProfile } from "@prisma/client";
import { Actor, CommunityError } from "@/lib/community/common";
import { PartyConnectionsSnapshot, PartyIntent, PartyPublicProfile } from "@/types/partyConnections";
import { compatible, partyParticipant } from "./access";
import { receiptData, receiptKey } from "./receipts";

export function publicProfile(profile: PartyProfile, liked = false): PartyPublicProfile {
  return { userId: profile.userId, displayName: profile.displayName, photoUrl: profile.photoUrl, bio: profile.bio, interests: profile.interests, intent: profile.intent as PartyIntent, liked };
}
export async function connectionsSnapshot(eventId: string, actor: Actor, after?: string): Promise<PartyConnectionsSnapshot> {
  return prisma.$transaction(async tx => {
    const event = await tx.events.findUnique({ where: { id: eventId }, select: { id: true, nome: true, status: true } });
    if (!event) throw new CommunityError(404, "Evento não encontrado.");
    if (!["PUBLISHED", "ENDED"].includes(event.status)) throw new CommunityError(404, "Evento indisponível.");
    if (!await tx.user.findUnique({ where: { id: actor.id }, select: { id: true } })) throw new CommunityError(401, "Entre novamente.");
    const own = await tx.partyProfile.findUnique({ where: { eventId_userId: { eventId, userId: actor.id } } });
    const eligible = await partyParticipant(tx, eventId, actor.id);
    const blockRows = await tx.partyBlock.findMany({ where: { fromId: actor.id }, take: 200 });
    const blocks = blockRows.map(row => ({ userId: row.toId, displayName: "Pessoa bloqueada" }));
    const result: PartyConnectionsSnapshot = { event: { id: event.id, name: event.nome }, eligible, mine: own ? { displayName: own.displayName, photoUrl: own.photoUrl, bio: own.bio, interests: own.interests, intent: own.intent as PartyIntent, adultDeclared: own.adultDeclared, active: own.active } : null, profiles: [], matches: [], nextAfter: null, blocks };
    if (!eligible || !own?.active) return result;
    const [candidates, matches] = await Promise.all([
      tx.partyProfile.findMany({ where: { eventId, active: true, userId: { not: actor.id, ...(after ? { gt: after } : {}) } }, orderBy: { userId: "asc" }, take: 41 }),
      tx.partyMatch.findMany({ where: { eventId, active: true, OR: [{ userAId: actor.id }, { userBId: actor.id }] }, orderBy: { createdAt: "desc" }, take: 100 }),
    ]);
    const ids = Array.from(new Set([...candidates.map(profile => profile.userId), ...matches.map(match => match.userAId === actor.id ? match.userBId : match.userAId)]));
    const [profiles, registrations, pairBlocks, likes] = await Promise.all([
      tx.partyProfile.findMany({ where: { eventId, userId: { in: ids }, active: true } }),
      tx.eventRegistration.findMany({ where: { eventId, userId: { in: ids }, status: { in: ["CONFIRMED", "CHECKED_IN"] } }, select: { userId: true } }),
      tx.partyBlock.findMany({ where: { OR: [{ fromId: actor.id, toId: { in: ids } }, { toId: actor.id, fromId: { in: ids } }] }, select: { fromId: true, toId: true } }),
      tx.partyLike.findMany({ where: { eventId, fromId: actor.id, toId: { in: candidates.map(profile => profile.userId) } }, select: { toId: true } }),
    ]);
    const registered = new Set(registrations.map(row => row.userId));
    const excluded = new Set(pairBlocks.map(row => row.fromId === actor.id ? row.toId : row.fromId));
    const liked = new Set(likes.map(row => row.toId));
    const available = new Map(profiles.filter(profile => registered.has(profile.userId) && !excluded.has(profile.userId) && compatible(own, profile)).map(profile => [profile.userId, profile]));
    for (const candidate of candidates.slice(0, 40)) {
      if (available.has(candidate.userId)) result.profiles.push(publicProfile(candidate, liked.has(candidate.userId)));
    }
    if (candidates.length > 40) result.nextAfter = candidates[39].userId;
    for (const match of matches) {
      const partner = available.get(match.userAId === actor.id ? match.userBId : match.userAId);
      if (partner) result.matches.push({ id: match.id, profile: publicProfile(partner, true), createdAt: match.createdAt.toISOString() });
    }
    if (result.matches.length) {
      const receipts = await tx.communityEntry.findMany({ where: { id: { in: result.matches.map(match => receiptKey(match.id, actor.id)) }, authorId: actor.id, kind: "party.receipt" } });
      const read = new Map(receipts.map(row => [row.id, receiptData(row).readThrough]));
      const counts = await tx.partyMessage.groupBy({ by: ["matchId"], where: { OR: result.matches.map(match => ({ matchId: match.id, authorId: { not: actor.id }, id: { gt: read.get(receiptKey(match.id, actor.id)) ?? 0 } })) }, _count: { _all: true } });
      const unread = new Map(counts.map(row => [row.matchId, row._count._all]));
      // Aggregate IDs first: fetch at most one preview per authorized match, never its full history.
      const latestIds = await tx.partyMessage.groupBy({ by: ["matchId"], where: { matchId: { in: result.matches.map(match => match.id) } }, _max: { id: true } });
      const previews = await tx.partyMessage.findMany({ where: { id: { in: latestIds.flatMap(row => row._max.id === null ? [] : [row._max.id]) } }, select: { matchId: true, text: true, createdAt: true, authorId: true }, take: result.matches.length });
      const latest = new Map(previews.map(row => [row.matchId, { text: row.text ? row.text.slice(0, 160) : "Foto", createdAt: row.createdAt.toISOString(), own: row.authorId === actor.id }]));
      result.matches = result.matches.map(match => ({ ...match, unreadCount: unread.get(match.id) ?? 0, lastMessage: latest.get(match.id) }));
    }
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
}
