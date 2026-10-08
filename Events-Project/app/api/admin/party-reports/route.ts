import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { CommunityError } from "@/lib/community/common";
import { checkOrigin, communityError, readCommunityBody } from "@/lib/community/http";
import { partyReports, reviewPartyReport } from "@/lib/partyConnections/reports";
import { partyReviewSchema } from "@/schemas/partyConnections";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: NextRequest) {
  try { const actor = await getAuthenticatedUser(request); if (!actor) throw new CommunityError(401, "Entre na sua conta."); return NextResponse.json(await partyReports(actor), { headers }); }
  catch (error) { return communityError(error); }
}
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const actor = await getAuthenticatedUser(request); if (!actor) throw new CommunityError(401, "Entre na sua conta.");
    const input = partyReviewSchema.parse(await readCommunityBody(request));
    await reviewPartyReport(actor, input.id, input.status);
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) { return communityError(error); }
}
