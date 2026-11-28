"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Copy, Instagram, Loader2, MessageCircle, RefreshCw, Smartphone, Sparkles } from "lucide-react";
import { promoCopyAction } from "@/app/(actions)/ai/action";
import { cn } from "@/lib/utils";
import type { PromoCopy } from "@/types/ai";

type EventAiPromoCopyProps = {
  eventId: string;
  /** Copies the text and shows the kit's own feedback. */
  onCopy: (text: string, success: string) => void | Promise<void>;
  /** Same visual tokens as the rest of the kit. */
  sectionClassName: string;
  sectionTitleClassName: string;
  actionClassName: string;
};

/** "Textos com IA" inside the promotion kit: Instagram, WhatsApp and Stories, generated on request. */
export function EventAiPromoCopy({ eventId, onCopy, sectionClassName, sectionTitleClassName, actionClassName }: EventAiPromoCopyProps) {
  const ids = useId();
  const [copy, setCopy] = useState<PromoCopy | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const request = useRef(0);

  const generate = () => {
    const current = ++request.current;
    setError("");
    startTransition(async () => {
      try {
        const result = await promoCopyAction(eventId);
        if (current !== request.current) return;
        if (result.ok) setCopy(result.data);
        else setError(result.error);
      } catch {
        if (current === request.current) setError("Não foi possível falar com a IA agora. Tente novamente em instantes.");
      }
    });
  };

  const blocks = copy ? [
    { key: "instagram", title: "Instagram", icon: Instagram, text: copy.instagram, copied: "Texto do Instagram copiado." },
    { key: "whatsapp", title: "WhatsApp", icon: MessageCircle, text: copy.whatsapp, copied: "Texto do WhatsApp copiado." },
    { key: "stories", title: "Stories", icon: Smartphone, text: copy.stories.join("\n\n"), copied: "Frases dos stories copiadas." },
  ] : [];

  return <section aria-labelledby={`${ids}-title`} className={sectionClassName}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h3 id={`${ids}-title`} className={sectionTitleClassName}><Sparkles className="size-4 text-brand" aria-hidden="true" />Textos com IA</h3>
        <p className="mt-1 text-sm text-muted-foreground">Legendas prontas para Instagram, WhatsApp e Stories, já com o link do evento.</p>
      </div>
      <button type="button" disabled={pending} onClick={generate} className={cn(actionClassName, "shrink-0 border-cta bg-cta text-cta-foreground hover:bg-cta/90")}>
        {pending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : copy ? <RefreshCw className="size-4" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
        {pending ? "Gerando…" : copy ? "Gerar outra versão" : "Gerar com IA"}
      </button>
    </div>
    <div aria-live="polite" aria-busy={pending} className="space-y-3">
      {pending && !copy && <div aria-hidden="true" className="space-y-2"><div className="h-20 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" /><div className="h-16 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" /></div>}
      {pending && <p className="sr-only">Gerando textos com IA…</p>}
      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {blocks.map(({ key, title, icon: Icon, text, copied }) => <div key={key} className="space-y-2 rounded-xl border bg-background p-3">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={`${ids}-${key}`} className="flex items-center gap-2 text-sm font-semibold"><Icon className="size-4 text-brand" aria-hidden="true" />{title}</label>
          <button type="button" onClick={() => void onCopy(text, copied)} className={actionClassName}><Copy className="size-4" aria-hidden="true" />Copiar<span className="sr-only"> texto do {title}</span></button>
        </div>
        <textarea id={`${ids}-${key}`} readOnly value={text} rows={key === "whatsapp" ? 5 : 4} className="w-full resize-y rounded-xl border bg-card p-3 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-primary" />
      </div>)}
      {copy && <p className="text-xs text-muted-foreground">Texto gerado por IA. Revise antes de publicar.</p>}
    </div>
  </section>;
}
