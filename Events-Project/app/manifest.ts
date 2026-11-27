import type { MetadataRoute } from "next";

/** Installable web app: on iPhone, web push only works after "Adicionar à Tela de Início" (iOS 16.4+). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EventMap",
    short_name: "EventMap",
    description: "Descubra eventos perto de você, confirme presença e converse com seus matches.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    // --primary (hsl 226.58 100% 57.06%).
    theme_color: "#2455ff",
    lang: "pt-BR",
    icons: [
      // Chromium's install prompt needs 192 and 512 PNGs; maskable keeps the pin inside Android's safe zone.
      { src: "/branding/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/branding/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/branding/app-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
