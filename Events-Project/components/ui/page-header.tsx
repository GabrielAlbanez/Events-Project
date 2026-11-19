import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  /** Id applied to the heading, useful for aria-labelledby on the surrounding section. */
  titleId?: string;
  className?: string;
};

/** Standard page heading: optional eyebrow, a single h1, supporting text and an actions slot. */
export function PageHeader({ title, description, eyebrow, actions, titleId, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="text-sm font-semibold text-brand">{eyebrow}</p>}
        <h1 id={titleId} className={cn("break-words text-3xl font-bold tracking-tight sm:text-4xl", eyebrow ? "mt-2" : undefined)}>{title}</h1>
        {description && <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
