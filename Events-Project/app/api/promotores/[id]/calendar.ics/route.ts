import { NextResponse } from "next/server";
import { getPromoterPublicAgenda } from "@/lib/services/promoters";
import { calendarSafeEvents, createEventCalendar } from "@/lib/eventCalendar";
import { publicSiteUrl } from "@/lib/publicUrl";

export const dynamic = "force-dynamic";

/** Feed ICS público do promotor: apenas eventos PUBLISHED que ainda não terminaram. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const agenda = await getPromoterPublicAgenda(params.id, { limit: 200 });
    if (!agenda) return new NextResponse("Organizador indisponível", { status: 404, headers: { "Cache-Control": "no-store" } });
    const name = `${agenda.promoter.name || "Organizador"} · EventMap`;
    const calendar = createEventCalendar(calendarSafeEvents(agenda.upcoming), publicSiteUrl().origin, new Date(), { name, refreshHours: 6 });
    return new NextResponse(calendar, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="agenda-eventmap.ics"',
        "Cache-Control": "public, max-age=900, stale-while-revalidate=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new NextResponse("Agenda indisponível", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
