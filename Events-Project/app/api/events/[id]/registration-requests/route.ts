import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAllowedRequestOrigin } from "@/lib/publicUrl";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { AttendanceError, listRegistrationRequests, readmitAttendee, removeAttendee, reviewRegistration } from "@/lib/services/attendance";

export const dynamic = "force-dynamic";

// Organizer approval of registrations (owner/admin only; enforced by the service).
const reviewBody = z.object({ registrationId: z.string().trim().min(1).max(100), decision: z.enum(["APPROVE", "REJECT"]) }).strict();

const removeBody = z.object({ registrationId: z.string().trim().min(1).max(100) }).strict();

function errorResponse(error: unknown) {
  return NextResponse.json({ message: error instanceof AttendanceError ? error.message : "Não foi possível concluir agora. Tente novamente." }, { status: error instanceof AttendanceError ? error.status : 503 });
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ message: "Acesso negado." }, { status: 401 });
    return NextResponse.json(await listRegistrationRequests(params.id, user), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAllowedRequestOrigin(request)) return NextResponse.json({ message: "Origem inválida." }, { status: 403 });
  try {
    // Deciding who attends is an account-holder action: impersonated sessions can only read.
    const user = await getAuthenticatedUser(request, { allowImpersonation: false });
    if (!user) return NextResponse.json({ message: "Acesso negado." }, { status: 401 });
    const parsed = reviewBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ message: "Pedido inválido." }, { status: 400 });
    const result = await reviewRegistration(params.id, user, parsed.data.registrationId, parsed.data.decision);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Organizer removes a participant from the event (owner/admin only; enforced by the service). */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAllowedRequestOrigin(request)) return NextResponse.json({ message: "Origem inválida." }, { status: 403 });
  try {
    const user = await getAuthenticatedUser(request, { allowImpersonation: false });
    if (!user) return NextResponse.json({ message: "Acesso negado." }, { status: 401 });
    const parsed = removeBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ message: "Pedido inválido." }, { status: 400 });
    const result = await removeAttendee(params.id, user, parsed.data.registrationId);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Organizer readmits someone removed or refused (owner/admin only; enforced by the service). */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAllowedRequestOrigin(request)) return NextResponse.json({ message: "Origem inválida." }, { status: 403 });
  try {
    const user = await getAuthenticatedUser(request, { allowImpersonation: false });
    if (!user) return NextResponse.json({ message: "Acesso negado." }, { status: 401 });
    const parsed = removeBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ message: "Pedido inválido." }, { status: 400 });
    const result = await readmitAttendee(params.id, user, parsed.data.registrationId);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
