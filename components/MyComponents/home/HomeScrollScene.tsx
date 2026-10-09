"use client";

import { useEffect, type MutableRefObject, type RefObject } from "react";
import { useMotionValueEvent, useScroll, useSpring, useTransform } from "framer-motion";

type PlaneRef = RefObject<HTMLDivElement>;
type HomeScrollSceneProps = {
  container: PlaneRef;
  hero: RefObject<HTMLElement>;
  mapPlane: PlaneRef;
  pinPlane: PlaneRef;
  ticketPlane: PlaneRef;
  featured: RefObject<HTMLElement>;
  cards: MutableRefObject<(HTMLElement | null)[]>;
  cardKey: string;
};

/** Motion-only driver: the presentation remains visible before this chunk loads. */
export default function HomeScrollScene({ container, hero, mapPlane, pinPlane, ticketPlane, featured, cards, cardKey }: HomeScrollSceneProps) {
  const { scrollYProgress } = useScroll({ container, target: hero, offset: ["start start", "end start"] });
  const { scrollYProgress: galleryProgress } = useScroll({ container, target: featured, offset: ["start end", "end start"] });
  const gallery = useSpring(galleryProgress, { stiffness: 120, damping: 28, mass: 0.4 });
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

  const cardLeft = useTransform(gallery, value => cardTransform(value, -1));
  const cardMiddle = useTransform(gallery, value => cardTransform(value, 0));
  const cardRight = useTransform(gallery, value => cardTransform(value, 1));
  useMotionValueEvent(cardLeft, "change", value => applyCard(cards.current[0], value, gallery.get()));
  useMotionValueEvent(cardMiddle, "change", value => applyCard(cards.current[1], value, gallery.get()));
  useMotionValueEvent(cardRight, "change", value => applyCard(cards.current[2], value, gallery.get()));

  useMotionValueEvent(mapTransform, "change", value => { if (mapPlane.current) mapPlane.current.style.transform = value; });
  useMotionValueEvent(pinTransform, "change", value => { if (pinPlane.current) pinPlane.current.style.transform = value; });
  useMotionValueEvent(ticketTransform, "change", value => { if (ticketPlane.current) ticketPlane.current.style.transform = value; });

  useEffect(() => {
    if (mapPlane.current) mapPlane.current.style.transform = mapTransform.get();
    if (pinPlane.current) pinPlane.current.style.transform = pinTransform.get();
    if (ticketPlane.current) ticketPlane.current.style.transform = ticketTransform.get();
    const planes = [mapPlane.current, pinPlane.current, ticketPlane.current];
    const cardNodes = [...cards.current];
    return () => {
      planes.forEach(plane => { if (plane) plane.style.removeProperty("transform"); });
      cardNodes.forEach(card => { if (card) { card.style.removeProperty("transform"); card.style.removeProperty("will-change"); } });
    };
  }, [mapPlane, pinPlane, ticketPlane, cards, mapTransform, pinTransform, ticketTransform]);

  useEffect(() => {
    applyCard(cards.current[0], cardLeft.get(), gallery.get());
    applyCard(cards.current[1], cardMiddle.get(), gallery.get());
    applyCard(cards.current[2], cardRight.get(), gallery.get());
    const nodes = [...cards.current];
    return () => nodes.forEach(card => { if (card) { card.style.removeProperty("transform"); card.style.removeProperty("will-change"); } });
  }, [cardKey, cards, cardLeft, cardMiddle, cardRight, gallery]);
  return null;
}

function cardTransform(value: number, side: number): string {
  const phase = Math.max(0, Math.min(1, value));
  const entrance = Math.max(0, (0.5 - phase) / 0.5);
  const departure = Math.max(0, (phase - 0.5) / 0.5);
  const depth = (1 - Math.abs(phase - 0.5) * 2) * (side === 0 ? 42 : 12);
  return `translate3d(${side * entrance * -28}px, ${entrance * 32 + departure * -18}px, ${depth}px) rotateX(${entrance * 8 - departure * 5}deg) rotateY(${side * entrance * -6}deg)`;
}

function applyCard(card: HTMLElement | null | undefined, transform: string, progress: number) {
  if (!card) return;
  card.style.transform = transform;
  if (progress > 0.05 && progress < 0.95) card.style.willChange = "transform";
  else card.style.removeProperty("will-change");
}
