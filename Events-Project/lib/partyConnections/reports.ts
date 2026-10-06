import prisma from "@/lib/prisma";
import { Actor, CommunityError, transact } from "@/lib/community/common";
import { PartyReportsSnapshot } from "@/types/partyConnections";
export async function partyReports(actor: Actor): Promise<PartyReportsSnapshot> {
  return prisma.$transaction(async tx => {
    if ((await tx.user.findUnique({ where: { id: actor.id }, select: { role: true } }))?.role !== "ADMIN") throw new CommunityError(403, "Acesso não autorizado.");
    const rows = await tx.partyReport.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 100, select: { id: true, eventId: true, reason: true, evidence: true, status: true, createdAt: true } });
    return { reports: rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })) };
  });
}
export async function reviewPartyReport(actor: Actor, id: string, status: "RESOLVED" | "DISMISSED"): Promise<void> {
  await transact(async tx => {
    if ((await tx.user.findUnique({ where: { id: actor.id }, select: { role: true } }))?.role !== "ADMIN") throw new CommunityError(403, "Acesso não autorizado.");
    await tx.partyReport.updateMany({ where: { id, status: "PENDING" }, data: { status, reviewerId: actor.id, reviewedAt: new Date() } });
  });
}
