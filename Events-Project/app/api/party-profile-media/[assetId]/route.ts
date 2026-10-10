import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { CommunityError } from "@/lib/community/common";
import { pairAccess } from "@/lib/partyConnections/access";
import { maximumImageBytes, imageExtension } from "@/lib/storage/profileImages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", Vary: "Cookie" };
type Media = { mimeType: string; size: number; content: Uint8Array };
type Reference = { eventId: string; userId: string };

export async function GET(request: NextRequest, { params }: { params: { assetId: string } }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.assetId)) return new NextResponse(null, { status: 404, headers });
  try {
    const actor = await getAuthenticatedUser(request);
    if (!actor) return new NextResponse(null, { status: 401, headers });
    const reference = "/v1/media/events/" + params.assetId;
    const media = await prisma.$transaction(async tx => {
      const references = await tx.$queryRaw<Reference[]>`
        SELECT p."eventId", p."userId" FROM "PartyProfile" p
        WHERE RIGHT(p."photoUrl", LENGTH(${reference})) = ${reference} LIMIT 100
      `;
      let allowed = false;
      for (const profile of references) {
        if (profile.userId === actor.id) { allowed = true; break; }
        try { await pairAccess(tx, profile.eventId, actor.id, profile.userId); allowed = true; break; }
        catch (error) {
          if (!(error instanceof CommunityError) || error.status !== 403) throw error;
        }
      }
      if (!allowed) return null;
      const rows = await tx.$queryRaw<Media[]>`
        SELECT m."mimeType", m.size, m.content FROM "MobileEventMedia" m
        WHERE m.id = ${params.assetId} AND m.size > 0 AND m.size <= ${maximumImageBytes} LIMIT 1
      `;
      return rows[0] ?? null;
    }, { timeout: 15000 });
    if (!media) return new NextResponse(null, { status: 404, headers });
    const bytes = Buffer.from(media.content);
    if (!bytes.length || bytes.length > maximumImageBytes || bytes.length !== media.size) return new NextResponse(null, { status: 404, headers });
    imageExtension(bytes, media.mimeType);
    return new NextResponse(bytes, { headers: { ...headers, "Content-Type": media.mimeType } });
  } catch { return new NextResponse(null, { status: 404, headers }); }
}

