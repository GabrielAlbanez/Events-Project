import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  /** Wrap one word in `<Highlight>` (components/ui/highlight) to get the lime underline. */
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  /** Content above the eyebrow, such as a "back" link. */
  leading?: ReactNode;
  /** Id applied to the heading, useful for aria-labelledby on the surrounding section. */
  titleId?: string;
  size?: "default" | "sm";
  className?: string;
};

/** Standard page heading: eyebrow with the lime dash, a 700-weight title, muted supporting text and an actions slot. */
export function PageHeader({ title, description, eyebrow, actions, leading, titleId, size = "default", className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {leading}
        {eyebrow && <p className="em-eyebrow">{eyebrow}</p>}
        <h1 id={titleId} className={cn("em-title", size === "sm" && "em-title-sm", eyebrow ? "mt-3" : undefined)}>{title}</h1>
        {description && <p className="em-subtitle mt-3">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
