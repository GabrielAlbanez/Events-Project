import type { MetadataRoute } from "next";
import prisma from "@/lib/prisma";
import { publicSiteUrl } from "@/lib/publicUrl";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = publicSiteUrl();
  const events = await prisma.events.findMany({
    where: { status: "PUBLISHED" },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return ["/", "/EventsCreated", ...events.map(event => "/eventos/" + encodeURIComponent(event.id))]
    .map(path => ({ url: new URL(path, origin).href }));
}
