import { NextRequest, NextResponse } from "next/server";
import { isAllowedRequestOrigin } from "@/lib/publicUrl";

export async function DELETE(request: NextRequest) {
  if (!isAllowedRequestOrigin(request, true)) return NextResponse.json({ success: false }, { status: 403 });
  const response = NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  // The client saves the current choice synchronously. Do not overwrite it:
  // an older cleanup response may arrive after a new opt-in in this tab.
  for (const cookie of request.cookies.getAll()) {
    if (/^eventmap_metric_[a-zA-Z0-9]+$/.test(cookie.name)) {
      response.cookies.set(cookie.name, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    }
  }
  return response;
}
