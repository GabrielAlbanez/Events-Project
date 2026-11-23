import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { AttendanceError, issueCheckInToken, issueTicketPassToken } from "@/lib/services/attendance";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ message: "Entre na sua conta para mostrar o QR Code." }, { status: 401 });
    const passId = request.nextUrl.searchParams.get("pass");
    if (passId !== null && !/^[\w-]{1,64}$/.test(passId)) return NextResponse.json({ message: "Ingresso não encontrado." }, { status: 404 });
    return NextResponse.json(await (passId ? issueTicketPassToken(params.id, user.id, passId) : issueCheckInToken(params.id, user.id)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof AttendanceError ? error.message : "Não foi possível gerar o QR Code." }, { status: error instanceof AttendanceError ? error.status : 503 });
  }
}
