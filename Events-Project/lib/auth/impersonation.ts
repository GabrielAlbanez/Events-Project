import type { PrismaClient } from "@prisma/client";
import type { JWT } from "next-auth/jwt";
import { credentialSessionValid } from "./sessionCredential";
import { isAccountSuspended, accountSessionValid } from "./accountAccess";

export const IMPERSONATION_DURATION_MS = 15 * 60 * 1000;
export const IMPERSONATION_BLOCK_MESSAGE = "Um administrador está acessando sua conta no momento. Tente novamente em instantes.";
const identitySelect = { id: true, role: true, name: true, email: true, image: true, emailVerified: true, password: true, suspendedAt: true, suspendedUntil: true, sessionVersion: true } as const;

/** Always verify the original credential; a target password never authenticates an admin. */
export async function resolveImpersonationIdentity(db: PrismaClient, token: JWT) {
  const original = typeof token.id === "string" && token.id ? await db.user.findUnique({ where: { id: token.id }, select: identitySelect }) : null;
  if (!original || token.provider === "dev-admin" || !credentialSessionValid(token.provider, token.credentialStamp, original.password) || isAccountSuspended(original) || !accountSessionValid(token.sessionVersion, original.sessionVersion)) {
    await endImpersonation(db, token);
    return { user: null, blocked: false, impersonation: null };
  }
  const now = new Date();
  if (typeof token.impersonationId === "string") {
    const record = await db.impersonationSession.findUnique({ where: { id: token.impersonationId }, include: { user: { select: identitySelect } } });
    if (record && record.user && record.adminId === original.id && !record.endedAt && record.expiresAt > now && original.role === "ADMIN" && record.user.role !== "ADMIN" && !isAccountSuspended(record.user) && record.userId !== original.id) {
      return { user: record.user, blocked: false, impersonation: { id: record.id, userName: record.user.name ?? "Usuário", expiresAt: record.expiresAt.toISOString() } };
    }
    if (record && record.adminId === original.id && !record.endedAt) {
      await db.impersonationSession.updateMany({ where: { id: record.id, endedAt: null }, data: { endedAt: now } });
    }
  }
  const blocked = Boolean(await db.impersonationSession.findFirst({ where: { OR: [{ userId: original.id, admin: { role: "ADMIN" } }, { adminId: original.id }], endedAt: null, expiresAt: { gt: now } }, select: { id: true } }));
  return { user: blocked ? null : original, blocked, impersonation: null };
}

export async function startImpersonation(db: PrismaClient, token: JWT, userId: string, ip: string | null, reason: string) {
  if (typeof reason !== "string" || reason.trim().length < 5 || reason.trim().length > 500) throw new Error("Informe uma justificativa entre 5 e 500 caracteres.");
  if (token.impersonationId) throw new Error("Saia da visualização atual primeiro.");
  const identity = await resolveImpersonationIdentity(db, token);
  if (identity.user?.role !== "ADMIN") throw new Error("Acesso restrito ao administrador.");
  const adminId = identity.user.id;
  if (adminId === userId) throw new Error("Não é permitido acessar a própria conta.");
  return db.$transaction(async (tx) => {
    // Serialize starts by target: two administrators cannot acquire the same account.
    // PostgreSQL returns void for advisory locks; cast it so Prisma can deserialize the result.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"impersonation-admin:" + adminId}))::text`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"impersonation-target:" + userId}))::text`;
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${adminId}, ${userId}) ORDER BY "id" FOR UPDATE`;
    const currentAdmin = await tx.user.findUnique({ where: { id: adminId }, select: { role: true, password: true, suspendedAt: true, suspendedUntil: true, sessionVersion: true } });
    if (currentAdmin?.role !== "ADMIN" || !credentialSessionValid(token.provider, token.credentialStamp, currentAdmin.password) || isAccountSuspended(currentAdmin) || !accountSessionValid(token.sessionVersion, currentAdmin.sessionVersion)) throw new Error("Acesso restrito ao administrador.");
    const target = await tx.user.findUnique({ where: { id: userId }, select: { role: true, suspendedAt: true, suspendedUntil: true } });
    if (!target || target.role === "ADMIN" || isAccountSuspended(target)) throw new Error("Essa conta não pode ser acessada.");
    const now = new Date();
    if (await tx.impersonationSession.findFirst({ where: { adminId, endedAt: null, expiresAt: { gt: now } } })) throw new Error("Saia da visualização atual primeiro.");
    await tx.impersonationSession.updateMany({ where: { userId, endedAt: null, expiresAt: { lte: now } }, data: { endedAt: now } });
    if (await tx.impersonationSession.findFirst({ where: { userId, endedAt: null, expiresAt: { gt: now } } })) throw new Error("Essa conta já está sendo acessada.");
    return tx.impersonationSession.create({ data: { adminId, userId, adminAccountId: adminId, userAccountId: userId, expiresAt: new Date(now.getTime() + IMPERSONATION_DURATION_MS), reason: reason.trim(), ip } });
  });
}

export async function endImpersonation(db: PrismaClient, token: JWT): Promise<void> {
  if (typeof token.id !== "string" || typeof token.impersonationId !== "string") return;
  await db.impersonationSession.updateMany({ where: { id: token.impersonationId, adminId: token.id, endedAt: null }, data: { endedAt: new Date() } });
}

/** Close expired audit records even when the administrator has closed the browser. */
export async function expireImpersonationSessions(db: PrismaClient): Promise<number> {
  return db.$executeRaw`UPDATE "ImpersonationSession" SET "endedAt" = "expiresAt" WHERE "endedAt" IS NULL AND "expiresAt" <= ${new Date()}`;
}
