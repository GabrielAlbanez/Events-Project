import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { getSavedEvents } from "@/lib/services/favorites";
import { createEventCalendar } from "@/lib/eventCalendar";
import { publicSiteUrl } from "@/lib/publicUrl";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
 try {
  const user = await getAuthenticatedUser(request);
  if (!user) return new NextResponse("Entre para exportar sua agenda.", { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const events = await getSavedEvents(async () => user);
  return new NextResponse(createEventCalendar(events, publicSiteUrl().origin), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="eventmap-agenda.ics"', "Cache-Control": "private, no-store" } });
 } catch { return new NextResponse("Não foi possível exportar sua agenda. Tente novamente.", { status: 503, headers: { "Cache-Control": "private, no-store" } }); }
}
