import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { AttendanceError, getAttendeeExport } from "@/lib/services/attendance";
import { attendeesCsv, attendeesCsvFilename } from "@/lib/organizerOps/attendeesCsv";

export const dynamic = "force-dynamic";

/** CSV de participantes para dono do evento ou admin (OPP-05). Separador ";" com BOM UTF-8 para o Excel pt-BR. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ message: "Entre na sua conta para exportar participantes." }, { status: 401 });
    const { event, attendees } = await getAttendeeExport(params.id, user);
    const filename = attendeesCsvFilename(event.nome);
    return new NextResponse(attendeesCsv(attendees, event.timezone), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof AttendanceError ? error.message : "Não foi possível exportar os participantes." }, { status: error instanceof AttendanceError ? error.status : 503 });
  }
}
