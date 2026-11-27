import { CheckCircle2, RotateCcw, ScanEye, ShieldAlert, UserRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EventTriageSummary } from "@/types";

type Verdict = EventTriageSummary["verdict"];

/** Automatic triage outcome, in the words the admin acts on. */
export const triageVerdicts: Record<Verdict, { label: string; icon: LucideIcon; className: string }> = {
  GREEN: { label: "Publicado automaticamente", icon: CheckCircle2, className: "border-emerald-600/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" },
  YELLOW: { label: "Devolvido para correção", icon: RotateCcw, className: "border-amber-600/25 bg-amber-500/10 text-amber-900 dark:text-amber-300" },
  RED: { label: "Precisa da sua revisão", icon: ShieldAlert, className: "border-destructive/30 bg-destructive/10 text-destructive" },
};

export const triageTrustLabels: Record<EventTriageSummary["trust"], string> = { NEW: "Novo", TESTING: "Em teste", TRUSTED: "Confiável" };

export function TriageBadge({ triage, className }: { triage: EventTriageSummary; className?: string }) {
  const verdict = triageVerdicts[triage.verdict];
  const Icon = verdict.icon;
  return <span data-triage-verdict={triage.verdict} className={cn("inline-flex min-h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium", verdict.className, className)}>
    <Icon className="h-3 w-3 shrink-0" aria-hidden="true" /><span><span className="sr-only">Triagem automática: </span>{verdict.label}</span>
  </span>;
}

/** Detail section: verdict, reasons, organizer trust level and whether the image was checked by AI. */
export function TriagePanel({ triage, eventId }: { triage: EventTriageSummary; eventId: string }) {
  const headingId = `review-triage-${eventId}`;
  const createdAt = new Date(triage.createdAt);
  return <section aria-labelledby={headingId} className="space-y-2">
    <h3 id={headingId} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Triagem automática</h3>
    <div className="flex flex-wrap items-center gap-1.5">
      <TriageBadge triage={triage} className="min-h-7 px-2.5" />
      <span className="inline-flex min-h-7 items-center gap-1 rounded-full border border-border bg-card/70 px-2.5 text-xs font-medium text-muted-foreground"><UserRound className="h-3 w-3 shrink-0" aria-hidden="true" />Organizador: {triageTrustLabels[triage.trust]}</span>
      {triage.aiUsed && <span className="inline-flex min-h-7 items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2.5 text-xs font-medium text-brand"><ScanEye className="h-3 w-3 shrink-0" aria-hidden="true" />Imagem conferida por IA</span>}
    </div>
    {triage.reasons.length > 0 && <ul className="space-y-1 text-sm">{triage.reasons.map((reason, index) => <li key={`${index}-${reason}`} className="flex gap-2"><span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/60" />{reason}</li>)}</ul>}
    {!Number.isNaN(createdAt.getTime()) && <p className="text-xs text-muted-foreground">Triagem em {createdAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>}
  </section>;
}
