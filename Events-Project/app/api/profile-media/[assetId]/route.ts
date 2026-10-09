import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { maximumImageBytes, imageExtension } from "@/lib/storage/profileImages";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ProfileMedia = { mimeType: string; size: number; content: Uint8Array };
export async function GET(_request: Request, { params }: { params: { assetId: string } }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.assetId)) return new NextResponse(null, { status: 404 });
  const reference = '/v1/media/profile/' + params.assetId;
  try {
    const rows = await prisma.$queryRaw<ProfileMedia[]>`
      SELECT m."mimeType", m.size, m.content FROM "MobileEventMedia" m
      WHERE m.id = ${params.assetId} AND m.size > 0 AND m.size <= ${maximumImageBytes}
      AND EXISTS (SELECT 1 FROM "User" u WHERE RIGHT(u.image, LENGTH(${reference})) = ${reference})
      LIMIT 1
    `;
    const media = rows[0];
    if (!media) return new NextResponse(null, { status: 404 });
    const bytes = Buffer.from(media.content);
    if (!bytes.length || bytes.length > maximumImageBytes || bytes.length !== media.size) return new NextResponse(null, { status: 404 });
    imageExtension(bytes, media.mimeType);
    return new NextResponse(bytes, { headers: { "Content-Type": media.mimeType, "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch { return new NextResponse(null, { status: 404 }); }
}
