"use client";

import type { ReactNode } from "react";
import { LazyMotion, m, useReducedMotion } from "framer-motion";
import { animationConfig, loadAnimationFeatures } from "./config";

export type FadeInViewProps = { children: ReactNode; className?: string; delay?: number; disabled?: boolean; stationary?: boolean };

/** Visible SSR content; only the small entrance displacement changes in view. */
export function FadeInView({ children, className, delay = 0, disabled = false, stationary = false }: FadeInViewProps) {
  const reduced = useReducedMotion();
  const enabled = reduced === false && !disabled;
  const distance = enabled && !stationary ? animationConfig.entranceDistance : 0;
  const opacity = enabled && stationary ? [1, animationConfig.stationaryOpacity, 1] : 1;
  return <LazyMotion features={loadAnimationFeatures} strict><m.div className={className} initial={false} style={{ opacity: 1 }} whileInView={{ opacity, y: [distance, 0] }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: enabled ? animationConfig.duration : 0, ease: animationConfig.ease, delay: enabled ? Math.min(Math.max(delay, 0), animationConfig.staggerLimit) : 0 }}>{children}</m.div></LazyMotion>;
}
