"use client";

import { useEffect, type ReactNode } from "react";
import { LazyMotion, m, useAnimationControls, useReducedMotion } from "framer-motion";
import { animationConfig, loadAnimationFeatures } from "./config";

export type PopIconProps = { children: ReactNode; pulse: number; className?: string };

/** Decorative pop on an icon after a user action. Increment `pulse` only on confirmed user actions (0 never animates); the label must still state the result. */
export function PopIcon({ children, pulse, className }: PopIconProps) {
  const reduced = useReducedMotion();
  const controls = useAnimationControls();
  useEffect(() => {
    if (pulse === 0 || reduced !== false) return;
    void controls.start({ scale: [1, animationConfig.pop.scale, 1], transition: { duration: animationConfig.pop.duration, ease: animationConfig.ease } });
    return () => controls.stop();
  }, [pulse, reduced, controls]);
  return <LazyMotion features={loadAnimationFeatures} strict><m.span aria-hidden="true" className={className} style={{ display: "inline-flex" }} initial={false} animate={controls}>{children}</m.span></LazyMotion>;
}
