import { NextRequest, NextResponse } from "next/server";
import { handleMercadoPagoWebhook } from "@/lib/services/tickets";

export const dynamic = "force-dynamic";

const MAX_BODY = 16 * 1024;

/**
 * Mercado Pago payment notifications. Public by design (not behind the session middleware): the x-signature header
 * is validated and the payment is always re-read from the Mercado Pago API, so the body is only a hint.
 */
export async function POST(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  let body: { type?: unknown; topic?: unknown; data?: { id?: unknown } } = {};
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return new NextResponse(null, { status: 400 });
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  const bodyId = body?.data && (typeof body.data.id === "string" || typeof body.data.id === "number") ? String(body.data.id) : null;
  const dataId = query.get("data.id") || query.get("id") || bodyId;
  const type = query.get("type") || query.get("topic") || (typeof body?.type === "string" ? body.type : typeof body?.topic === "string" ? body.topic : null);
  const status = await handleMercadoPagoWebhook({
    xSignature: request.headers.get("x-signature"),
    xRequestId: request.headers.get("x-request-id"),
    dataId,
    type,
  });
  return new NextResponse(null, { status, headers: { "Cache-Control": "no-store" } });
}
