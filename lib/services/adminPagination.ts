import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { publicEventSelect } from "@/lib/eventQueries";
import type { ResolveAdminId } from "./authContext";

export async function getAdminUsersPage(resolveAdmin: ResolveAdminId, input: { page?: number; q?: string; role?: string } = {}) {
  if (!await resolveAdmin()) return { status: "error", message: "Acesso negado." };
  const page = Number.isSafeInteger(input.page) && input.page! > 0 ? Math.min(input.page!, 100000) : 1;
  const pageSize = 25;
  const q = (input.q ?? "").trim().slice(0, 100);
  const role = input.role;
  const where: Prisma.UserWhereInput = {
    ...(role === "ADMIN" || role === "PROMOTER" || role === "BASIC" ? { role } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [users, total, all, admins, promoters] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { id: "asc" }, skip: (page - 1) * pageSize, take: pageSize,
      select: { id: true, name: true, email: true, role: true, image: true, emailVerified: true } }),
    prisma.user.count({ where }), prisma.user.count(), prisma.user.count({ where: { role: "ADMIN" } }), prisma.user.count({ where: { role: "PROMOTER" } }),
  ]);
  return { status: "success", data: users.map(user => ({ ...user, Events: [] })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }, counts: { total: all, admins, promoters } };
}

export async function getAdminUserEvents(resolveAdmin: ResolveAdminId, userId: string, page = 1) {
  if (!await resolveAdmin()) return null;
  const safePage = Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100000) : 1;
  const events = await prisma.events.findMany({ where: { userId }, orderBy: { id: "asc" }, skip: (safePage - 1) * 10, take: 11, select: publicEventSelect });
  return { events: events.slice(0, 10), hasMore: events.length > 10 };
}
