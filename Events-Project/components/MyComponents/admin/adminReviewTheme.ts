import type { QueueTab } from "@/lib/adminReviewQueue";
import type { EventStatus } from "@/types/features";

/** One semantic color per status, exposed as `--status` for tabs, row accents and the panel tint. */
export const statusAccent: Record<EventStatus, string> = {
  DRAFT: "[--status:217_15%_45%] dark:[--status:216_20%_70%]",
  PENDING: "[--status:226.58_100%_57%] dark:[--status:226.88_100%_81%]",
  PUBLISHED: "[--status:160_84%_28%] dark:[--status:158_64%_55%]",
  CHANGES_REQUESTED: "[--status:32_95%_36%] dark:[--status:38_92%_62%]",
  CANCELLED: "[--status:0_72%_45%] dark:[--status:0_80%_70%]",
  ENDED: "[--status:217_15%_45%] dark:[--status:216_20%_70%]",
};

export const tabAccent: Record<QueueTab, string> = {
  pending: statusAccent.PENDING,
  published: statusAccent.PUBLISHED,
  changes: statusAccent.CHANGES_REQUESTED,
  cancelled: statusAccent.CANCELLED,
  ended: statusAccent.ENDED,
  all: "[--status:var(--foreground)]",
};

export const reviewSpring = { type: "spring", stiffness: 420, damping: 36, mass: 0.7 } as const;
export const reviewEase = [0.22, 1, 0.36, 1] as const;
/** How long the confirmed-success moment stays before moving to the next pending event. */
export const successHoldMs = 720;

/** Shared-element flight from a row thumbnail to the panel hero. Transform and opacity only. */
export function flyArtwork(source: HTMLImageElement, target: HTMLElement) {
  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (!from.width || !to.width || !from.height || !to.height || typeof source.animate !== "function") return undefined;
  const ghost = document.createElement("img");
  ghost.src = source.currentSrc || source.src;
  ghost.alt = "";
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, { position: "fixed", left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, objectFit: "cover", borderRadius: "12px", zIndex: "45", pointerEvents: "none", transformOrigin: "top left", willChange: "transform, opacity" });
  document.body.appendChild(ghost);
  const start = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
  const flight = ghost.animate([{ transform: start, opacity: 0.95 }, { transform: "none", opacity: 0.95, offset: 0.78 }, { transform: "none", opacity: 0 }], { duration: 360, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
  const remove = () => ghost.remove();
  flight.onfinish = remove;
  flight.oncancel = remove;
  return () => flight.cancel();
}
