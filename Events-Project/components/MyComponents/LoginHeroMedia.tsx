"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { LazyMotion, m } from "framer-motion";
import { loadAnimationFeatures } from "@/components/animations/config";
import styles from "./LoginHeroMedia.module.css";

const images = [
  "/branding/login-city-v1.webp",
  "/branding/posters/poster-1.webp",
  "/branding/posters/poster-2.webp",
  "/branding/posters/poster-3.webp",
];

/** Decorative only: the introduction and login form stay server rendered. */
export function LoginHeroMedia() {
  const host = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [running, setRunning] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [loadSlides, setLoadSlides] = useState(false);
  const ready = useRef(new Set([0]));

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const desktopQuery = window.matchMedia("(min-width: 1280px)");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const update = () => {
      const enabled = visible && !document.hidden && !motionQuery.matches;
      setDesktop(desktopQuery.matches);
      setReduced(motionQuery.matches);
      setRunning(enabled);
      if (enabled && desktopQuery.matches) setLoadSlides(true);
      if (!desktopQuery.matches || motionQuery.matches) setActive(0);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    }, { threshold: 0.05 });
    observer.observe(element);
    desktopQuery.addEventListener("change", update);
    motionQuery.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      observer.disconnect();
      desktopQuery.removeEventListener("change", update);
      motionQuery.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  useEffect(() => {
    if (!running || !desktop || reduced) return;
    const timer = window.setInterval(() => setActive(current => {
      // Never fade away from a loaded frame to an image still downloading.
      for (let step = 1; step < images.length; step++) {
        const next = (current + step) % images.length;
        if (ready.current.has(next)) return next;
      }
      return current;
    }), 6000);
    return () => window.clearInterval(timer);
  }, [running, desktop, reduced]);

  const displayed = desktop && !reduced ? active : 0;
  return (
    <div ref={host} aria-hidden="true" className={styles.media} data-running={running} data-reduced={reduced}>
      <LazyMotion features={loadAnimationFeatures} strict>
        {images.slice(0, loadSlides && desktop && !reduced ? images.length : 1).map((src, index) => (
          <m.div key={src} className={styles.slide} initial={false}
            animate={{ opacity: displayed === index ? 1 : 0 }}
            transition={{ duration: reduced || !running ? 0 : 1.2, ease: "easeInOut" }}>
            <Image src={src} alt="" fill priority={index === 0} loading={index === 0 ? undefined : "lazy"}
              sizes="(min-width: 1280px) 460px, (min-width: 448px) 448px, 100vw"
              className={styles.image} onLoad={() => ready.current.add(index)} />
          </m.div>
        ))}
      </LazyMotion>
      <div className={styles.shade} />
    </div>
  );
}
