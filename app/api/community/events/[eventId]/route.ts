import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { eventSnapshot, mutateEvent } from "@/lib/community/events";
import { CommunityError } from "@/lib/community/common";
import { checkOrigin, communityError, readCommunityBody } from "@/lib/community/http";
import { communityActionSchema } from "@/schemas/community";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params }: { params: { eventId: string } }) {
  try { return NextResponse.json(await eventSnapshot(params.eventId, await getAuthenticatedUser(request)), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return communityError(error); }
}
export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  try {
    checkOrigin(request);
    const actor = await getAuthenticatedUser(request);
    if (!actor) throw new CommunityError(401, "Entre na sua conta para continuar.");
    await mutateEvent(params.eventId, actor, communityActionSchema.parse(await readCommunityBody(request)));
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return communityError(error); }
}
