"use client";

import { Children, type ReactNode } from "react";
import { LazyMotion, m, useReducedMotion } from "framer-motion";
import { animationConfig, loadAnimationFeatures } from "./config";

export type StaggerListProps = { children: ReactNode; className?: string; itemClassName?: string; disabled?: boolean };

/** Use around ordinary card grids, never around semantic table/list children. */
export function StaggerList({ children, className, itemClassName, disabled = false }: StaggerListProps) {
  const reduced = useReducedMotion();
  const distance = reduced !== false || disabled ? 0 : animationConfig.entranceDistance;
  return <LazyMotion features={loadAnimationFeatures} strict><div className={className}>{Children.toArray(children).map((child, index) => <m.div key={typeof child === "object" && child !== null && "key" in child ? child.key ?? index : index} className={itemClassName} initial={false} style={{ opacity: 1 }} whileInView={{ opacity: 1, y: [distance, 0] }} viewport={{ once: true, amount: 0.1 }} transition={{ duration: distance ? animationConfig.duration : 0, ease: animationConfig.ease, delay: distance ? Math.min(index * animationConfig.staggerStep, animationConfig.staggerLimit) : 0 }}>{child}</m.div>)}</div></LazyMotion>;
}
