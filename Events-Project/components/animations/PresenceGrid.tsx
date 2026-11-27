"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, LazyMotion, m, useReducedMotion } from "framer-motion";
import { animationConfig, loadLayoutFeatures } from "./config";

export type PresenceGridProps<T> = { items: readonly T[]; getKey: (item: T) => string; renderItem: (item: T) => ReactNode; className?: string; itemClassName?: string };

const noopSubscribe = () => () => {};

/**
 * Card grid with a capped first-appearance cascade, short exits and smooth reflow when filters change.
 * Server-rendered items stay visible (no entrance during hydration); a refetch with the same keys keeps cards mounted.
 */
export function PresenceGrid<T>({ items, getKey, renderItem, className, itemClassName }: PresenceGridProps<T>) {
  const reduced = useReducedMotion();
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const seen = useRef(new Set<string>());
  // Recorded after commit so render stays pure (and Strict Mode's double render cannot skip the cascade).
  useEffect(() => { items.forEach(item => seen.current.add(getKey(item))); }, [items, getKey]);
  const enabled = reduced === false && hydrated;
  const layout = enabled && items.length <= animationConfig.grid.layoutItemLimit ? "position" : false;
  let cascadeIndex = 0;
  return <LazyMotion features={loadLayoutFeatures} strict><div className={className} style={{ position: "relative" }}><AnimatePresence initial={enabled} mode="popLayout">{items.map(item => {
    const key = getKey(item);
    const firstAppearance = !seen.current.has(key);
    const delay = enabled && firstAppearance ? Math.min(cascadeIndex++ * animationConfig.staggerStep, animationConfig.staggerLimit) : 0;
    const duration = firstAppearance ? animationConfig.duration : animationConfig.grid.reenterDuration;
    return <m.div key={key} className={itemClassName} layout={layout} initial={enabled ? { opacity: 0, y: firstAppearance ? animationConfig.entranceDistance : 0 } : false} animate={{ opacity: 1, y: 0, scale: 1 }} exit={enabled ? { opacity: 0, scale: animationConfig.grid.exitScale, transition: { duration: animationConfig.grid.exitDuration, ease: animationConfig.ease } } : { opacity: 0, transition: { duration: 0 } }} transition={enabled ? { duration, ease: animationConfig.ease, delay, layout: { duration: animationConfig.grid.layoutDuration, ease: animationConfig.ease } } : { duration: 0 }}>{renderItem(item)}</m.div>;
  })}</AnimatePresence></div></LazyMotion>;
}
