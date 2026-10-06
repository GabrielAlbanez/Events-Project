"use client";

import type { ReactNode } from "react";
import { LazyMotion, m } from "framer-motion";
import { animationConfig, loadAnimationFeatures } from "./config";
import { useParallax } from "./useParallax";

export type ParallaxCardProps = { children: ReactNode; secondaryDecoration?: ReactNode; className?: string; decorationClassName?: string; secondaryClassName?: string; disabled?: boolean; mobileScroll?: boolean; pointerHost?: "self" | "parent" };

/** Only decorative content belongs here. Keep forms, controls and fixed elements outside. */
export function ParallaxCard({ children, secondaryDecoration, className, decorationClassName, secondaryClassName, disabled = false, mobileScroll = false, pointerHost = "self" }: ParallaxCardProps) {
  const { ref, style, secondaryStyle } = useParallax({ disabled, mobileScroll, pointerHost });
  return <LazyMotion features={loadAnimationFeatures} strict><div ref={ref} className={className} style={{ perspective: animationConfig.parallaxPerspective }}><m.div aria-hidden="true" className={decorationClassName} initial={false} style={{ ...style, pointerEvents: "none" }}>{children}</m.div>{secondaryDecoration && <m.div aria-hidden="true" className={secondaryClassName} initial={false} style={{ ...secondaryStyle, pointerEvents: "none" }}>{secondaryDecoration}</m.div>}</div></LazyMotion>;
}
