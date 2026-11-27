import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageShellProps = {
  children: ReactNode;
  /** Max width of the content column. */
  width?: "narrow" | "default" | "wide";
  /** Lime decorations: ring + blob (default), ring only, or none (dense/admin screens). */
  decor?: "full" | "ring" | "none";
  className?: string;
  innerClassName?: string;
};

const widths = { narrow: "max-w-3xl", default: "max-w-5xl", wide: "max-w-6xl" } as const;

/** Page background with the clipped lime decorations of the home; never causes horizontal scroll. */
export function PageShell({ children, width = "wide", decor = "full", className, innerClassName }: PageShellProps) {
  return (
    <div className={cn("em-page w-full min-w-0 px-4 pb-12 pt-6 sm:px-6 sm:pt-10 lg:px-10", className)} data-decor={decor === "full" ? undefined : decor}>
      <div className={cn("mx-auto min-w-0", widths[width], innerClassName)}>{children}</div>
    </div>
  );
}
