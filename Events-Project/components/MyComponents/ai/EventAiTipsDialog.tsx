"use client";

import { Lightbulb, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type EventAiTipsDialogProps = {
  open: boolean;
  loading: boolean;
  tips: string[];
  aiUsed: boolean;
  sending: boolean;
  /** Closes the dialog so the organizer can edit the form. */
  onAdjust: () => void;
  /** Continues the normal submission; tips never block it. */
  onSendAnyway: () => void;
};

/** "Dicas antes de enviar": suggestions shown right before the event is sent. */
export function EventAiTipsDialog({ open, loading, tips, aiUsed, sending, onAdjust, onSendAnyway }: EventAiTipsDialogProps) {
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onAdjust(); }}>
    <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-lg gap-5 overflow-y-auto rounded-2xl p-4 pt-5 sm:p-6">
      <DialogHeader className="pr-8 text-left">
        <DialogTitle className="flex items-center gap-2 leading-snug"><Lightbulb aria-hidden="true" className="h-5 w-5 shrink-0 text-brand" />Dicas antes de enviar</DialogTitle>
        <DialogDescription>{loading ? "Revisando o evento com IA…" : "Sugestões para deixar o evento mais claro. Você pode enviar mesmo assim."}</DialogDescription>
      </DialogHeader>
      <div aria-live="polite" aria-busy={loading} className="min-h-16">
        {loading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />Conferindo nome, descrição, data, local e capa…</p>
        : <>
          <ul className="space-y-2">
            {tips.map((tip) => <li key={tip} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3 text-sm leading-6">
              <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cta/20 text-[#4E7A00] dark:text-cta"><Lightbulb className="h-4 w-4" /></span>
              <span className="min-w-0 break-words">{tip}</span>
            </li>)}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">{aiUsed ? "Dicas geradas por IA e por regras automáticas. A IA pode errar." : "Dicas geradas por regras automáticas."}</p>
        </>}
      </div>
      <DialogFooter className="gap-2 sm:gap-2">
        <Button type="button" variant="outline" onClick={onAdjust}>Ajustar</Button>
        <Button type="button" variant="cta" disabled={sending} onClick={onSendAnyway}>{loading ? "Enviar sem revisar" : "Enviar mesmo assim"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
