export const animationConfig = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  entranceDistance: 8,
  stationaryOpacity: 0.92,
  staggerStep: 0.035,
  staggerLimit: 0.12,
  hoverLift: 2,
  tapScale: 0.99,
  parallaxDegrees: 3,
  parallaxDistance: 12,
  parallaxPerspective: 800,
  parallaxSecondaryDepth: 0.5,
  shimmer: { duration: 1.6, repeatDelay: 0.5, opacity: 0.5, staticOpacity: 0.12 },
  spring: { stiffness: 180, damping: 28, mass: 0.5 },
};

export const loadAnimationFeatures = () => import("framer-motion").then(module => module.domAnimation);
