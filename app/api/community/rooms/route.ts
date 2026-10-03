import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { createRoom, listRooms } from "@/lib/community/rooms";
import { checkOrigin, communityError, readCommunityBody } from "@/lib/community/http";
import { CommunityError } from "@/lib/community/common";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthenticatedUser(request);
    if (!actor) throw new CommunityError(401, "Entre para acessar suas salas.");
    return NextResponse.json(await listRooms(actor), { headers });
  } catch (error) { return communityError(error); }
}

export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const actor = await getAuthenticatedUser(request);
    if (!actor) throw new CommunityError(401, "Entre para criar uma sala.");
    return NextResponse.json(await createRoom(actor, await readCommunityBody(request)), { status: 201, headers });
  } catch (error) { return communityError(error); }
}
