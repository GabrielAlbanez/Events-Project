import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { CommunityError, transact } from "@/lib/community/common";
import { communityError } from "@/lib/community/http";
import { matchAccess } from "@/lib/partyConnections/access";
import { imageData } from "@/lib/partyConnections/attachments";
import { readChatImage } from "@/lib/storage/chatImages";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const mime: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif" };
export async function GET(request: NextRequest, { params }: { params: { eventId: string; matchId: string; imageId: string } }) {
  try {
    const actor = await getAuthenticatedUser(request);
    if (!actor) throw new CommunityError(401, "Entre na sua conta.");
    const filename = await transact(async tx => {
      const access = await matchAccess(tx, params.matchId, actor);
      if (access.match.eventId !== params.eventId) throw new CommunityError(403, "Conversa indisponível.");
      const row = await tx.communityEntry.findUnique({ where: { id: params.imageId } }), image = imageData(row);
      if (!row || !image || row.eventId !== params.eventId || image.matchId !== params.matchId) throw new CommunityError(404, "Imagem indisponível.");
      if (image.messageId === null && (row.authorId !== actor.id || Date.now() - row.createdAt.getTime() > 15 * 60000)) throw new CommunityError(404, "Imagem indisponível.");
      if (image.messageId !== null) {
        const message = await tx.partyMessage.findUnique({ where: { id: image.messageId } });
        if (!message || message.matchId !== params.matchId || message.authorId !== row.authorId) throw new CommunityError(404, "Imagem indisponível.");
      }
      return image.filename;
    }, { timeout: 15000, maxWait: 10000 });
    const bytes = await readChatImage(filename);
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": mime[filename.split(".").at(-1)!], "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" } });
  } catch (error) {
    if (error instanceof CommunityError) return communityError(error);
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
}
