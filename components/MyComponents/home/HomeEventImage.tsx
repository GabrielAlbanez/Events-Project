"use client";

import Image from "next/image";
import { useState } from "react";

const fallbacks = ["live", "jazz", "sunset"];

/** Event artwork stays usable when an external banner is absent or unavailable. */
export function HomeEventImage({ banner, index, className, sizes, priority = false }: {
  banner: string | null | undefined;
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
  const src = allowed && candidate !== failedBanner ? candidate : `/branding/home-${fallbacks[index % fallbacks.length]}-v1.webp`;
  return <Image src={src} alt="" fill sizes={sizes} priority={priority} unoptimized={/^https?:\/\//i.test(src)} className={className} onError={() => { if (src === candidate) setFailedBanner(candidate); }} />;
}
