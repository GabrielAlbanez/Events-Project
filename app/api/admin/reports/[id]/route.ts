import { ReportStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAdminId } from "@/lib/adminAuth";
import { EventReportError, reviewEventReport } from "@/lib/services/eventReports";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ message: "Origem inválida." }, { status: 403 });
  const adminId = await getAuthenticatedAdminId(request);
  if (!adminId) return NextResponse.json({ message: "Acesso negado." }, { status: 403 });
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") throw new EventReportError("Dados inválidos.", 400);
    const value = body as Record<string, unknown>;
    if (value.status !== "RESOLVED" && value.status !== "DISMISSED") throw new EventReportError("Decisão inválida.", 400);
    if (value.resolutionNote !== undefined && typeof value.resolutionNote !== "string") throw new EventReportError("Observação inválida.", 400);
    const report = await reviewEventReport(params.id, adminId, { status: value.status as ReportStatus, resolutionNote: value.resolutionNote as string | undefined });
    return NextResponse.json({ report });
  } catch (error) {
    return NextResponse.json({ message: error instanceof EventReportError ? error.message : "Não foi possível analisar a denúncia." }, { status: error instanceof EventReportError ? error.status : 503 });
  }
}
