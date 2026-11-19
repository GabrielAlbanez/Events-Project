"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarPlus, Check, Code2, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

type EmbedShareBoxProps = {
  snippet: string;
  calendarUrl: string;
  previewUrl: string;
  /** Texto auxiliar opcional, por exemplo quando um admin vê a conta de outro promotor. */
  note?: string;
};

type CopyTarget = "snippet" | "calendar";

export function EmbedShareBox({ snippet, calendarUrl, previewUrl, note }: EmbedShareBoxProps) {
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy(target: CopyTarget, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(target);
      setMessage(target === "snippet" ? "Código de incorporação copiado." : "Endereço da agenda copiado.");
    } catch {
      setCopied(null);
      setMessage("Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 2500);
  }

  return (
    <section id="incorporar" aria-labelledby="embed-title" className="scroll-mt-24 rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-brand"><Code2 className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 id="embed-title" className="text-xl font-semibold">Incorporar no seu site</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Mostre seus próximos eventos publicados no site da casa, do coletivo ou da prefeitura. A lista se atualiza sozinha e cada evento abre no EventMap.</p>
          {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor="embed-snippet" className="text-sm font-medium">Código do widget</label>
          <textarea id="embed-snippet" readOnly value={snippet} rows={4} onFocus={event => event.currentTarget.select()} className="mt-2 w-full resize-none rounded-xl border border-input bg-muted/40 p-3 font-mono text-xs leading-5 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="default" size="sm" onClick={() => void copy("snippet", snippet)}>
              {copied === "snippet" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied === "snippet" ? "Copiado" : "Copiar código"}
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={previewUrl} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />Pré-visualizar<span className="sr-only"> (abre em nova aba)</span></a>
            </Button>
          </div>
        </div>
        <div className="min-w-0">
          <label htmlFor="embed-calendar" className="text-sm font-medium">Agenda para calendário (ICS)</label>
          <input id="embed-calendar" readOnly value={calendarUrl} onFocus={event => event.currentTarget.select()} className="mt-2 h-11 w-full rounded-xl border border-input bg-muted/40 px-3 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Cole em Google Agenda, Apple Calendário ou Outlook (opção “assinar por URL”). Inclui só eventos publicados e futuros.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void copy("calendar", calendarUrl)}>
              {copied === "calendar" ? <Check aria-hidden="true" /> : <CalendarPlus aria-hidden="true" />}
              {copied === "calendar" ? "Copiado" : "Copiar endereço"}
            </Button>
          </div>
        </div>
      </div>
      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-muted-foreground">{message}</p>
    </section>
  );
}
