import prisma from "@/lib/prisma";
import { Prisma, PartyProfile } from "@prisma/client";
import { Actor, CommunityError } from "@/lib/community/common";
import { PartyInboxItem, PartyInboxSnapshot } from "@/types/partyConnections";
import { compatible } from "./access";
import { matchSummaries, publicProfile } from "./snapshot";

export const inboxLimit = 100;
const key = (eventId: string, userId: string) => `${eventId}:${userId}`;

/**
 * Every conversation the actor may open right now, across events. Each match passes the same
 * rules as matchAccess/pairAccess (active profiles, confirmed registration, published event,
 * existing accounts, no block, compatible intents), evaluated in batched queries.
 */
export async function connectionsInbox(actor: Actor): Promise<PartyInboxSnapshot> {
  return prisma.$transaction(async tx => {
    if (!await tx.user.findUnique({ where: { id: actor.id }, select: { id: true } })) throw new CommunityError(401, "Entre novamente.");
    const matches = await tx.partyMatch.findMany({ where: { active: true, OR: [{ userAId: actor.id }, { userBId: actor.id }] }, orderBy: { createdAt: "desc" }, take: inboxLimit });
    const candidates = matches.filter(match => match.userAId !== match.userBId).map(match => ({ match, partnerId: match.userAId === actor.id ? match.userBId : match.userAId }));
    if (!candidates.length) return { items: [] };
    const eventIds = Array.from(new Set(candidates.map(item => item.match.eventId)));
    const partnerIds = Array.from(new Set(candidates.map(item => item.partnerId)));
    const people = [actor.id, ...partnerIds];
    const [events, profiles, registrations, blocks, accounts] = await Promise.all([
      tx.events.findMany({ where: { id: { in: eventIds }, status: { in: ["PUBLISHED", "ENDED"] } }, select: { id: true, nome: true, dataInicio: true } }),
      tx.partyProfile.findMany({ where: { eventId: { in: eventIds }, userId: { in: people }, active: true } }),
      tx.eventRegistration.findMany({ where: { eventId: { in: eventIds }, userId: { in: people }, status: { in: ["CONFIRMED", "CHECKED_IN"] } }, select: { eventId: true, userId: true } }),
      tx.partyBlock.findMany({ where: { OR: [{ fromId: actor.id, toId: { in: partnerIds } }, { toId: actor.id, fromId: { in: partnerIds } }] }, select: { fromId: true, toId: true } }),
      tx.user.findMany({ where: { id: { in: partnerIds } }, select: { id: true } }),
    ]);
    const eventById = new Map(events.map(event => [event.id, event]));
    const profileByKey = new Map<string, PartyProfile>(profiles.map(profile => [key(profile.eventId, profile.userId), profile]));
    const registered = new Set(registrations.map(row => key(row.eventId, row.userId)));
    const excluded = new Set(blocks.map(row => row.fromId === actor.id ? row.toId : row.fromId));
    const existing = new Set(accounts.map(row => row.id));
    const allowed = candidates.flatMap(({ match, partnerId }) => {
      const event = eventById.get(match.eventId);
      const own = profileByKey.get(key(match.eventId, actor.id)), partner = profileByKey.get(key(match.eventId, partnerId));
      if (!event || !own || !partner || !existing.has(partnerId) || excluded.has(partnerId)) return [];
      if (!registered.has(key(match.eventId, actor.id)) || !registered.has(key(match.eventId, partnerId)) || !compatible(own, partner)) return [];
      return [{ match, partner, event }];
    });
    const summaries = await matchSummaries(tx, actor.id, allowed.map(item => item.match.id));
    const items: PartyInboxItem[] = allowed.map(({ match, partner, event }) => ({
      id: match.id, profile: publicProfile(partner, true), createdAt: match.createdAt.toISOString(),
      ...summaries.get(match.id)!,
      event: { id: event.id, name: event.nome, date: event.dataInicio },
    }));
    const activity = (item: PartyInboxItem) => new Date(item.lastMessage?.createdAt ?? item.createdAt ?? 0).getTime();
    return { items: items.sort((a, b) => activity(b) - activity(a)) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
}
