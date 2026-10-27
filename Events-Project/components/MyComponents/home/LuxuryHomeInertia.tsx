"use client";

import { useEffect, type RefObject } from "react";

type Props = {
  scrollContainer: RefObject<HTMLDivElement>;
  sectionRef: RefObject<HTMLDivElement>;
  paused?: boolean;
};

/** Desktop wheel easing ends at the presentation boundary; Maps keeps native gestures. */
export default function LuxuryHomeInertia({ scrollContainer, sectionRef, paused = false }: Props) {
  useEffect(() => {
    const container = scrollContainer.current;
    const section = sectionRef.current;
    if (!container || !section || paused) return;
    const media = window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    let frame = 0;
    let target = container.scrollTop;
    let lastTime = 0;
    let boundary = 0;
    let writing = false;
    function measure() {
      if (!container || !section) return;
      boundary = section.getBoundingClientRect().bottom - container.getBoundingClientRect().top + container.scrollTop - container.clientHeight;
    }
    function stop() {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
      target = container?.scrollTop ?? 0;
    }
    function tick(time: number) {
      if (!container) return;
      const dt = lastTime ? Math.min(time - lastTime, 50) : 16;
      lastTime = time;
      const next = container.scrollTop + (target - container.scrollTop) * (1 - Math.exp(-dt / 75));
      writing = true;
      container.scrollTop = Math.abs(target - next) < 0.8 ? target : next;
      writing = false;
      if (Math.abs(target - container.scrollTop) < 0.8) { frame = 0; lastTime = 0; return; }
      frame = requestAnimationFrame(tick);
    }
    function wheel(event: WheelEvent) {
      if (!container || !section || !media.matches || event.ctrlKey || event.metaKey || event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const element = event.target instanceof Element ? event.target : null;
      if (!element || !section.contains(element) || element.closest("input, textarea, select, [contenteditable], [data-native-scroll]")) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1);
      const next = (frame ? target : container.scrollTop) + delta;
      // Cross the end using the browser, never smooth or capture a wheel over the real map.
      if (next < 0 || next > Math.max(0, boundary)) { stop(); return; }
      if (!event.cancelable) return;
      event.preventDefault();
      target = next;
      if (!frame) frame = requestAnimationFrame(tick);
    }
    function keyboard(event: KeyboardEvent) {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " ", "Tab"].includes(event.key)) stop();
    }
    function nativeScroll() {
      // External anchors, keyboard, focus and scrollbar interaction take precedence.
      if (!writing && !frame && container) target = container.scrollTop;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(section);
    observer.observe(container);
    measure();
    container.addEventListener("wheel", wheel, { passive: false });
    container.addEventListener("scroll", nativeScroll, { passive: true });
    container.addEventListener("pointerdown", stop, { passive: true });
    container.addEventListener("focusin", stop);
    container.addEventListener("keydown", keyboard);
    media.addEventListener("change", stop);
    return () => {
      stop();
      observer.disconnect();
      container.removeEventListener("wheel", wheel);
      container.removeEventListener("scroll", nativeScroll);
      container.removeEventListener("pointerdown", stop);
      container.removeEventListener("focusin", stop);
      container.removeEventListener("keydown", keyboard);
      media.removeEventListener("change", stop);
    };
  }, [scrollContainer, sectionRef, paused]);
  return null;
}
