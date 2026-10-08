import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAdminId } from "@/lib/adminAuth";
import { getAdminUserEvents } from "@/lib/services/adminPagination";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ message: "Conta indisponível." }, { status: 400 });
  try {
    const result = await getAdminUserEvents(() => getAuthenticatedAdminId(request), params.id, Number(request.nextUrl.searchParams.get("page") || 1));
    return NextResponse.json(result ?? { message: "Acesso negado." }, { status: result ? 200 : 403, headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ message: "Não foi possível carregar os eventos." }, { status: 503 }); }
}
