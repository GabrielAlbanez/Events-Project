import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { completeMercadoPagoConnect } from "@/lib/services/tickets";
import { publicSiteUrl } from "@/lib/publicUrl";

export const dynamic = "force-dynamic";

/** Mercado Pago OAuth return. The code is exchanged on the server; the browser only sees a status word. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const read = (name: string) => params.get(name) || null;
  let status: string;
  try {
    status = await completeMercadoPagoConnect(
      { code: read("code"), state: read("state"), error: read("error") },
      () => getAuthenticatedUser(request, { allowImpersonation: false }),
    );
  } catch {
    console.warn("mercadopago-callback-failed");
    status = "error";
  }
  let base: URL;
  try { base = publicSiteUrl(); } catch { base = new URL(request.nextUrl.origin); }
  const response = NextResponse.redirect(new URL(`/myEvents/pagamentos?status=${encodeURIComponent(status)}`, base));
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
