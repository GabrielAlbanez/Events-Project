"use client";

import { useId, useRef, useState, useTransition } from "react";
import { AlertTriangle, ImagePlus, Loader2, MapPin, Sparkles, X } from "lucide-react";
import { draftEventAction } from "@/app/(actions)/ai/action";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { EventDraftSuggestion } from "@/types/ai";
import { aiImageAccept, prepareAiImage } from "./aiImage";

/** Form areas the suggestion can fill; "datas" covers both dates and "preco" covers free/price. */
export type DraftField = "nome" | "descricao" | "category" | "datas" | "startTime" | "endTime" | "endereco" | "preco" | "organizerName" | "ageRating" | "LinkParaCompraIngresso";

type EventAiDraftDialogProps = {
  /** Which areas already have a value in the form (those start unchecked). */
  filled: Record<DraftField, boolean>;
  /** The event already has a cover (new or stored). */
  hasBanner: boolean;
  categories: readonly string[];
  disabled?: boolean;
  onApply: (suggestion: EventDraftSuggestion, fields: DraftField[], poster: File | null) => void;
};

const fieldLabels: Record<DraftField, string> = {
  nome: "Nome do evento",
  descricao: "Descrição",
  category: "Categoria",
  datas: "Datas",
  startTime: "Horário de início",
  endTime: "Horário de término",
  endereco: "Endereço",
  preco: "Preço",
  organizerName: "Organização responsável",
  ageRating: "Classificação etária",
  LinkParaCompraIngresso: "Link de ingressos",
};
const fieldOrder: DraftField[] = ["nome", "descricao", "category", "datas", "startTime", "endTime", "endereco", "preco", "organizerName", "ageRating", "LinkParaCompraIngresso"];

const brDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-").reverse().join("/") : value;

/** Text shown for each suggested area, or null when the AI did not find it (or it cannot be applied). */
function suggestionText(field: DraftField, suggestion: EventDraftSuggestion, categories: readonly string[]): string | null {
  switch (field) {
    case "datas":
      if (!suggestion.dataInicio) return null;
      return suggestion.dataFim && suggestion.dataFim !== suggestion.dataInicio ? `${brDate(suggestion.dataInicio)} a ${brDate(suggestion.dataFim)}` : brDate(suggestion.dataInicio);
    case "preco":
      if (suggestion.isFree === true) return "Grátis";
      if (suggestion.price) return `R$ ${suggestion.price}`;
      return null;
    case "category":
      return suggestion.category && categories.includes(suggestion.category) ? suggestion.category : null;
    default: {
      const value = suggestion[field];
      return typeof value === "string" && value.trim() ? value.trim() : null;
    }
  }
}

