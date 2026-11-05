import type { MetadataRoute } from "next";
import { publicSiteUrl } from "@/lib/publicUrl";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin", "/Profile", "/CriarEvento", "/myEvents", "/salvos", "/notificacoes", "/atividade", "/salas", "/perfil-conexoes", "/resultados", "/eventos/*/editar", "/eventos/*/chat", "/eventos/*/conexoes"],
    },
    sitemap: new URL("/sitemap.xml", publicSiteUrl()).href,
  };
}
