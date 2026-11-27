import { createLogBudget, cspReportLines, readCappedBody } from "@/lib/cspReport";

export const dynamic = "force-dynamic";

const takeLogSlot = createLogBudget();
const NO_STORE = { "Cache-Control": "no-store" };

/** Public CSP violation sink (Report-Only policy). Always 204; logs sanitized, rate-limited lines. */
export async function POST(request: Request) {
  try {
    const text = await readCappedBody(request);
    if (text !== null) {
      for (const line of cspReportLines(request.headers.get("content-type"), text)) {
        if (!takeLogSlot()) break;
        console.warn(line);
      }
    }
  } catch {
    // Reports are best effort: a broken body never changes the response.
  }
  return new Response(null, { status: 204, headers: NO_STORE });
}

export function GET() {
  return new Response(null, { status: 405, headers: { ...NO_STORE, Allow: "POST" } });
}
