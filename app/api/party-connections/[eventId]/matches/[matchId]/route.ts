import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { CommunityError } from "@/lib/community/common";
import { checkOrigin, communityError, readCommunityBody } from "@/lib/community/http";
import { privateHistory, privateSend } from "@/lib/partyConnections/messages";
import { eventChatHistorySchema, eventChatSendSchema } from "@/schemas/eventChat";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
type Params = { params: { eventId: string; matchId: string } };
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const actor = await getAuthenticatedUser(request);
    if (!actor) throw new CommunityError(401, "Entre na sua conta.");
    const input = eventChatHistorySchema.parse({ before: request.nextUrl.searchParams.get("before") ?? undefined, after: request.nextUrl.searchParams.get("after") ?? undefined });
    return NextResponse.json(await privateHistory(params.eventId, params.matchId, actor, input), { headers });
  } catch (error) { return communityError(error); }
}
export async function POST(request: NextRequest, { params }: Params) {
  try {
    checkOrigin(request);
    const actor = await getAuthenticatedUser(request);
    if (!actor) throw new CommunityError(401, "Entre na sua conta.");
    return NextResponse.json(await privateSend(params.eventId, params.matchId, actor, eventChatSendSchema.parse(await readCommunityBody(request))), { headers });
  } catch (error) { return communityError(error); }
}
