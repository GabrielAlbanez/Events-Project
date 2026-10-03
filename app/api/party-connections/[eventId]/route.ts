import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { CommunityError } from "@/lib/community/common";
import { checkOrigin, communityError, readCommunityBody } from "@/lib/community/http";
import { connectionsSnapshot } from "@/lib/partyConnections/snapshot";
import { connectionsAction } from "@/lib/partyConnections/actions";
import { partyActionSchema } from "@/schemas/partyConnections";
import { z } from "zod";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: NextRequest, { params }: { params: { eventId: string } }) {
  try {
    const actor = await getAuthenticatedUser(request);
    if (!actor) throw new CommunityError(401, "Entre na sua conta.");
    const after = z.string().uuid().optional().parse(request.nextUrl.searchParams.get("after") ?? undefined);
    return NextResponse.json(await connectionsSnapshot(params.eventId, actor, after), { headers });
  } catch (error) { return communityError(error); }
}
export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  try {
    checkOrigin(request);
    const actor = await getAuthenticatedUser(request);
    if (!actor) throw new CommunityError(401, "Entre na sua conta.");
    await connectionsAction(params.eventId, actor, partyActionSchema.parse(await readCommunityBody(request)));
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) { return communityError(error); }
}
