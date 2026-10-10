"use client";

import Image from "next/image";
import { useState, type PointerEvent } from "react";
import type { Evento } from "@/types";
import styles from "./LoggedHomeScroll.module.css";

export function posterFallback(id: string, index?: number): string {
  if (index !== undefined && Number.isInteger(index) && index >= 0) return `/branding/posters/poster-${index % 6 + 1}.webp`;
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `/branding/posters/poster-${hash % 6 + 1}.webp`;
}
export function safePosterSource(value: string | null | undefined, fallback: string): string {
  if (!value || value !== value.trim()) return fallback;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return value;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : fallback; } catch { return fallback; }
}
export function LoggedHomeEventBanner({ event, className, sizes, fallbackIndex }: { event: Evento; className?: string; sizes: string; fallbackIndex?: number }) {
  const fallback = posterFallback(event.id, fallbackIndex);
  const [failed, setFailed] = useState(false);
  const source = failed ? fallback : safePosterSource(event.banner, fallback);
  return <Image key={source} src={source} alt="" fill sizes={sizes} unoptimized={!source.startsWith("/")} onError={() => setFailed(true)} className={className} />;
}

export function LoggedHomePoster({ event, decorative = false, priority = false, fallbackIndex }: { event: Evento; decorative?: boolean; priority?: boolean; fallbackIndex?: number }) {
  const fallback = posterFallback(event.id, fallbackIndex);
  const [failed, setFailed] = useState(false);
  const source = failed ? fallback : safePosterSource(event.banner, fallback);
  const tilt = (pointer: PointerEvent<HTMLDivElement>) => {
    if (pointer.pointerType !== "mouse" || !window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)").matches) return;
    const bounds = pointer.currentTarget.getBoundingClientRect();
    const x = (pointer.clientX - bounds.left) / bounds.width - .5;
    const y = (pointer.clientY - bounds.top) / bounds.height - .5;
    pointer.currentTarget.style.setProperty("--poster-tilt", `perspective(900px) rotateX(${-y * 10}deg) rotateY(${x * 10}deg)`);
    pointer.currentTarget.style.setProperty("--reflection-x", `${x * 70}px`);
    pointer.currentTarget.style.setProperty("--reflection-y", `${y * 70}px`);
  };
  const reset = (pointer: PointerEvent<HTMLDivElement>) => {
    pointer.currentTarget.style.removeProperty("--poster-tilt");
    pointer.currentTarget.style.removeProperty("--reflection-x");
    pointer.currentTarget.style.removeProperty("--reflection-y");
  };
  const date = new Date(`${event.dataInicio.slice(0, 10)}T12:00:00Z`);
  const label = Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" }).format(date) : "Data a confirmar";
  return <div className={styles.poster} onPointerMove={tilt} onPointerLeave={reset}>
    <Image key={source} src={source} alt="" fill sizes="(min-width: 1100px) 260px, (min-width: 640px) 240px, 62vw" priority={priority} unoptimized={!source.startsWith("/")} onError={() => setFailed(true)} className={styles.posterImage} />
    <div className={styles.posterShade} />
    <div className={styles.posterReflection} aria-hidden="true" />
    <div className={styles.posterMeta}><span className={styles.posterCategory}>{event.category || "Evento"}</span><h3>{event.nome}</h3>{!decorative && <span className={styles.posterDate}>{label}</span>}</div>
  </div>;
}
