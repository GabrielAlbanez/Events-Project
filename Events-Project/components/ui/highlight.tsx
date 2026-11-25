import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one highlighted word of a title: dark lime (#4E7A00) in light mode, lime in dark mode,
 * with the hand-drawn lime underline used on the home. The SVG is decorative.
 */
export function Highlight({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("em-highlight", className)}>
      {children}
      <svg viewBox="0 0 240 24" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M4 19 C 70 9, 150 4, 236 7" /></svg>
    </span>
  );
}
