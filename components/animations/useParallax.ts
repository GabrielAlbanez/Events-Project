"use client";

import { useEffect, useRef, useState } from "react";
import { useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { animationConfig } from "./config";

/** Queries start disabled during SSR; listeners are removed when the surface unmounts. */
export function useMotionMedia() {
  const [media, setMedia] = useState({ fineHover: false, coarse: false });
  useEffect(() => {
    const hover = window.matchMedia("(hover: hover) and (pointer: fine)");
    const coarse = window.matchMedia("(pointer: coarse)");
    const sync = () => setMedia({ fineHover: hover.matches, coarse: coarse.matches });
    sync(); hover.addEventListener("change", sync); coarse.addEventListener("change", sync);
    return () => { hover.removeEventListener("change", sync); coarse.removeEventListener("change", sync); };
  }, []);
  return media;
}

function scrollParent(element: HTMLElement): HTMLElement | Window {
  let parent = element.parentElement;
  while (parent) {
    if (/auto|scroll/.test(window.getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) return parent;
    parent = parent.parentElement;
  }
  return window;
}

export function useParallax({ disabled = false, mobileScroll = false, pointerHost = "self" }: { disabled?: boolean; mobileScroll?: boolean; pointerHost?: "self" | "parent" } = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { fineHover, coarse } = useMotionMedia();
  const x = useMotionValue(0), y = useMotionValue(0), rx = useMotionValue(0), ry = useMotionValue(0);
  const smoothX = useSpring(x, animationConfig.spring), smoothY = useSpring(y, animationConfig.spring);
  const rotateX = useSpring(rx, animationConfig.spring), rotateY = useSpring(ry, animationConfig.spring);
  const secondaryX = useTransform(smoothX, value => value * animationConfig.parallaxSecondaryDepth);
  const secondaryY = useTransform(smoothY, value => value * animationConfig.parallaxSecondaryDepth);
  const secondaryRotateX = useTransform(rotateX, value => value * animationConfig.parallaxSecondaryDepth);
  const secondaryRotateY = useTransform(rotateY, value => value * animationConfig.parallaxSecondaryDepth);
  const enabled = reduced === false && !disabled && (fineHover || (coarse && mobileScroll));
  useEffect(() => {
    const element = ref.current;
    const reset = () => { x.set(0); y.set(0); rx.set(0); ry.set(0); };
    if (!element || !enabled) { reset(); return; }
    if (fineHover) {
      // Decorative overlays can be pointer-transparent while their stable parent supplies the hit area.
      const target = pointerHost === "parent" ? element.parentElement ?? element : element;
      const move = (event: PointerEvent) => {
        if (event.pointerType !== "mouse") return;
        const bounds = target.getBoundingClientRect();
        const horizontal = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / Math.max(bounds.width, 1) - 0.5) * 2));
        const vertical = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / Math.max(bounds.height, 1) - 0.5) * 2));
        x.set(horizontal * animationConfig.parallaxDistance); y.set(vertical * animationConfig.parallaxDistance);
        rx.set(-vertical * animationConfig.parallaxDegrees); ry.set(horizontal * animationConfig.parallaxDegrees);
      };
      target.addEventListener("pointermove", move, { passive: true });
      target.addEventListener("pointerleave", reset);
      return () => { target.removeEventListener("pointermove", move); target.removeEventListener("pointerleave", reset); reset(); };
    }
    if (coarse && mobileScroll) {
      const container = scrollParent(element);
      const scroll = () => {
        const bounds = element.getBoundingClientRect();
        const viewport = container instanceof HTMLElement ? container.getBoundingClientRect() : { top: 0, height: window.innerHeight };
        const progress = Math.max(-1, Math.min(1, (bounds.top + bounds.height / 2 - viewport.top - viewport.height / 2) / Math.max(viewport.height, 1)));
        y.set(progress * animationConfig.parallaxDistance);
      };
      container.addEventListener("scroll", scroll, { passive: true });
      window.addEventListener("resize", scroll, { passive: true });
      scroll();
      return () => { container.removeEventListener("scroll", scroll); window.removeEventListener("resize", scroll); reset(); };
    }
    reset();
  }, [enabled, fineHover, coarse, mobileScroll, pointerHost, x, y, rx, ry]);
  return { ref, enabled, style: enabled ? { x: smoothX, y: smoothY, rotateX, rotateY } : undefined, secondaryStyle: enabled ? { x: secondaryX, y: secondaryY, rotateX: secondaryRotateX, rotateY: secondaryRotateY } : undefined };
}
