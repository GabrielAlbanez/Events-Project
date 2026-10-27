"use client";

import Image from "next/image";
import { useState } from "react";

const fallbacks = ["live", "jazz", "sunset"];
const categoryFallbacks = new Map<string, string>([
  ["jazz", "jazz"], ["blues", "jazz"], ["musica", "live"], ["show", "live"], ["shows", "live"],
  ["festival", "live"], ["festivais", "live"], ["ao ar livre", "sunset"], ["natureza", "sunset"],
]);

/** Event artwork stays usable when an external banner is absent or unavailable. */
export function HomeEventImage({ banner, category, index, className, sizes, priority = false }: {
  banner: string | null | undefined;
  category?: string | null;
  index: number;
  className?: string;
  sizes: string;
  priority?: boolean;
}) {
  const [failedBanner, setFailedBanner] = useState<string | null>(null);
  const candidate = typeof banner === "string" ? banner.trim() : "";
  let allowed = candidate.startsWith("/") && !candidate.startsWith("//") && !candidate.includes("\\");
  if (/^https?:\/\//i.test(candidate)) {
    try { const url = new URL(candidate); allowed = Boolean(url.hostname) && !url.username && !url.password; } catch { allowed = false; }
  }
  const categoryKey = category?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR") ?? "";
  const fallback = categoryFallbacks.get(categoryKey) ?? fallbacks[index % fallbacks.length];
  const src = allowed && candidate !== failedBanner ? candidate : `/branding/home-${fallback}-v1.webp`;
  return <Image src={src} alt="" fill sizes={sizes} priority={priority} unoptimized={/^https?:\/\//i.test(src)} className={className} onError={() => { if (src === candidate) setFailedBanner(candidate); }} />;
}
