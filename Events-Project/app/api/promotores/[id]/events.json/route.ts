import { NextResponse } from "next/server";
import { getPromoterPublicAgenda } from "@/lib/services/promoters";
import { publicSiteUrl } from "@/lib/publicUrl";

export const dynamic = "force-dynamic";

function absoluteImage(value: string, origin: string): string | null {
  try {
    const url = new URL(value, origin);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch { return null; }
}

/** Feed JSON público do promotor (eventos publicados e futuros). Só campos públicos; nenhum dado de conta. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const agenda = await getPromoterPublicAgenda(params.id, { limit: 100 });
    if (!agenda) return NextResponse.json({ error: "Organizador indisponível" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    const origin = publicSiteUrl().origin;
    const body = {
      promoter: { id: agenda.promoter.id, name: agenda.promoter.name, url: `${origin}/promotores/${encodeURIComponent(agenda.promoter.id)}` },
      events: agenda.upcoming.map(event => ({
        id: event.id,
        name: event.nome,
        category: event.category,
        startDate: event.dataInicio,
        endDate: event.dataFim,
        startTime: event.startTime,
        endTime: event.endTime,
        timezone: event.timezone,
        address: event.endereco,
        isFree: event.isFree,
        priceCents: event.isFree ? 0 : event.priceCents,
        image: event.banner ? absoluteImage(event.banner, origin) : null,
        url: `${origin}/eventos/${encodeURIComponent(event.id)}`,
      })),
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=900, stale-while-revalidate=3600", "Access-Control-Allow-Origin": "*" } });
  } catch {
    return NextResponse.json({ error: "Agenda indisponível" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
