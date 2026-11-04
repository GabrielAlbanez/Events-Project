import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getAuthenticatedAdminId } from "@/lib/adminAuth";
import prisma from "@/lib/prisma";
import { checkOrigin, readCommunityBody } from "@/lib/community/http";
import { CommunityError } from "@/lib/community/common";
import { AiEventsError, aiEventsAction, aiEventsSnapshot } from "@/lib/aiEvents/service";
import { aiEventActionSchema } from "@/schemas/aiEvents";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
function failure(error: unknown) {
  if (error instanceof AiEventsError || error instanceof CommunityError) return NextResponse.json({ message: error.message }, { status: error.status, headers });
  if (error instanceof ZodError) return NextResponse.json({ message: "Confira os campos informados." }, { status: 400, headers });
  return NextResponse.json({ message: "A área de IA ainda não está disponível. Confira a configuração e as migrações do servidor." }, { status: 503, headers });
}
export async function GET(request: NextRequest) {
  try {
    const adminId = await getAuthenticatedAdminId(request);
    if (!adminId) throw new AiEventsError(403, "Acesso restrito ao administrador.");
    return NextResponse.json(await aiEventsSnapshot(prisma, adminId), { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const adminId = await getAuthenticatedAdminId(request);
    if (!adminId) throw new AiEventsError(403, "Acesso restrito ao administrador.");
    await aiEventsAction(prisma, adminId, aiEventActionSchema.parse(await readCommunityBody(request)));
    return NextResponse.json(await aiEventsSnapshot(prisma, adminId), { headers });
  } catch (error) { return failure(error); }
}
