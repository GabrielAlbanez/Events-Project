import { Prisma, ReportStatus } from "@prisma/client";
import prisma from "@/lib/prisma";

const reasons = ["INCORRECT_INFORMATION", "INAPPROPRIATE_CONTENT", "SPAM", "OTHER"] as const;
type ReportReason = typeof reasons[number];

export class EventReportError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

export async function reportEvent(eventId: string, reporterId: string, input: { reason: string; details: string }) {
  if (!reasons.includes(input.reason as ReportReason) || input.details.trim().length < 5 || input.details.trim().length > 1000)
    throw new EventReportError("Escolha um motivo e descreva o problema em 5 a 1000 caracteres.", 400);
  const event = await prisma.events.findUnique({ where: { id: eventId }, select: { id: true, nome: true, userId: true, status: true } });
  if (!event || event.status !== "PUBLISHED") throw new EventReportError("Evento indisponível para denúncia.", 404);
  if (event.userId === reporterId) throw new EventReportError("Você não pode denunciar seu próprio evento.", 403);
  try {
    return await prisma.$transaction(async (tx) => {
      const report = await tx.eventReport.create({ data: { eventId, reporterId, reason: input.reason, details: input.details.trim() }, select: { id: true, status: true } });
      const admins = await tx.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
      if (admins.length) await tx.notification.createMany({ data: admins.map(admin => ({ userId: admin.id, title: "Nova denúncia de evento", message: `O evento ${event.nome} recebeu uma denúncia.`, href: "/admin/reports" })) });
      return report;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new EventReportError("Você já denunciou este evento. A equipe analisará sua denúncia.", 409);
    throw error;
  }
}

export async function listEventReports() {
  const reports = await prisma.eventReport.findMany({
    select: {
      id: true, reason: true, details: true, status: true, createdAt: true, reviewedAt: true, resolutionNote: true,
      event: { select: { id: true, nome: true, status: true } },
      reporter: { select: { id: true, name: true, email: true } },
      reviewer: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return reports.sort((a, b) => (a.status === "PENDING" ? 0 : 1) - (b.status === "PENDING" ? 0 : 1));
}

export async function reviewEventReport(reportId: string, adminId: string, input: { status: ReportStatus; resolutionNote?: string }) {
  if (input.status !== "RESOLVED" && input.status !== "DISMISSED")
    throw new EventReportError("Decisão inválida.", 400);
  const note = input.resolutionNote?.trim() || null;
  if (note && note.length > 1000) throw new EventReportError("A observação deve ter até 1000 caracteres.", 400);
  const changed = await prisma.eventReport.updateMany({
    where: { id: reportId, status: "PENDING" },
    data: { status: input.status, resolutionNote: note, reviewedById: adminId, reviewedAt: new Date() },
  });
  if (!changed.count) throw new EventReportError("Denúncia já analisada ou inexistente.", 409);
  return prisma.eventReport.findUniqueOrThrow({ where: { id: reportId }, select: {
    id: true, reason: true, details: true, status: true, createdAt: true, reviewedAt: true, resolutionNote: true,
    event: { select: { id: true, nome: true, status: true } },
    reporter: { select: { id: true, name: true, email: true } },
    reviewer: { select: { id: true, name: true } },
  } });
}
