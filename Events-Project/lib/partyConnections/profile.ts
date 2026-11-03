import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { Actor, CommunityError, transact } from "@/lib/community/common";
import { PartySavedProfileInput } from "@/schemas/partyConnections";
import { PartySavedProfile, PartySavedProfileSnapshot } from "@/types/partyConnections";

export function savedProfile(profile: PartySavedProfile): PartySavedProfile {
  return { displayName: profile.displayName, photoUrl: profile.photoUrl, bio: profile.bio, interests: profile.interests, intent: profile.intent, adultDeclared: profile.adultDeclared };
}
export async function lockPartyUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`party-user:${userId}`}, 0))`;
}
function privatePhotoId(photoUrl: string): string | null {
  return /\/(?:v1\/media\/events|api\/party-profile-media)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(photoUrl)?.[1].toLowerCase() ?? null;
}
export async function savePartyProfile(tx: Prisma.TransactionClient, actor: Actor, input: PartySavedProfileInput): Promise<void> {
  if (!await tx.user.findUnique({ where: { id: actor.id }, select: { id: true } })) throw new CommunityError(401, "Entre novamente.");
  if (input.intent === "DATING" && !input.adultDeclared) throw new CommunityError(403, "Paquera exige declaração de maioridade.");
  const participations = await tx.partyProfile.findMany({ where: { userId: actor.id }, select: { eventId: true, photoUrl: true } });
  const privateId = privatePhotoId(input.photoUrl);
  if (privateId) {
    const previous = await tx.partyUserProfile.findUnique({ where: { userId: actor.id }, select: { photoUrl: true } });
    // Imported private media may be retained, but knowledge of another asset UUID grants no ownership.
    if (privatePhotoId(previous?.photoUrl ?? "") !== privateId && !participations.some(row => privatePhotoId(row.photoUrl) === privateId)) {
      const owned = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "MobileEventMedia" WHERE id = ${privateId} AND "ownerId" = ${actor.id} LIMIT 1
      `;
      if (!owned.length) throw new CommunityError(403, "Use uma foto enviada por sua conta.");
    }
  }
  const profile = savedProfile(input);
  await tx.partyUserProfile.upsert({ where: { userId: actor.id }, create: { userId: actor.id, ...profile }, update: { ...profile, needsReview: false } });
  // Materialized event profiles retain their individual opt-in and match state.
  await tx.partyProfile.updateMany({ where: { userId: actor.id }, data: profile });
  const matches = await tx.partyMatch.findMany({ where: { OR: [{ userAId: actor.id }, { userBId: actor.id }] }, select: { id: true, userAId: true, userBId: true } });
  const rooms = new Set<string>([`user:${actor.id}`]);
  for (const participation of participations) rooms.add(`party:${participation.eventId}`);
  for (const match of matches) {
    rooms.add(`match:${match.id}`);
    rooms.add(`user:${match.userAId === actor.id ? match.userBId : match.userAId}`);
  }
  await tx.communitySignal.createMany({ data: Array.from(rooms, room => ({ room })) });
}
export async function partyProfileSnapshot(actor: Actor): Promise<PartySavedProfileSnapshot> {
  const profile = await prisma.partyUserProfile.findUnique({ where: { userId: actor.id } });
  return { profile: profile ? savedProfile({ ...profile, intent: profile.intent as PartySavedProfile["intent"] }) : null, needsReview: profile?.needsReview ?? false };
}
export async function updatePartyProfile(actor: Actor, input: PartySavedProfileInput): Promise<void> {
  await transact(async tx => { await lockPartyUser(tx, actor.id); await savePartyProfile(tx, actor, input); }, { maxWait: 10000, timeout: 15000 });
}
