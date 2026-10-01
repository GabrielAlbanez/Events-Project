import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { EventReportError, reportEvent } from "@/lib/services/eventReports";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ message: "Origem inválida." }, { status: 403 });
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ message: "Entre na sua conta para denunciar." }, { status: 401 });
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") throw new EventReportError("Dados inválidos.", 400);
    const value = body as Record<string, unknown>;
    if (typeof value.reason !== "string" || typeof value.details !== "string") throw new EventReportError("Dados inválidos.", 400);
    const report = await reportEvent(params.id, user.id, { reason: value.reason, details: value.details });
    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof EventReportError ? error.message : "Não foi possível enviar a denúncia." }, { status: error instanceof EventReportError ? error.status : 503 });
  }
}
