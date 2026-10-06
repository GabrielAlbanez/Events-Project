import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { CommunityError, transact } from "@/lib/community/common";
import { communityError } from "@/lib/community/http";
import { isAllowedRequestOrigin } from "@/lib/publicUrl";
import { matchAccess } from "@/lib/partyConnections/access";
import { chatImageKind, chatImageUrl } from "@/lib/partyConnections/attachments";
import { boundedMultipart, UploadError } from "@/lib/storage/profileImages";
import { saveChatImage } from "@/lib/storage/chatImages";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: NextRequest, { params }: { params: { eventId: string; matchId: string } }) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    if (!isAllowedRequestOrigin(request)) throw new CommunityError(403, "Origem inválida.");
    const actor = await getAuthenticatedUser(request);
    if (!actor) throw new CommunityError(401, "Entre na sua conta.");
    // Reject unauthorized uploads before reading their body or allocating files.
    await transact(async tx => { const access = await matchAccess(tx, params.matchId, actor); if (access.match.eventId !== params.eventId) throw new CommunityError(403, "Conversa indisponível."); }, { timeout: 15000, maxWait: 10000 });
    const form = await boundedMultipart(request), file = form.get("file");
    if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") throw new UploadError(400, "Selecione uma imagem.");
    const saved = await saveChatImage(file);
    try {
      await transact(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`chat-upload:${actor.id}`}, 0))`;
        const access = await matchAccess(tx, params.matchId, actor);
        if (access.match.eventId !== params.eventId) throw new CommunityError(403, "Conversa indisponível.");
        const recent = await tx.communityEntry.count({ where: { authorId: actor.id, kind: chatImageKind, createdAt: { gte: new Date(Date.now() - 60000) } } });
        if (recent >= 6) throw new CommunityError(429, "Aguarde antes de enviar mais imagens.");
        await tx.communityEntry.create({ data: { id: saved.id, eventId: params.eventId, authorId: actor.id, kind: chatImageKind, data: { matchId: params.matchId, filename: saved.filename, messageId: null } } });
      }, { timeout: 15000, maxWait: 10000 });
    } catch (error) { await saved.remove().catch(() => console.warn("Chat upload rollback unavailable.")); throw error; }
    return NextResponse.json({ id: saved.id, url: chatImageUrl(params.eventId, params.matchId, saved.id) }, { headers });
  } catch (error) {
    return error instanceof UploadError ? NextResponse.json({ message: error.message }, { status: error.status, headers }) : communityError(error);
  }
}
