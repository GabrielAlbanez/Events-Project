import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { AttendanceError, cancelRegistration, getRegistrationState, registerForEvent } from "@/lib/services/attendance";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  return NextResponse.json({ message: error instanceof AttendanceError ? error.message : "Não foi possível atualizar a inscrição." }, { status: error instanceof AttendanceError ? error.status : 503 });
}

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === request.nextUrl.origin) return true;
  // The public origin is explicitly configured when running behind a tunnel.
  const publicUrl = process.env.NEXTAUTH_URL;
  if (!publicUrl) return false;
  try {
    return origin === new URL(publicUrl).origin;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser(request);
    return NextResponse.json(await getRegistrationState(params.id, user?.id ?? null), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!sameOrigin(request)) return NextResponse.json({ message: "Origem inválida." }, { status: 403 });
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ message: "Entre na sua conta para confirmar presença." }, { status: 401 });
    return NextResponse.json(await registerForEvent(params.id, user.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!sameOrigin(request)) return NextResponse.json({ message: "Origem inválida." }, { status: 403 });
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ message: "Entre na sua conta para cancelar a inscrição." }, { status: 401 });
    return NextResponse.json(await cancelRegistration(params.id, user.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
