import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/** Discreet, transparent label for a paid highlight. Visible text "Destaque"; the accessible name says it is sponsored. */
export function FeaturedBadge({ className }: { className?: string }) {
  return (
    <span
      role="note"
      aria-label="Evento em destaque patrocinado"
      title="Evento em destaque patrocinado"
      className={cn("inline-flex items-center gap-1 rounded-full border border-cta-foreground/15 bg-cta px-2.5 py-1 text-[11px] font-semibold leading-none text-cta-foreground shadow-sm", className)}
    >
      <Sparkles className="size-3 shrink-0" aria-hidden="true" />
      <span aria-hidden="true">Destaque</span>
    </span>
  );
}
