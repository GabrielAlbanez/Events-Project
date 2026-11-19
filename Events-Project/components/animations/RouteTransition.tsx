"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LazyMotion, m, useAnimationControls, useReducedMotion } from "framer-motion";
import { animationConfig, loadAnimationFeatures } from "./config";

/** Internal navigation started by a plain left click on a same-tab link to another page of this site. */
function isPageNavigation(event: MouseEvent): boolean {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return false;
  const url = new URL(anchor.href, window.location.href);
  return url.origin === window.location.origin && url.pathname !== window.location.pathname && !url.pathname.startsWith("/api/");
}

/** Persistent decoration: route content is neither keyed nor placed in a transformed ancestor. */
export function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const pending = useRef(false);
  const safetyTimer = useRef<number | null>(null);
  const reduced = useReducedMotion();
  const controls = useAnimationControls();
  const { route } = animationConfig;

  const clearSafety = useCallback(() => {
    if (safetyTimer.current !== null) window.clearTimeout(safetyTimer.current);
    safetyTimer.current = null;
  }, []);

  /** Sweep to the end, hold briefly, then fade. A single keyframe run, so a new navigation can interrupt it cleanly. */
  const finish = useCallback(() => {
    clearSafety();
    if (!pending.current) controls.set({ opacity: route.peakOpacity, scaleX: route.startScale });
    pending.current = false;
    void controls.start({
      scaleX: [null, 1, 1],
      opacity: [route.peakOpacity, route.peakOpacity, 0],
      transition: { duration: route.completeDuration, times: [0, route.completeHold, 1], ease: animationConfig.ease },
    });
  }, [clearSafety, controls, route]);

  useEffect(() => {
    if (reduced !== false) return;
    // Capture phase: runs before Next's Link handler calls preventDefault on the same click.
    const start = (event: MouseEvent) => {
      if (!isPageNavigation(event)) return;
      pending.current = true;
      controls.stop();
      controls.set({ opacity: route.peakOpacity, scaleX: route.startScale });
      void controls.start({ scaleX: route.pendingScale, transition: { duration: route.pendingDuration, ease: "easeOut" } });
      clearSafety();
      // Same-page or cancelled navigations never change the pathname; never leave the bar hanging.
      safetyTimer.current = window.setTimeout(finish, route.safetyTimeoutMs);
    };
    document.addEventListener("click", start, true);
    return () => document.removeEventListener("click", start, true);
  }, [reduced, controls, route, clearSafety, finish]);

  useEffect(() => {
    const changed = previousPath.current !== pathname;
    previousPath.current = pathname;
    if (reduced !== false) {
      clearSafety();
      pending.current = false;
      controls.stop();
      controls.set({ opacity: 0, scaleX: 0 });
      return;
    }
    if (changed) finish();
  }, [pathname, reduced, controls, clearSafety, finish]);

  useEffect(() => () => { clearSafety(); controls.stop(); }, [clearSafety, controls]);

  return <>
    {children}
    <LazyMotion features={loadAnimationFeatures} strict>
      <m.div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-[80] h-0.5 origin-left bg-primary shadow-highlight"
        initial={false}
        animate={controls}
        style={{ opacity: 0, scaleX: 0 }}
      />
    </LazyMotion>
  </>;
}
