import type { CommunityEntry, Prisma } from "@prisma/client";
import { CommunityError } from "@/lib/community/common";
export const chatImageKind = "party.image";
export function imageData(entry: CommunityEntry | null) {
  if (!entry || entry.kind !== chatImageKind || !entry.data || typeof entry.data !== "object" || Array.isArray(entry.data)) return null;
  const { matchId, filename, messageId } = entry.data;
  if (typeof matchId !== "string" || typeof filename !== "string") return null;
  return { matchId, filename, messageId: typeof messageId === "number" ? messageId : null };
}
export function chatImageUrl(eventId: string, matchId: string, imageId: string) {
  return `/api/party-connections/${encodeURIComponent(eventId)}/matches/${encodeURIComponent(matchId)}/images/${encodeURIComponent(imageId)}`;
}
export async function bindChatImage(tx: Prisma.TransactionClient, eventId: string, matchId: string, userId: string, imageId: string, messageId: number) {
  const row = await tx.communityEntry.findUnique({ where: { id: imageId } });
  const image = imageData(row);
  if (!row || !image || row.eventId !== eventId || row.authorId !== userId || image.matchId !== matchId || (image.messageId !== null && image.messageId !== messageId)) throw new CommunityError(400, "Imagem indisponível para este envio.");
  await tx.communityEntry.update({ where: { id: imageId }, data: { data: { matchId, filename: image.filename, messageId } } });
}
