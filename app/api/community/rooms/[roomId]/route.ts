import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { getRoom, mutateRoom } from "@/lib/community/rooms";
import { checkOrigin, communityError, readCommunityBody } from "@/lib/community/http";
import { CommunityError } from "@/lib/community/common";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
type Context = { params: { roomId: string } };

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const actor = await getAuthenticatedUser(request);
    if (!actor) throw new CommunityError(401, "Entre para acessar esta sala.");
    return NextResponse.json(await getRoom(params.roomId, actor), { headers });
  } catch (error) { return communityError(error); }
}

export async function POST(request: NextRequest, { params }: Context) {
  try {
    checkOrigin(request);
    const actor = await getAuthenticatedUser(request);
    if (!actor) throw new CommunityError(401, "Entre para participar da sala.");
    return NextResponse.json(await mutateRoom(params.roomId, actor, await readCommunityBody(request)), { headers });
  } catch (error) { return communityError(error); }
}
