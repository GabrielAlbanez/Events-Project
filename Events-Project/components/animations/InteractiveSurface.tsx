"use client";

import type { ReactNode } from "react";
import { LazyMotion, m, useReducedMotion } from "framer-motion";
import { animationConfig, loadAnimationFeatures } from "./config";
import { useMotionMedia } from "./useParallax";

export type InteractiveSurfaceProps = { children: ReactNode; className?: string; disabled?: boolean };

/** Presentational feedback; the contained link/button retains its own semantics and focus. */
export function InteractiveSurface({ children, className, disabled = false }: InteractiveSurfaceProps) {
  const reduced = useReducedMotion();
  const { fineHover, coarse } = useMotionMedia();
  const enabled = reduced === false && !disabled;
  return <LazyMotion features={loadAnimationFeatures} strict><m.div className={className} initial={false} whileHover={enabled && fineHover ? { y: -animationConfig.hoverLift } : undefined} whileTap={enabled && coarse ? { scale: animationConfig.tapScale } : undefined} animate={{ y: 0, scale: 1 }} transition={enabled ? { type: "spring", ...animationConfig.spring } : { duration: 0 }}>{children}</m.div></LazyMotion>;
}
