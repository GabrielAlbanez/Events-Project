import HomeDiscoveryClient from "@/components/MyComponents/home/HomeDiscoveryClient";
import { listPublicCatalog, type PublicEvent } from "@/lib/eventQueries";
import type { Evento } from "@/types";

// The catalog changes in real time; never prerender it at build time.
export const dynamic = "force-dynamic";

/** Keeps the first byte fast when the database is slow: the client then loads the catalog itself. */
const INITIAL_EVENTS_TIMEOUT_MS = 2500;

/** Plain JSON, exactly like the `/api/AllEvents` reply the client already handles (dates become strings). */
function toClientEvents(events: PublicEvent[]): Evento[] {
  const visible = events.filter((event) => event.validate && event.status !== "CANCELLED");
  return JSON.parse(JSON.stringify(visible)) as Evento[];
}

async function loadInitialEvents(): Promise<Evento[] | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const events = await Promise.race([
      listPublicCatalog(),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), INITIAL_EVENTS_TIMEOUT_MS); }),
    ]);
    return events ? toClientEvents(events) : null;
  } catch {
    // Without server data the home keeps its previous behavior (skeleton, then client fetch).
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default async function Home() {
  return <HomeDiscoveryClient initialEvents={await loadInitialEvents()} />;
}
