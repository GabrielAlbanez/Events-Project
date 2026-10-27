"use client";

import { useEffect, type RefObject } from "react";

type Props = {
  scrollContainer: RefObject<HTMLDivElement>;
  sectionRef: RefObject<HTMLDivElement>;
  contentKey: string;
};

type SectionGeometry = { top: number; height: number; pinHeight: number };
type CardGeometry = { node: HTMLElement; center: number; width: number };
type Mode = "depth" | "touch" | null;
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const fixed = (value: number) => value.toFixed(3);

/** Event-driven DOM animation: one read/write frame and one shared will-change timer. */
export default function LuxuryHomeScrollScene({ scrollContainer, sectionRef, contentKey }: Props) {
  useEffect(() => {
    const container = scrollContainer.current;
    const root = sectionRef.current;
    if (!container || !root) return;

    const hero = root.querySelector<HTMLElement>("[data-scroll-hero]");
    const heroPin = root.querySelector<HTMLElement>("[data-scroll-hero-pin]");
    const copy = root.querySelector<HTMLElement>("[data-scroll-copy]");
    const posters = Array.from(root.querySelectorAll<HTMLElement>("[data-scroll-poster]"));
    const gallery = root.querySelector<HTMLElement>("[data-scroll-gallery]");
    const galleryPin = root.querySelector<HTMLElement>("[data-scroll-gallery-pin]");
    const track = root.querySelector<HTMLElement>("[data-scroll-track]");
    const viewport = track?.parentElement;
    const cards = track ? Array.from(track.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node.hasAttribute("data-scroll-card")) : [];
    const map = root.querySelector<HTMLElement>("[data-scroll-map]");
    const plane = root.querySelector<HTMLElement>("[data-scroll-map-plane]");
    const headings = Array.from(root.querySelectorAll<HTMLElement>("[data-scroll-heading]"));
    const closing = root.querySelector<HTMLElement>("[data-scroll-closing]");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = window.matchMedia("(min-width: 1100px) and (min-height: 700px) and (hover: hover) and (pointer: fine)");
    const originals = new Map<HTMLElement, { transform: string; opacity: string; willChange: string }>();
    const active = new Set<HTMLElement>();
    let frame = 0;
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
    let needsMeasure = true;
    let mode: Mode = null;
    let viewportHeight = 1;
    let heroGeometry: SectionGeometry | null = null;
    let galleryGeometry: SectionGeometry | null = null;
    let mapGeometry: SectionGeometry | null = null;
    let closingGeometry: SectionGeometry | null = null;
    let headingGeometry: { node: HTMLElement; top: number; height: number }[] = [];
    const posterFocusX = new Map<HTMLElement, number>();
    let cardGeometry: CardGeometry[] = [];
    let viewportWidth = 0;
    let trackBase = 0;
    let travel = 0;
    let lastTrackX = 0;
    let focusedCard: HTMLElement | null = null;

    function restore() {
      if (cleanupTimer !== undefined) clearTimeout(cleanupTimer);
      cleanupTimer = undefined;
      originals.forEach((value, node) => {
        node.style.transform = value.transform;
        node.style.opacity = value.opacity;
        node.style.willChange = value.willChange;
      });
      originals.clear();
      active.clear();
      lastTrackX = 0;
    }

    function write(node: HTMLElement | null, transform: string, opacity?: number) {
      if (!node) return;
      const nextOpacity = opacity === undefined ? undefined : fixed(opacity);
      if (node.style.transform === transform && (nextOpacity === undefined || node.style.opacity === nextOpacity)) return;
      if (!originals.has(node)) originals.set(node, { transform: node.style.transform, opacity: node.style.opacity, willChange: node.style.willChange });
      node.style.willChange = nextOpacity === undefined ? "transform" : "transform, opacity";
      node.style.transform = transform;
      if (nextOpacity !== undefined) node.style.opacity = nextOpacity;
      active.add(node);
    }

    function schedule() {
      if (!frame && mode) frame = requestAnimationFrame(update);
    }

    function resize() {
      needsMeasure = true;
      schedule();
    }

    function sectionGeometry(node: HTMLElement | null, pin?: HTMLElement | null): SectionGeometry | null {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { top: rect.top - container!.getBoundingClientRect().top + container!.scrollTop, height: node.offsetHeight, pinHeight: pin?.offsetHeight ?? viewportHeight };
    }

    // Layout reads are grouped before every animation write, and cached between resizes.
    function measure() {
      viewportHeight = container!.clientHeight;
      heroGeometry = sectionGeometry(hero, heroPin);
      galleryGeometry = sectionGeometry(gallery, galleryPin);
      mapGeometry = sectionGeometry(map);
      closingGeometry = sectionGeometry(closing);
      const containerTop = container!.getBoundingClientRect().top;
      headingGeometry = headings.map(node => ({ node, top: node.getBoundingClientRect().top - containerTop + container!.scrollTop, height: node.offsetHeight }));
      posters.forEach(poster => {
        const width = poster.parentElement?.clientWidth ?? 0;
        posterFocusX.set(poster, width / 2 - poster.offsetLeft - poster.offsetWidth / 2);
      });
      if (track && viewport) {
        const viewportRect = viewport.getBoundingClientRect();
        viewportWidth = viewport.clientWidth;
        trackBase = track.getBoundingClientRect().left - viewportRect.left - lastTrackX + viewport.scrollLeft;
        travel = Math.max(0, track.scrollWidth - viewportWidth);
        cardGeometry = cards.map(node => ({ node, center: node.offsetLeft + node.offsetWidth / 2, width: node.offsetWidth }));
      }
      needsMeasure = false;
    }

    function pinnedProgress(geometry: SectionGeometry | null, scroll: number) {
      return geometry ? clamp((scroll - geometry.top) / Math.max(1, geometry.height - geometry.pinHeight)) : 0;
    }

    function crossingProgress(geometry: SectionGeometry | null, scroll: number) {
      return geometry ? clamp((scroll + viewportHeight - geometry.top) / (viewportHeight + geometry.height)) : 0;
    }

    function update() {
      frame = 0;
      if (!mode) return;
      if (needsMeasure) measure();
      // Native scroll offsets are read before the write phase; no getBoundingClientRect per card/frame.
      const scroll = container!.scrollTop;
      const inlineScroll = mode === "touch" ? track?.scrollLeft ?? 0 : viewport?.scrollLeft ?? 0;
      const heroProgress = mode === "depth" ? pinnedProgress(heroGeometry, scroll) : crossingProgress(heroGeometry, scroll);
      const galleryProgress = pinnedProgress(galleryGeometry, scroll);
      const mapProgress = crossingProgress(mapGeometry, scroll);
      const closingProgress = crossingProgress(closingGeometry, scroll);
      const isDepth = mode === "depth";
      const focusedElement = document.activeElement;
      focusedCard = cards.find(card => focusedElement instanceof Node && card.contains(focusedElement)) ?? null;

      if (isDepth) {
        write(copy, `translate3d(0,${fixed(-heroProgress * 70)}px,0)`, 1 - heroProgress * .4);
        posters.forEach((poster, index) => {
          if (posters.length > 1) {
            const focused = focusedElement instanceof Node && poster.contains(focusedElement);
            if (focused) {
              write(poster, `perspective(1200px) translate3d(${fixed(posterFocusX.get(poster) ?? 0)}px,${fixed(-heroProgress * 50)}px,220px) rotateY(0deg) rotateZ(0deg) scale(${index === 0 ? ".95" : "1.04"})`);
            } else if (index === 0) {
              write(poster, `perspective(1200px) translate3d(${fixed(heroProgress * 12)}px,${fixed(-heroProgress * 70)}px,${fixed(150 + heroProgress * 60)}px) rotateY(${fixed(-12 + heroProgress * 18)}deg) rotateZ(${fixed(-2 * (1 - heroProgress))}deg) scale(${fixed(.9 + heroProgress * .12)})`);
            } else {
              const side = index === 1 ? -1 : 1;
              const x = index === 1 ? 18 + heroProgress * 12 : 24 + heroProgress * 16;
              const z = (index === 1 ? -30 : -50) + heroProgress * 40;
              const scale = (index === 1 ? .8 : .78) + heroProgress * .08;
              write(poster, `perspective(1200px) translate3d(${fixed(x)}px,${fixed(-heroProgress * (45 + index * 12))}px,${fixed(z)}px) rotateY(${fixed(side * (12 - heroProgress * 6))}deg) rotateZ(${fixed(side * (1 - heroProgress) * 4)}deg) scale(${fixed(scale)})`);
            }
            return;
          }
          const side = index % 2 === 0 ? -1 : 1;
          const angle = -18 + heroProgress * 26;
          write(poster, `perspective(1200px) translate3d(${fixed(side * heroProgress * 16)}px,${fixed(-heroProgress * (70 + index * 24))}px,${fixed(80 + heroProgress * 120)}px) rotateY(${fixed(angle * (index === 1 ? -.65 : 1))}deg) rotateZ(${fixed(side * (1 - heroProgress) * 3)}deg) scale(${fixed(.9 + heroProgress * .2)})`);
        });
      } else {
        posters.forEach((poster, index) => write(poster, `perspective(1000px) translate3d(0,${fixed((.5 - heroProgress) * (20 + index * 8))}px,0) rotateY(${fixed((heroProgress - .5) * (index % 2 ? -8 : 8))}deg)`));
      }

      let trackX = 0;
      if (isDepth && track) {
        trackX = -travel * galleryProgress;
        const focused = focusedCard && cardGeometry.find(card => card.node === focusedCard);
        if (focused) trackX = clamp(viewportWidth / 2 - trackBase - focused.center, -travel, 0);
        write(track, `translate3d(${fixed(trackX)}px,0,0)`);
        lastTrackX = trackX;
      }
      cardGeometry.forEach(card => {
        const center = card.center + trackBase + trackX - (isDepth ? 0 : inlineScroll);
        const distance = clamp((center - viewportWidth / 2) / Math.max(1, viewportWidth / 2), -1, 1);
        if (isDepth) {
          const single = cardGeometry.length === 1;
          const rotation = single ? -14 + galleryProgress * 28 : distance * -21;
          const scale = single ? .9 + Math.sin(galleryProgress * Math.PI) * .04 : 1 - Math.abs(distance) * .09;
          write(card.node, `perspective(1400px) translate3d(0,${fixed(Math.abs(distance) * 14)}px,${fixed(single ? 15 : (1 - Math.abs(distance)) * 70)}px) rotateY(${fixed(rotation)}deg) scale(${fixed(scale)})`);
        } else {
          write(card.node, `perspective(800px) rotateY(${fixed(distance * -8)}deg) scale(${fixed(1 - Math.abs(distance) * .045)})`);
        }
      });

      if (isDepth) {
        write(plane, `perspective(1200px) translate3d(0,${fixed((.5 - mapProgress) * 46)}px,0) rotateX(${fixed((1 - mapProgress) * 38)}deg) rotateZ(${fixed((1 - mapProgress) * -5)}deg) scale(${fixed(.88 + mapProgress * .17)})`);
        headingGeometry.forEach(heading => {
          const progress = clamp((scroll + viewportHeight * .9 - heading.top) / Math.max(1, viewportHeight * .35));
          write(heading.node, `translate3d(0,${fixed((1 - progress) * Math.min(24, heading.height * .4))}px,0)`, .72 + progress * .28);
        });
        write(closing, `translate3d(0,${fixed((.5 - closingProgress) * 24)}px,0)`);
      }

      if (active.size) {
        if (cleanupTimer !== undefined) clearTimeout(cleanupTimer);
        cleanupTimer = setTimeout(() => {
          active.forEach(node => { node.style.willChange = originals.get(node)?.willChange ?? ""; });
          active.clear();
          cleanupTimer = undefined;
        }, 180);
      }
    }

    function configure() {
      const next: Mode = reduced.matches ? null : desktop.matches ? "depth" : "touch";
      if (next === mode) { resize(); return; }
      cancelAnimationFrame(frame);
      frame = 0;
      restore();
      mode = next;
      if (mode) root!.dataset.scrollMode = mode;
      else delete root!.dataset.scrollMode;
      needsMeasure = true;
      schedule();
    }

    const sizes = new ResizeObserver(resize);
    [container, root, hero, heroPin, gallery, galleryPin, track, viewport, map, plane, ...cards].forEach(node => { if (node) sizes.observe(node); });
    container.addEventListener("scroll", schedule, { passive: true });
    viewport?.addEventListener("scroll", schedule, { passive: true });
    track?.addEventListener("scroll", schedule, { passive: true });
    root.addEventListener("focusin", schedule);
    root.addEventListener("focusout", schedule);
    window.addEventListener("resize", resize);
    reduced.addEventListener("change", configure);
    desktop.addEventListener("change", configure);
    configure();

    return () => {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      container.removeEventListener("scroll", schedule);
      viewport?.removeEventListener("scroll", schedule);
      track?.removeEventListener("scroll", schedule);
      root.removeEventListener("focusin", schedule);
      root.removeEventListener("focusout", schedule);
      window.removeEventListener("resize", resize);
      reduced.removeEventListener("change", configure);
      desktop.removeEventListener("change", configure);
      restore();
      delete root.dataset.scrollMode;
    };
  }, [scrollContainer, sectionRef, contentKey]);

  return null;
}
