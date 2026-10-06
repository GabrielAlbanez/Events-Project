import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { CommunityError } from "@/lib/community/common";
import { checkOrigin, communityError, readCommunityBody } from "@/lib/community/http";
import { privateHistory, privateSend } from "@/lib/partyConnections/messages";
import { eventChatHistorySchema } from "@/schemas/eventChat";
import { partySendSchema } from "@/schemas/partyMessage";
import { z } from "zod";
import { privateControl } from "@/lib/partyConnections/receipts";
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
    return NextResponse.json(await privateSend(params.eventId, params.matchId, actor, partySendSchema.parse(await readCommunityBody(request))), { headers });
  } catch (error) { return communityError(error); }
}
const controlSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("typing"), active: z.boolean() }).strict(),
  z.object({ action: z.literal("receipt"), messageId: z.number().int().positive().safe(), read: z.boolean() }).strict(),
]);
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    checkOrigin(request);
    const actor = await getAuthenticatedUser(request);
    if (!actor) throw new CommunityError(401, "Entre na sua conta.");
    return NextResponse.json(await privateControl(params.eventId, params.matchId, actor, controlSchema.parse(await readCommunityBody(request))), { headers });
  } catch (error) { return communityError(error); }
}
