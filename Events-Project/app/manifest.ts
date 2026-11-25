import type { MetadataRoute } from "next";

/** Installable web app: on iPhone, web push only works after "Adicionar à Tela de Início" (iOS 16.4+). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EventMap",
    short_name: "EventMap",
    description: "Descubra eventos perto de você, confirme presença e converse com seus matches.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    // --primary (hsl 226.58 100% 57.06%).
    theme_color: "#2455ff",
    lang: "pt-BR",
    icons: [
      { src: "/branding/notification-icon.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
