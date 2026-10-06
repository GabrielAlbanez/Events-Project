import type { Prisma, CommunityEntry } from "@prisma/client";
import { CommunityError, signal, transact, type Actor } from "@/lib/community/common";
import { matchAccess } from "./access";
export type PrivateReceipt = { deliveredThrough: number; readThrough: number; typingUntil: number; lastTypingAt: number };
export const receiptKind = "party.receipt";
const empty = (): PrivateReceipt => ({ deliveredThrough: 0, readThrough: 0, typingUntil: 0, lastTypingAt: 0 });
export function receiptKey(matchId: string, userId: string): string { return `party-receipt:${matchId}:${userId}`; }
export function receiptData(row: Pick<CommunityEntry, "data"> | null): PrivateReceipt {
  const result = empty();
  if (!row || typeof row.data !== "object" || row.data === null || Array.isArray(row.data)) return result;
  for (const key of Object.keys(result) as (keyof PrivateReceipt)[]) {
    const value = row.data[key];
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) result[key] = value;
  }
  return result;
}
export async function getReceipt(tx: Prisma.TransactionClient, matchId: string, userId: string): Promise<PrivateReceipt> {
  return receiptData(await tx.communityEntry.findUnique({ where: { id: receiptKey(matchId, userId) } }));
}
export async function privateControl(eventId: string, matchId: string, actor: Actor, input: { action: "typing"; active: boolean } | { action: "receipt"; messageId: number; read: boolean }) {
  return transact(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`match:${matchId}`}, 0))`;
    const access = await matchAccess(tx, matchId, actor);
    if (access.match.eventId !== eventId) throw new CommunityError(403, "Conversa indisponível.");
    const previous = await getReceipt(tx, matchId, actor.id);
    const next = { ...previous }; const now = Date.now();
    if (input.action === "typing") {
      if (input.active && now - previous.lastTypingAt < 1500) return { ok: true };
      if (!input.active && previous.typingUntil === 0) return { ok: true };
      next.lastTypingAt = now; next.typingUntil = input.active ? now + 5000 : 0;
    } else {
      const message = await tx.partyMessage.findUnique({ where: { id: input.messageId } });
      if (!message || message.matchId !== matchId || message.authorId === actor.id) throw new CommunityError(400, "Confirmação de mensagem inválida.");
      next.deliveredThrough = Math.max(previous.deliveredThrough, message.id);
      if (input.read) next.readThrough = Math.max(previous.readThrough, message.id);
      if (next.deliveredThrough === previous.deliveredThrough && next.readThrough === previous.readThrough) return { ok: true };
    }
    // Private metadata reuses the existing generic persistence, excluded from community snapshots.
    await tx.communityEntry.upsert({ where: { id: receiptKey(matchId, actor.id) }, create: { id: receiptKey(matchId, actor.id), eventId, authorId: actor.id, kind: receiptKind, data: next }, update: { data: next } });
    await signal(tx, `match:${matchId}`);
    if (input.action === "receipt") await signal(tx, `user:${actor.id}`);
    return { ok: true };
  });
}