export function EventAiDraftDialog({ filled, hasBanner, categories, disabled, onApply }: EventAiDraftDialogProps) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [poster, setPoster] = useState<File | null>(null);
  const [imageError, setImageError] = useState("");
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState<EventDraftSuggestion | null>(null);
  const [selected, setSelected] = useState<Set<DraftField>>(new Set());
  const [useAsCover, setUseAsCover] = useState(true);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const request = useRef(0);

  const available = suggestion ? fieldOrder.flatMap((field) => {
    const value = suggestionText(field, suggestion, categories);
    return value ? [{ field, value }] : [];
  }) : [];

  const reset = () => {
    request.current++;
    setText(""); setPoster(null); setImageError(""); setError(""); setSuggestion(null); setSelected(new Set()); setUseAsCover(true);
    if (fileRef.current) fileRef.current.value = "";
  };

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const pickPoster = async (file: File | undefined) => {
    setImageError("");
    if (!file) return;
    const prepared = await prepareAiImage(file);
    if (!prepared.ok) {
      setImageError(prepared.error);
      setPoster(null);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setPoster(prepared.file);
  };

  const removePoster = () => {
    setPoster(null);
    setImageError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const generate = () => {
    setError("");
    if (text.trim().length < 15 && !poster) {
      setError("Cole um texto sobre o evento (pelo menos uma frase) ou envie o cartaz.");
      return;
    }
    const current = ++request.current;
    startTransition(async () => {
      try {
        const payload = new FormData();
        payload.append("text", text.slice(0, 4000));
        if (poster) payload.append("image", poster);
        const result = await draftEventAction(payload);
        if (current !== request.current) return;
        if (!result.ok) { setError(result.error); return; }
        const fields = fieldOrder.filter((field) => suggestionText(field, result.data, categories) && !filled[field]);
        setSelected(new Set(fields));
        setSuggestion(result.data);
      } catch {
        if (current === request.current) setError("Não foi possível falar com a IA agora. Tente novamente em instantes.");
      }
    });
  };

  const toggle = (field: DraftField) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(field)) next.delete(field); else next.add(field);
    return next;
  });

  const apply = () => {
    if (!suggestion) return;
    const fields = fieldOrder.filter((field) => selected.has(field));
    onApply(suggestion, fields, poster && !hasBanner && useAsCover ? poster : null);
    changeOpen(false);
  };

  const canCover = Boolean(poster && !hasBanner);
  const nothingChosen = selected.size === 0 && !(canCover && useAsCover);

  return <>
    <section aria-labelledby={`${ids}-title`} className="flex flex-col gap-4 rounded-[22px] border border-primary/20 bg-primary/[0.05] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex min-w-0 items-start gap-3">
        <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-cta text-cta-foreground"><Sparkles className="h-5 w-5" /></span>
        <div className="min-w-0">
          <h2 id={`${ids}-title`} className="font-semibold">Escrever com IA</h2>
          <p className="mt-1 text-sm text-muted-foreground">Cole o post, a mensagem ou envie o cartaz. A IA sugere os campos e você confere antes de aplicar.</p>
        </div>
      </div>
      <Button type="button" variant="outline" disabled={disabled} onClick={() => setOpen(true)} className="w-full shrink-0 sm:w-auto"><Sparkles aria-hidden="true" />Escrever com IA</Button>
    </section>

    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-xl gap-5 overflow-y-auto rounded-2xl p-4 pt-5 sm:p-6">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold tracking-tight"><Sparkles aria-hidden="true" className="h-5 w-5 shrink-0 text-brand" />Escrever com IA</DialogTitle>
          <DialogDescription>{suggestion ? "Marque o que deseja levar para o formulário." : "A IA lê o texto ou o cartaz e sugere os campos do evento."}</DialogDescription>
        </DialogHeader>

        {!suggestion ? <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor={`${ids}-text`} className="text-sm font-medium">Cole aqui a descrição, o post ou a mensagem do evento</label>
            <Textarea id={`${ids}-text`} value={text} onChange={(change) => setText(change.target.value)} maxLength={4000} rows={7} disabled={pending} placeholder="Ex.: Samba no quintal neste sábado, 18h, na Rua das Flores, 120. Entrada R$ 20…" className="min-h-36 resize-y" aria-describedby={`${ids}-text-help`} />
            <p id={`${ids}-text-help`} className="text-xs text-muted-foreground">{text.length}/4000 caracteres</p>
          </div>
          <div className="space-y-2">
            <span className="block text-sm font-medium">Foto do cartaz <span className="font-normal text-muted-foreground">(opcional)</span></span>
            <input ref={fileRef} id={`${ids}-poster`} type="file" accept={aiImageAccept} className="peer sr-only" disabled={pending} aria-describedby={`${ids}-poster-help`} onChange={(change) => void pickPoster(change.target.files?.[0])} />
            {poster ? <div className="flex min-h-11 items-center justify-between gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2"><ImagePlus aria-hidden="true" className="h-4 w-4 shrink-0 text-brand" /><span className="truncate">{poster.name}</span></span>
              <button type="button" onClick={removePoster} disabled={pending} aria-label="Remover cartaz" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X aria-hidden="true" className="h-4 w-4" /></button>
            </div> : <label htmlFor={`${ids}-poster`} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold hover:border-primary/50 hover:bg-primary/[0.06] peer-focus-visible:ring-2 peer-focus-visible:ring-ring"><ImagePlus aria-hidden="true" className="h-4 w-4 text-brand" />Enviar foto do cartaz</label>}
            <p id={`${ids}-poster-help`} className="text-xs text-muted-foreground">JPG, PNG ou WebP. Imagens grandes são reduzidas antes do envio.</p>
            {imageError && <p role="alert" className="text-sm text-destructive">{imageError}</p>}
          </div>
          <div aria-live="polite" className="min-h-5 text-sm">
            {pending ? <p className="flex items-center gap-2 text-muted-foreground"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />Lendo as informações do evento…</p> : error ? <p role="alert" className="text-destructive">{error}</p> : null}
          </div>
        </div> : <div className="space-y-4" aria-live="polite">
          <p className="flex items-start gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground"><AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />Confira tudo antes de enviar — a IA pode errar.</p>
          {available.length === 0 ? <p className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">Não encontramos informações suficientes. Tente colar um texto mais completo ou outra foto do cartaz.</p>
          : <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">Sugestões da IA</legend>
            {available.map(({ field, value }) => <div key={field} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3">
              <input id={`${ids}-${field}`} type="checkbox" checked={selected.has(field)} onChange={() => toggle(field)} className="mt-0.5 h-5 w-5 shrink-0 accent-primary" />
              <label htmlFor={`${ids}-${field}`} className="min-w-0 flex-1 cursor-pointer text-sm">
                <span className="flex flex-wrap items-center gap-x-2 font-medium">{fieldLabels[field]}{filled[field] && <span className="text-xs font-normal text-muted-foreground">· substitui o valor atual</span>}</span>
                <span className={`mt-1 block whitespace-pre-wrap break-words text-muted-foreground ${field === "descricao" ? "line-clamp-6" : ""}`}>{value}</span>
                {field === "endereco" && <span className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-800 dark:text-amber-300"><MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />Confirme o endereço no mapa depois de aplicar.</span>}
              </label>
            </div>)}
          </fieldset>}
          {canCover && <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3">
            <input id={`${ids}-cover`} type="checkbox" checked={useAsCover} onChange={(change) => setUseAsCover(change.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-primary" />
            <label htmlFor={`${ids}-cover`} className="cursor-pointer text-sm"><span className="block font-medium">Usar o cartaz como capa</span><span className="mt-1 block text-muted-foreground">O evento ainda não tem banner. Você pode trocá-lo depois.</span></label>
          </div>}
        </div>}

        <DialogFooter className="gap-2 sm:gap-2">
          {suggestion ? <>
            <Button type="button" variant="outline" onClick={() => { request.current++; setSuggestion(null); setSelected(new Set()); }}>Voltar</Button>
            <Button type="button" variant="cta" disabled={nothingChosen} onClick={apply}>Aplicar ao formulário</Button>
          </> : <>
            <Button type="button" variant="outline" onClick={() => changeOpen(false)}>Cancelar</Button>
            <Button type="button" variant="cta" disabled={pending} onClick={generate}>{pending ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Sparkles aria-hidden="true" />}{pending ? "Gerando…" : "Gerar sugestões"}</Button>
          </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
