"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { animationConfig } from "./config";

type MotionMedia = { fineHover: boolean; coarse: boolean };
const serverMedia: MotionMedia = { fineHover: false, coarse: false };
let mediaSnapshot = serverMedia;
let hoverQuery: MediaQueryList | null = null;
let coarseQuery: MediaQueryList | null = null;
const mediaSubscribers = new Set<() => void>();

function syncMotionMedia() {
  if (!hoverQuery || !coarseQuery) return;
  const fineHover = hoverQuery.matches;
  const coarse = coarseQuery.matches;
  if (mediaSnapshot.fineHover === fineHover && mediaSnapshot.coarse === coarse) return;
  mediaSnapshot = { fineHover, coarse };
  mediaSubscribers.forEach(notify => notify());
}

function subscribeMotionMedia(notify: () => void) {
  mediaSubscribers.add(notify);
  if (mediaSubscribers.size === 1) {
    hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    coarseQuery = window.matchMedia("(pointer: coarse)");
    hoverQuery.addEventListener("change", syncMotionMedia);
    coarseQuery.addEventListener("change", syncMotionMedia);
    syncMotionMedia();
  }
  return () => {
    mediaSubscribers.delete(notify);
    if (mediaSubscribers.size === 0) {
      hoverQuery?.removeEventListener("change", syncMotionMedia);
      coarseQuery?.removeEventListener("change", syncMotionMedia);
      hoverQuery = null;
      coarseQuery = null;
    }
  };
}

/** One pair of media-query listeners is shared by all animated surfaces. */
export function useMotionMedia() {
  return useSyncExternalStore(subscribeMotionMedia, () => mediaSnapshot, () => serverMedia);
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
    let frame: number | null = null;
    const cancelFrame = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
    };
    if (fineHover) {
      // Decorative overlays can be pointer-transparent while their stable parent supplies the hit area.
      const target = pointerHost === "parent" ? element.parentElement ?? element : element;
      let pointerX = 0;
      let pointerY = 0;
      const update = () => {
        frame = null;
        const bounds = target.getBoundingClientRect();
        const horizontal = Math.max(-1, Math.min(1, ((pointerX - bounds.left) / Math.max(bounds.width, 1) - 0.5) * 2));
        const vertical = Math.max(-1, Math.min(1, ((pointerY - bounds.top) / Math.max(bounds.height, 1) - 0.5) * 2));
        x.set(horizontal * animationConfig.parallaxDistance); y.set(vertical * animationConfig.parallaxDistance);
        rx.set(-vertical * animationConfig.parallaxDegrees); ry.set(horizontal * animationConfig.parallaxDegrees);
      };
      const move = (event: PointerEvent) => {
        if (event.pointerType !== "mouse") return;
        pointerX = event.clientX;
        pointerY = event.clientY;
        if (frame === null) frame = window.requestAnimationFrame(update);
      };
      const leave = () => { cancelFrame(); reset(); };
      target.addEventListener("pointermove", move, { passive: true });
      target.addEventListener("pointerleave", leave);
      return () => { target.removeEventListener("pointermove", move); target.removeEventListener("pointerleave", leave); leave(); };
    }
    if (coarse && mobileScroll) {
      const container = scrollParent(element);
      const update = () => {
        frame = null;
        const bounds = element.getBoundingClientRect();
        const viewport = container instanceof HTMLElement ? container.getBoundingClientRect() : { top: 0, height: window.innerHeight };
        const progress = Math.max(-1, Math.min(1, (bounds.top + bounds.height / 2 - viewport.top - viewport.height / 2) / Math.max(viewport.height, 1)));
        y.set(progress * animationConfig.parallaxDistance);
      };
      const scroll = () => { if (frame === null) frame = window.requestAnimationFrame(update); };
      container.addEventListener("scroll", scroll, { passive: true });
      window.addEventListener("resize", scroll, { passive: true });
      scroll();
      return () => { container.removeEventListener("scroll", scroll); window.removeEventListener("resize", scroll); cancelFrame(); reset(); };
    }
    reset();
  }, [enabled, fineHover, coarse, mobileScroll, pointerHost, x, y, rx, ry]);
  return { ref, enabled, style: enabled ? { x: smoothX, y: smoothY, rotateX, rotateY } : undefined, secondaryStyle: enabled ? { x: secondaryX, y: secondaryY, rotateX: secondaryRotateX, rotateY: secondaryRotateY } : undefined };
}
