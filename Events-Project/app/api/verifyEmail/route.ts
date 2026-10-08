import { NextRequest, NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/services/emailVerification";

export async function GET(request: NextRequest) {
  const result = await verifyEmailToken(request.nextUrl.searchParams.get("token"));
  return NextResponse.json({ status: result.status, message: result.message }, {
    status: result.status === "success" ? 200 : "retryable" in result && result.retryable ? 503 : 400,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
