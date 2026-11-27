import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { isAllowedRequestOrigin } from "@/lib/publicUrl";
import { runPixDiagnostics } from "@/lib/services/pixDiagnostics";

export const dynamic = "force-dynamic";

const MAX_BODY = 2 * 1024;
const headers = { "Cache-Control": "no-store, private" };

/**
 * "Diagnóstico do Pix" for the signed-in organizer's own Mercado Pago account. Same-origin POST only; the account is
 * always the session's (no id is accepted). Impersonated sessions are refused because the test creates a payment.
 */
export async function POST(request: NextRequest) {
  if (!isAllowedRequestOrigin(request, true)) return NextResponse.json({ message: "Origem inválida." }, { status: 403, headers });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return NextResponse.json({ message: "Solicitação muito grande." }, { status: 413, headers });
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return NextResponse.json({ message: "Solicitação muito grande." }, { status: 413, headers });
    body = JSON.parse(text) as unknown;
  } catch {
    return NextResponse.json({ message: "Solicitação inválida." }, { status: 400, headers });
  }
  try {
    const result = await runPixDiagnostics(body, () => getAuthenticatedUser(request, { allowImpersonation: false }));
    if (!result.success) return NextResponse.json({ message: result.message }, { status: result.status, headers });
    return NextResponse.json({ diagnosis: result.data }, { status: 200, headers });
  } catch {
    console.warn("pix-diagnostic-route-failed");
    return NextResponse.json({ message: "Não foi possível verificar agora. Tente novamente em alguns minutos." }, { status: 503, headers });
  }
}
