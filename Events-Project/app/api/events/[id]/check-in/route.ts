import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAllowedRequestOrigin } from "@/lib/publicUrl";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { AttendanceError, checkInAttendee, getCheckInOverview, getCheckInRoster, manualCheckIn } from "@/lib/services/attendance";

export const dynamic = "force-dynamic";

// QR token (existing contract) or manual check-in by registration id (OPP-06).
const checkInBody = z.union([
  z.object({ token: z.string().min(1).max(1000) }).strict(),
  z.object({ registrationId: z.string().trim().min(1).max(100) }).strict(),
]);

function errorResponse(error: unknown) {
  return NextResponse.json({ message: error instanceof AttendanceError ? error.message : "Não foi possível validar a entrada." }, { status: error instanceof AttendanceError ? error.status : 503 });
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ message: "Acesso negado." }, { status: 401 });
    // `?detalhes=1` adds counters and permissions; the plain array response is kept for older clients.
    const body = request.nextUrl.searchParams.get("detalhes") === "1" ? await getCheckInOverview(params.id, user) : await getCheckInRoster(params.id, user);
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAllowedRequestOrigin(request)) return NextResponse.json({ message: "Origem inválida." }, { status: 403 });
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ message: "Acesso negado." }, { status: 401 });
    const body: unknown = await request.json().catch(() => null);
    const parsed = checkInBody.safeParse(body);
    if (!parsed.success) return NextResponse.json({ message: "Informe um QR Code ou uma inscrição válida." }, { status: 400 });
    const result = "token" in parsed.data
      ? await checkInAttendee(params.id, user, parsed.data.token)
      : await manualCheckIn(params.id, user, parsed.data.registrationId);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
