"use client";

import type { ReactNode } from "react";
import { LazyMotion, m, useReducedMotion } from "framer-motion";
import { animationConfig, loadAnimationFeatures } from "./config";

export type HeroRevealProps = { children: ReactNode; className?: string };

/** Cover entrance: SSR markup stays fully visible; after hydration the image settles with a gentle fade and scale. Host must clip overflow. */
export function HeroReveal({ children, className }: HeroRevealProps) {
  const reduced = useReducedMotion();
  const enabled = reduced === false;
  return <LazyMotion features={loadAnimationFeatures} strict><m.div className={className} initial={false} style={{ opacity: 1 }} whileInView={enabled ? { opacity: [animationConfig.stationaryOpacity, 1], scale: [animationConfig.hero.initialScale, 1] } : { opacity: 1, scale: 1 }} viewport={{ once: true, amount: 0.1 }} transition={{ duration: enabled ? animationConfig.hero.duration : 0, ease: animationConfig.ease }}>{children}</m.div></LazyMotion>;
}
