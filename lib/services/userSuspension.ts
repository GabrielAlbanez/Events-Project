import type { PrismaClient } from "@prisma/client";

export class SuspensionError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}
export function moderationReason(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < 5 || value.trim().length > 500) throw new SuspensionError("Informe um motivo entre 5 e 500 caracteres.");
  return value.trim();
}
export function suspensionActive(user: { suspendedAt?: Date | null; suspendedUntil?: Date | null }, now = new Date()): boolean {
  return Boolean(user.suspendedAt && (!user.suspendedUntil || user.suspendedUntil > now));
}
export function parseSuspension(input: unknown) {
  if (!input || typeof input !== "object" || !("action" in input) || (input.action !== "suspend" && input.action !== "resume")) throw new SuspensionError("Ação inválida.");
  const reason = moderationReason("reason" in input ? input.reason : undefined);
  const rawUntil = "until" in input ? input.until : null;
  const until = rawUntil == null ? null : typeof rawUntil === "string" && /^\d{4}-\d{2}-\d{2}T/.test(rawUntil) ? new Date(rawUntil) : new Date(NaN);
  if (until && (!Number.isFinite(until.getTime()) || until.getTime() <= Date.now() || until.getTime() > Date.now() + 365 * 86400000)) throw new SuspensionError("Escolha um prazo futuro de até 365 dias.");
  return { action: input.action, reason, until: input.action === "suspend" ? until : null };
}
export async function changeUserSuspension(db: PrismaClient, actorId: string, userId: string, input: unknown) {
  const change = parseSuspension(input);
  if (actorId === userId) throw new SuspensionError("Você não pode suspender a própria conta.", 403);
  return db.$transaction(async tx => {
    // The same account lock used by impersonation prevents acquisition during suspension.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"impersonation-admin:" + actorId}))::text`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"impersonation-target:" + userId}))::text`;
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${actorId}, ${userId}) ORDER BY "id" FOR UPDATE`;
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, suspendedAt: true, suspendedUntil: true } });
    if (actor?.role !== "ADMIN" || suspensionActive(actor)) throw new SuspensionError("Acesso negado.", 403);
    const target = await tx.user.findUnique({ where: { id: userId }, select: { role: true, suspendedAt: true, suspendedUntil: true } });
    if (!target) throw new SuspensionError("Usuário não encontrado.", 404);
    if (target.role === "ADMIN") throw new SuspensionError("Administradores não podem ser suspensos.", 403);
    if (change.action === "suspend" && suspensionActive(target)) throw new SuspensionError("A conta já está suspensa.", 409);
    if (change.action === "resume" && !target.suspendedAt) throw new SuspensionError("A conta não está suspensa.", 409);
    const now = new Date();
    const changed = await tx.user.updateMany({ where: { id: userId, role: { not: "ADMIN" } }, data: { suspendedAt: change.action === "suspend" ? now : null, suspendedUntil: change.until, suspensionReason: change.action === "suspend" ? change.reason : null, suspendedById: change.action === "suspend" ? actorId : null, sessionVersion: { increment: 1 } } });
    if (changed.count !== 1) throw new SuspensionError("Essa conta não pode ser alterada.", 409);
    await tx.userSuspensionAudit.create({ data: { actorId, userId, action: change.action.toUpperCase(), reason: change.reason, until: change.until } });
    await tx.impersonationSession.updateMany({ where: { userId, endedAt: null }, data: { endedAt: now } });
    await tx.communitySignal.createMany({ data: [{ room: `user:${userId}` }, { room: `user:${actorId}` }] });
    return { suspendedAt: change.action === "suspend" ? now : null, suspendedUntil: change.until, suspensionReason: change.action === "suspend" ? change.reason : null, active: change.action === "suspend" };
  });
}

