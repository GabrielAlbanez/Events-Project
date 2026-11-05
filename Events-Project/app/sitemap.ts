import type { MetadataRoute } from "next";
import prisma from "@/lib/prisma";
import { publicSiteUrl } from "@/lib/publicUrl";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = publicSiteUrl();
  const events = await prisma.events.findMany({
    where: { status: "PUBLISHED" },
    select: { id: true, userId: true, user: { select: { role: true } } },
    orderBy: { id: "asc" },
  });
  const promoters = Array.from(new Set(events.flatMap(event =>
    event.userId && (event.user?.role === "ADMIN" || event.user?.role === "PROMOTER") ? [event.userId] : [])));
  return ["/", "/EventsCreated",
    ...events.flatMap(event => {
      const path = "/eventos/" + encodeURIComponent(event.id);
      return [path, path + "/comunidade"];
    }),
    ...promoters.map(id => "/promotores/" + encodeURIComponent(id))]
    .map(path => ({ url: new URL(path, origin).href }));
}
