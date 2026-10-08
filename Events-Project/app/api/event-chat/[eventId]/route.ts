import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { CommunityError } from "@/lib/community/common";
import { checkOrigin, communityError, readCommunityBody } from "@/lib/community/http";
import { chatHistory, sendChatMessage } from "@/lib/eventChat/service";
import { eventChatHistorySchema, eventChatSendSchema } from "@/schemas/eventChat";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: NextRequest, { params }: { params: { eventId: string } }) {
  try {
    const input = eventChatHistorySchema.parse({ before: request.nextUrl.searchParams.get("before") ?? undefined, after: request.nextUrl.searchParams.get("after") ?? undefined });
    return NextResponse.json(await chatHistory(params.eventId, await getAuthenticatedUser(request), input), { headers });
  } catch (error) { return communityError(error); }
}
export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  try {
    checkOrigin(request);
    const actor = await getAuthenticatedUser(request);
    if (!actor) throw new CommunityError(401, "Entre na sua conta para participar.");
    return NextResponse.json(await sendChatMessage(params.eventId, actor, eventChatSendSchema.parse(await readCommunityBody(request))), { headers });
  } catch (error) { return communityError(error); }
}
