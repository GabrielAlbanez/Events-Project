import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { getSalesExport } from "@/lib/services/tickets";
import { salesCsv, salesCsvFilename } from "@/lib/organizerOps/salesCsv";

export const dynamic = "force-dynamic";

/** CSV with the organizer's own paid and refunded orders. ";" separator and UTF-8 BOM for Excel pt-BR. */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ message: "Entre na sua conta para exportar as vendas." }, { status: 401 });
    const result = await getSalesExport(async () => user);
    if (!result.success) return NextResponse.json({ message: "Não foi possível exportar as vendas." }, { status: 503 });
    return new NextResponse(salesCsv(result.data), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${salesCsvFilename}"`,
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    console.warn("ticket-sales-export-failed");
    return NextResponse.json({ message: "Não foi possível exportar as vendas." }, { status: 503 });
  }
}
