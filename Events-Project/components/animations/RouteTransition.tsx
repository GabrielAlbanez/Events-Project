"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LazyMotion, m, useAnimationControls, useReducedMotion } from "framer-motion";
import { animationConfig, loadAnimationFeatures } from "./config";

/** Persistent decoration: route content is neither keyed nor placed in a transformed ancestor. */
export function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const reduced = useReducedMotion();
  const controls = useAnimationControls();

  useEffect(() => {
    const changed = previousPath.current !== pathname;
    previousPath.current = pathname;
    controls.stop();
    if (!changed || reduced !== false) {
      controls.set({ opacity: 0, scaleX: 1 });
      return;
    }
    void controls.start({
      opacity: [0, animationConfig.route.peakOpacity, 0],
      scaleX: [animationConfig.route.initialScale, 1],
      transition: { duration: animationConfig.route.duration, ease: animationConfig.ease },
    });
    return () => controls.stop();
  }, [pathname, reduced, controls]);

  return <>
    {children}
    <LazyMotion features={loadAnimationFeatures} strict>
      <m.div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-[80] mx-auto h-0.5 w-56 max-w-[60vw] bg-primary shadow-highlight"
        initial={false}
        animate={controls}
        style={{ opacity: 0 }}
      />
    </LazyMotion>
  </>;
}
