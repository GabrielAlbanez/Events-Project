"use client";

import { LazyMotion, m, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { animationConfig, loadAnimationFeatures } from "./config";

export type LoadingShimmerProps = { className?: string; active?: boolean };

/** Optional decorative overlay. Its host reserves dimensions and supplies loading semantics. */
export function LoadingShimmer({ className, active = true }: LoadingShimmerProps) {
  const reduced = useReducedMotion();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  const animate = hydrated && active && reduced === false;
  return <LazyMotion features={loadAnimationFeatures} strict><span aria-hidden="true" className={className} style={{ display: "block", position: "relative", overflow: "hidden", pointerEvents: "none" }}><m.span initial={false} animate={animate ? { x: ["-100%", "100%"] } : { x: 0 }} transition={animate ? { duration: animationConfig.shimmer.duration, ease: "linear", repeat: Infinity, repeatDelay: animationConfig.shimmer.repeatDelay } : { duration: 0 }} style={{ display: "block", position: "absolute", inset: 0, opacity: animate ? animationConfig.shimmer.opacity : animationConfig.shimmer.staticOpacity, background: "linear-gradient(100deg, transparent 15%, currentColor 50%, transparent 85%)" }} /></span></LazyMotion>;
}
