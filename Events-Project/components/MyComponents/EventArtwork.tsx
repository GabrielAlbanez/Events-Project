import type { ReactNode } from "react";

export type EventArtworkProps = {
  /** External or uploaded event banner; empty values render `fallback`. */
  src: string | null | undefined;
  alt?: string;
  /** Classes for the box (size, aspect ratio, radius, background). */
  className?: string;
  /** Extra classes for the foreground image (e.g. hover scale). */
  imgClassName?: string;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
  /** Shown when there is no image. */
  fallback?: ReactNode;
  /** Lets client callers swap to their own fallback when the image fails. */
  onError?: () => void;
  /** Overlays such as date badges, rendered above the artwork. */
  children?: ReactNode;
};

/**
 * Shows the whole event artwork (flyers are often posters full of text) without cropping:
 * a blurred, dimmed copy fills the box and the original sits centred with `object-contain`.
 * Server-safe; plain `<img>` because external banner hosts are not in the next/image allowlist.
 */
export function EventArtwork({ src, alt = "", className = "", imgClassName = "", loading, fetchPriority, fallback = null, onError, children }: EventArtworkProps) {
  const source = typeof src === "string" ? src.trim() : "";
  return (
    <div className={`relative isolate overflow-hidden ${className}`}>
      {source ? <>
        <img src={source} alt="" aria-hidden="true" loading={loading} decoding="async" className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-2xl dark:opacity-55" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-background/25 dark:bg-black/35" />
        <img src={source} alt={alt} loading={loading} fetchPriority={fetchPriority} decoding="async" onError={onError} className={`relative h-full w-full object-contain ${imgClassName}`} />
      </> : fallback}
      {children}
    </div>
  );
}
