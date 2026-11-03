import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { CommunityError } from "@/lib/community/common";
import { checkOrigin, communityError, readCommunityBody } from "@/lib/community/http";
import { partyProfileSnapshot, updatePartyProfile } from "@/lib/partyConnections/profile";
import { partySavedProfileSchema } from "@/schemas/partyConnections";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthenticatedUser(request);
    if (!actor) throw new CommunityError(401, "Entre na sua conta.");
    return NextResponse.json(await partyProfileSnapshot(actor), { headers });
  } catch (error) { return communityError(error); }
}
export async function PUT(request: NextRequest) {
  try {
    checkOrigin(request);
    const actor = await getAuthenticatedUser(request);
    if (!actor) throw new CommunityError(401, "Entre na sua conta.");
    await updatePartyProfile(actor, partySavedProfileSchema.parse(await readCommunityBody(request)));
    return NextResponse.json(await partyProfileSnapshot(actor), { headers });
  } catch (error) { return communityError(error); }
}
