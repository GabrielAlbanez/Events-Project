"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import type { EventSummary } from "@/types/ai";

type SummaryState = { status: "loading" } | { status: "ready"; summary: EventSummary } | { status: "empty" };

function isSummary(value: unknown): value is EventSummary {
  if (!value || typeof value !== "object") return false;
  const summary = value as Record<string, unknown>;
  return typeof summary.what === "string" && typeof summary.forWho === "string" && typeof summary.bring === "string";
}

/** "Resumo rápido": three lines generated from the description. Renders nothing when there is no summary. */
export function EventAiSummary({ eventId }: { eventId: string }) {
  const [state, setState] = useState<SummaryState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetch(`/api/events/${encodeURIComponent(eventId)}/ai-summary`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { summary?: unknown } | null) => {
        if (controller.signal.aborted) return;
        setState(data && isSummary(data.summary) ? { status: "ready", summary: data.summary } : { status: "empty" });
      })
      .catch(() => { if (!controller.signal.aborted) setState({ status: "empty" }); });
    return () => controller.abort();
  }, [eventId]);

  if (state.status === "empty") return null;
  if (state.status === "loading") {
    return <div role="status" className="mb-5 h-[124px] animate-pulse rounded-[22px] border bg-muted/30 motion-reduce:animate-none"><span className="sr-only">Carregando resumo rápido…</span></div>;
  }

  const rows = [
    { label: "O que é", value: state.summary.what },
    { label: "Para quem", value: state.summary.forWho },
    { label: "O que levar", value: state.summary.bring },
  ].filter((row) => row.value.trim());
  if (!rows.length) return null;

  return <aside aria-labelledby="event-ai-summary-title" className="mb-5 rounded-[22px] border border-primary/15 bg-primary/[0.04] p-4 sm:p-5">
    <h3 id="event-ai-summary-title" className="flex items-center gap-2 text-sm font-semibold text-brand"><Sparkles aria-hidden="true" className="h-4 w-4 shrink-0" />Resumo rápido</h3>
    <dl className="mt-3 space-y-2 text-sm leading-6">
      {rows.map((row) => <div key={row.label} className="grid gap-x-3 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
        <dt className="font-semibold text-foreground">{row.label}</dt>
        <dd className="break-words text-muted-foreground">{row.value}</dd>
      </div>)}
    </dl>
    <p className="mt-3 text-xs text-muted-foreground">Resumo gerado por IA a partir da descrição.</p>
  </aside>;
}
