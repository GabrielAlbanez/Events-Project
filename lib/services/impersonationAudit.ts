import type { Prisma, PrismaClient } from "@prisma/client";
import { SuspensionError, suspensionActive } from "./userSuspension";

export async function getImpersonationAudit(db: PrismaClient, adminId: string, params: URLSearchParams) {
  const admin = await db.user.findUnique({ where: { id: adminId }, select: { role: true, suspendedAt: true, suspendedUntil: true } });
  if (admin?.role !== "ADMIN" || suspensionActive(admin)) throw new SuspensionError("Acesso negado.", 403);
  const page = Math.max(1, Math.min(100000, Number(params.get("page")) || 1));
  if (!Number.isSafeInteger(page)) throw new SuspensionError("Página inválida.");
  const pageSize = 25, now = new Date();
  const status = params.get("status") ?? "all";
  if (!["all", "active", "ended", "expired"].includes(status)) throw new SuspensionError("Status inválido.");
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const date = (name: string) => { const raw = params.get(name); if (!raw) return undefined; if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || (!Number.isFinite(new Date(raw).getTime()) || new Date(raw).toISOString().slice(0, 10) !== raw)) throw new SuspensionError("Data inválida."); return new Date(raw); };
  const from = date("from"), to = date("to");
  if (from && to && from > to) throw new SuspensionError("Intervalo de datas inválido.");
  const where: Prisma.ImpersonationSessionWhereInput = {
    ...(status === "active" ? { endedAt: null, expiresAt: { gt: now } } : status === "ended" ? { endedAt: { lt: db.impersonationSession.fields.expiresAt } } : status === "expired" ? { expiresAt: { lte: now }, OR: [{ endedAt: null }, { endedAt: { gte: db.impersonationSession.fields.expiresAt } }] } : {}),
    ...(from || to ? { startedAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: new Date(to.getTime() + 86400000) } : {}) } } : {}),
  };
  if (q) where.AND = [{ OR: [{ admin: { name: { contains: q, mode: "insensitive" } } }, { user: { name: { contains: q, mode: "insensitive" } } }, { adminId: q }, { userId: q }] }];
  const [rows, total] = await Promise.all([db.impersonationSession.findMany({ where, orderBy: [{ startedAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize, select: { id: true, adminId: true, userId: true, reason: true, ip: true, startedAt: true, expiresAt: true, endedAt: true, admin: { select: { name: true } }, user: { select: { name: true } } } }), db.impersonationSession.count({ where })]);
  return { data: rows.map(({ admin: actor, user, ...row }) => ({ ...row, adminName: actor?.name ?? "Conta removida", userName: user?.name ?? "Conta removida", status: row.endedAt && row.endedAt < row.expiresAt ? "ended" : row.expiresAt <= now ? "expired" : "active" })), pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}


