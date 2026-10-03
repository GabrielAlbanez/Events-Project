import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { AttendanceError, checkInAttendee, getCheckInRoster } from "@/lib/services/attendance";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  return NextResponse.json({ message: error instanceof AttendanceError ? error.message : "Não foi possível validar a entrada." }, { status: error instanceof AttendanceError ? error.status : 503 });
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ message: "Acesso negado." }, { status: 401 });
    return NextResponse.json(await getCheckInRoster(params.id, user), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ message: "Origem inválida." }, { status: 403 });
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ message: "Acesso negado." }, { status: 401 });
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !("token" in body) || typeof body.token !== "string") {
      return NextResponse.json({ message: "Informe um QR Code válido." }, { status: 400 });
    }
    return NextResponse.json(await checkInAttendee(params.id, user, body.token), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
