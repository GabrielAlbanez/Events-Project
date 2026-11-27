import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type StateCardProps = {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** "error" uses a destructive tint; "loading" announces politely via role="status". */
  tone?: "empty" | "error" | "loading";
  headingLevel?: "h2" | "h3";
  className?: string;
};

/** Empty, error and loading placeholder in the EventMap card language (dashed card, icon tile, title, text, action). */
export function StateCard({ icon: Icon, title, description, action, tone = "empty", headingLevel: Heading = "h2", className }: StateCardProps) {
  return (
    <div className={cn("em-state", className)} data-tone={tone} role={tone === "error" ? "alert" : tone === "loading" ? "status" : undefined}>
      {Icon && <span className="em-state-icon" aria-hidden="true"><Icon className={cn("size-6", tone === "loading" && "animate-spin motion-reduce:animate-none")} /></span>}
      <Heading className="em-state-title">{title}</Heading>
      {description && <p className="em-state-text">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}
