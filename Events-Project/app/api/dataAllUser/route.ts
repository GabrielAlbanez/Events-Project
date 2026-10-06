import { getAuthenticatedAdminId } from "@/lib/adminAuth";
import { getAdminUsersPage } from "@/lib/services/adminPagination";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const result = await getAdminUsersPage(() => getAuthenticatedAdminId(request), {
      page: Number(request.nextUrl.searchParams.get("page") || 1),
      q: request.nextUrl.searchParams.get("q") || "", role: request.nextUrl.searchParams.get("role") || "all",
    });
    return NextResponse.json(result, { status: result.status === "success" ? 200 : 403, headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ status: "error", message: "Não foi possível carregar os usuários." }, { status: 503 }); }
}
