"use client";

import Image from "next/image";
import { useState } from "react";
import { CalendarDays } from "lucide-react";
import styles from "./Playground.module.css";

/**
 * Banner real do evento (como HomeEventImage: URL já validada, remota sem otimização, fallback no erro).
 * Sem banner ou com falha de carregamento, mostra um bloco neutro com a categoria, nunca arte gerada.
 */
export function LandingEventImage({ src, category, sizes, priority = false, className }: {
  src: string | null;
  category: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) {
    return (
      <span className={styles.imageTile} aria-hidden="true">
        <CalendarDays size={20} />
        <span>{category}</span>
      </span>
    );
  }
  return (
    <Image
      src={src}
      alt=""
      fill
      sizes={sizes}
      priority={priority}
      unoptimized={/^https?:\/\//i.test(src)}
      className={className ?? styles.cover}
      onError={() => setFailed(src)}
    />
  );
}
