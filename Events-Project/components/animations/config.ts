export const animationConfig = {
  duration: 0.35,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  entranceDistance: 14,
  stationaryOpacity: 0.85,
  staggerStep: 0.035,
  staggerLimit: 0.12,
  hoverLift: 2,
  tapScale: 0.99,
  parallaxDegrees: 3,
  parallaxDistance: 12,
  parallaxPerspective: 800,
  parallaxSecondaryDepth: 0.5,
  route: { peakOpacity: 0.85, startScale: 0.08, pendingScale: 0.72, pendingDuration: 2.4, completeDuration: 0.35, completeHold: 0.6, safetyTimeoutMs: 6000 },
  grid: { exitDuration: 0.2, exitScale: 0.97, reenterDuration: 0.25, layoutDuration: 0.3, layoutItemLimit: 36 },
  hero: { duration: 0.4, initialScale: 1.04 },
  pop: { duration: 0.32, scale: 1.3 },
  shimmer: { duration: 1.6, repeatDelay: 0.5, opacity: 0.5, staticOpacity: 0.12 },
  spring: { stiffness: 180, damping: 28, mass: 0.5 },
};

export const loadAnimationFeatures = () => import("framer-motion").then(module => module.domAnimation);
/** Larger bundle (layout animations); load only where items reflow, never on the map. */
export const loadLayoutFeatures = () => import("framer-motion").then(module => module.domMax);
