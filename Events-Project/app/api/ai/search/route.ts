import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAllowedRequestOrigin } from "@/lib/publicUrl";
import { requestClientKey } from "@/lib/rateLimit";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { AI_BUSY, searchWithAi } from "@/lib/ai/service";

export const dynamic = "force-dynamic";

/** 4. Natural-language search → home filters. Public, limited per signed-in user or per client IP. */
export async function POST(request: NextRequest) {
  if (!isAllowedRequestOrigin(request, true)) return NextResponse.json({ message: "Origem inválida." }, { status: 403 });
  try {
    const body: unknown = await request.json().catch(() => null);
    const value = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const user = await getAuthenticatedUser(request).catch(() => null);
    const key = user ? "user:" + user.id : "client:" + await requestClientKey();
    const result = await searchWithAi(key, value.q, value.categories, { db: prisma });
    return NextResponse.json(result, { status: result.ok ? 200 : 422, headers: { "Cache-Control": "no-store" } });
  } catch {
    console.warn("ai-search", "status=error");
    return NextResponse.json({ ok: false, error: AI_BUSY }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
