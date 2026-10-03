import { NextRequest, NextResponse } from "next/server";
import { CommunityError } from "./common";
import { ZodError } from "zod";

export function checkOrigin(request: NextRequest): void {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) throw new CommunityError(403, "Origem inválida.");
  if (Number(request.headers.get("content-length") ?? 0) > 16000) throw new CommunityError(413, "Solicitação muito grande.");
}
export function communityError(error: unknown): NextResponse {
  const headers = { "Cache-Control": "no-store" };
  if (error instanceof CommunityError) return NextResponse.json({ message: error.message }, { status: error.status, headers });
  if (error instanceof ZodError) return NextResponse.json({ message: "Confira os campos informados." }, { status: 400, headers });
  return NextResponse.json({ message: "Não foi possível concluir. Tente novamente." }, { status: 500, headers });
}
export async function readCommunityBody(request: NextRequest): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new CommunityError(400, "Solicitação inválida.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) { const chunk = await reader.read(); if (chunk.done) break; length += chunk.value.byteLength; if (length > 16000) { await reader.cancel(); throw new CommunityError(413, "Solicitação muito grande."); } chunks.push(chunk.value); }
    const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown; } catch { throw new CommunityError(400, "Solicitação inválida."); }
  } finally { reader.releaseLock(); }
}
