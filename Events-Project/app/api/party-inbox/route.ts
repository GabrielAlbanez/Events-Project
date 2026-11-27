import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { CommunityError } from "@/lib/community/common";
import { communityError } from "@/lib/community/http";
import { connectionsInbox } from "@/lib/partyConnections/inbox";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthenticatedUser(request);
    if (!actor) throw new CommunityError(401, "Entre na sua conta.");
    return NextResponse.json(await connectionsInbox(actor), { headers });
  } catch (error) { return communityError(error); }
}
