"use client";

import { useEffect, type RefObject } from "react";
import { useMotionValueEvent, useScroll, useSpring, useTransform } from "framer-motion";

type PlaneRef = RefObject<HTMLDivElement>;
type HomeScrollSceneProps = {
  container: PlaneRef;
  hero: RefObject<HTMLElement>;
  mapPlane: PlaneRef;
  pinPlane: PlaneRef;
  ticketPlane: PlaneRef;
};

/** Motion-only driver: the presentation remains visible before this chunk loads. */
export default function HomeScrollScene({ container, hero, mapPlane, pinPlane, ticketPlane }: HomeScrollSceneProps) {
  const { scrollYProgress } = useScroll({ container, target: hero, offset: ["start start", "end start"] });
  const progress = useSpring(scrollYProgress, { stiffness: 110, damping: 26, mass: 0.4 });
  const mapTransform = useTransform(progress, value => {
    const phase = Math.max(0, Math.min(1, value));
    return `translate3d(0, ${phase * 32}px, ${phase * -30}px) rotateX(${phase * 16}deg) rotate(-12deg) skewY(4deg)`;
  });
  const pinTransform = useTransform(progress, value => {
    const phase = Math.max(0, Math.min(1, value));
    return `translate3d(0, ${phase * -68}px, ${phase * 95}px) rotateY(${phase * -16}deg) rotate(${12 + phase * 7}deg)`;
  });
  const ticketTransform = useTransform(progress, value => {
    const phase = Math.max(0, Math.min(1, value));
    return `translate3d(0, ${phase * -24}px, ${phase * 45}px) rotateX(${phase * -8}deg) rotate(${5 - phase * 8}deg)`;
  });

  useMotionValueEvent(mapTransform, "change", value => { if (mapPlane.current) mapPlane.current.style.transform = value; });
  useMotionValueEvent(pinTransform, "change", value => { if (pinPlane.current) pinPlane.current.style.transform = value; });
  useMotionValueEvent(ticketTransform, "change", value => { if (ticketPlane.current) ticketPlane.current.style.transform = value; });

  useEffect(() => {
    const planes = [mapPlane.current, pinPlane.current, ticketPlane.current];
    return () => planes.forEach(plane => { if (plane) plane.style.removeProperty("transform"); });
  }, [mapPlane, pinPlane, ticketPlane]);
  return null;
}
