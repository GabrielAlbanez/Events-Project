import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { activitySnapshot } from "@/lib/community/activity";
import { CommunityError } from "@/lib/community/common";
import { communityError } from "@/lib/community/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthenticatedUser(request);
    if (!actor) throw new CommunityError(401, "Entre para acessar suas atividades.");
    return NextResponse.json(await activitySnapshot(actor), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return communityError(error); }
}
