import { NextResponse } from "next/server";
import { z } from "zod";
import { listPublicCatalog, listPublicCatalogPage } from "@/lib/eventQueries";
export const dynamic = "force-dynamic";

// Without parameters the response stays the historical array of every published event.
// Pagination is opt-in: ?limit=1..200[&cursor=<id>][&from=YYYY-MM-DD][&view=card] returns { events, nextCursor }.
const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  view: z.enum(["full", "card"]).default("full"),
}).strict();
const pageKeys = ["limit", "cursor", "from", "view"] as const;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const paginated = pageKeys.some(key => params.has(key));
  try {
    if (!paginated) return NextResponse.json(await listPublicCatalog());
    const parsed = pageQuery.safeParse(Object.fromEntries(pageKeys.flatMap(key => params.has(key) ? [[key, params.get(key)]] : [])));
    if (!parsed.success) return NextResponse.json({ message: "Parâmetros de paginação inválidos." }, { status: 400 });
    return NextResponse.json(await listPublicCatalogPage(parsed.data));
  } catch {
    return NextResponse.json({ message: "Não foi possível carregar eventos." }, { status: 503 });
  }
}
