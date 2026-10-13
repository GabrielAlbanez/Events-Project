import { NextRequest, NextResponse } from "next/server";
import { isAllowedRequestOrigin } from "@/lib/publicUrl";
import prisma from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { boundedMultipart, saveProfileImage, UploadError } from "@/lib/storage/profileImages";
import { admitProfileUpload } from "@/lib/storage/profileUploadQuota";
export const dynamic = "force-dynamic";
function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error) || typeof error.code !== "string") return undefined;
  return error.code.slice(0, 40);
}
export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  let stage = "origin";
  try {
    if (!isAllowedRequestOrigin(request)) throw new UploadError(403, "Origem inválida.");
    stage = "authentication";
    const actor = await getAuthenticatedUser(request);
    if (!actor) throw new UploadError(401, "Entre na sua conta para enviar uma imagem.");
    stage = "multipart";
    const form = await boundedMultipart(request); const file = form.get("file");
    if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") throw new UploadError(400, "Selecione uma imagem.");
    if (form.get("userId") !== actor.id) throw new UploadError(403, "Não autorizado.");
    const purpose = request.nextUrl.searchParams.get("purpose");
    if (purpose && purpose !== "party") throw new UploadError(400, "Destino de imagem inválido.");
    stage = "admission";
    await admitProfileUpload(actor.id);
    stage = "storage";
    const saved = await saveProfileImage(file);
    if (purpose === "party") return NextResponse.json({ filePath: saved.url }, { headers });
    stage = "database";
    try {
      await prisma.$transaction(async (transaction) => {
        const updated = await transaction.user.updateMany({ where: { id: actor.id }, data: { image: saved.url } });
        if (!updated.count) throw new UploadError(401, "Esta conta não está mais disponível.");
        await transaction.$queryRaw`SELECT pg_notify('eventmap_profile_image_updated', ${actor.id}) IS NULL`;
      });
    } catch (error) { await saved.remove().catch(() => console.warn("Profile upload rollback unavailable.")); throw error; }
    return NextResponse.json({ filePath: saved.url }, { headers });
  } catch (error) {
    if (!(error instanceof UploadError)) {
      console.error("Profile image upload failed.", {
        stage,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorCode: errorCode(error),
      });
    }
    return NextResponse.json({ error: error instanceof UploadError ? error.message : "Não foi possível enviar a imagem. Tente novamente." }, { status: error instanceof UploadError ? error.status : 500, headers });
  }
}
