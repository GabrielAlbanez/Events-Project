"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import type { AiResult, SearchIntent } from "@/types/ai";

type AiSearchBoxProps = {
  /** Categories present in the loaded events (sent so the AI only picks real ones). */
  categories: string[];
  /** Applies the understood intent to the existing home filters. */
  onApply: (intent: SearchIntent) => void;
  /** Undoes what the last AI search applied. */
  onClear: () => void;
  className?: string;
};

function isAiResult(value: unknown): value is AiResult<SearchIntent> {
  if (!value || typeof value !== "object") return false;
  const result = value as { ok?: unknown; data?: unknown; error?: unknown };
  if (result.ok === false) return typeof result.error === "string";
  if (result.ok !== true || !result.data || typeof result.data !== "object") return false;
  const data = result.data as Record<string, unknown>;
  return typeof data.q === "string" && typeof data.periodo === "string" && typeof data.categoria === "string" && typeof data.gratis === "boolean" && typeof data.preco === "string" && typeof data.nearMe === "boolean" && typeof data.understood === "string";
}

/** "Buscar com IA": a sentence in natural language turned into the home filters. */
export function AiSearchBox({ categories, onApply, onClear, className }: AiSearchBoxProps) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [understood, setUnderstood] = useState("");
  const controller = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = text.trim().slice(0, 300);
    if (q.length < 3) { setError("Escreva o que você procura, por exemplo: show de samba sábado até 50 reais."); return; }
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q, categories: categories.slice(0, 40) }),
        signal: current.signal,
      });
      const data: unknown = await response.json().catch(() => null);
      if (current.signal.aborted) return;
      if (!isAiResult(data)) { setError("Não foi possível usar a busca com IA agora. Use a busca comum."); return; }
      if (!data.ok) { setError(data.error); return; }
      setUnderstood(data.data.understood || "sua busca");
      onApply(data.data);
      setOpen(false);
    } catch {
      if (!current.signal.aborted) setError("Não foi possível usar a busca com IA agora. Use a busca comum.");
    } finally {
      if (controller.current === current) { setLoading(false); controller.current = null; }
    }
  };

  const clear = () => {
    controller.current?.abort();
    setUnderstood("");
    setText("");
    setError("");
    onClear();
  };

  return <div className={className}>
    <div aria-live="polite" className="empty:hidden">
      {understood && !open && <p className="flex min-h-11 items-center gap-2 rounded-2xl border border-primary/20 bg-primary/[0.06] py-1 pl-3 pr-1 text-xs">
        <Sparkles aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-brand" />
        <span className="min-w-0 flex-1 break-words"><span className="font-semibold">Buscando:</span> {understood}</span>
        <button type="button" onClick={clear} aria-label="Limpar busca com IA" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X aria-hidden="true" className="h-4 w-4" /></button>
      </p>}
    </div>
    {open ? <form onSubmit={(event) => void submit(event)} aria-label="Buscar com IA" className="mt-2 space-y-2 rounded-2xl border border-primary/25 bg-card p-3 shadow-sm">
      <label htmlFor={`${ids}-q`} className="flex items-center gap-2 text-xs font-semibold"><Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-brand" />Descreva o que você procura</label>
      <div className="flex items-center gap-2">
        <input ref={inputRef} id={`${ids}-q`} value={text} onChange={(change) => setText(change.target.value)} maxLength={300} disabled={loading} placeholder="Ex.: samba sábado perto de mim até 50 reais" aria-describedby={`${ids}-status`} className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-muted/50 px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30" />
        <button type="submit" disabled={loading} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-cta bg-cta px-4 text-sm font-semibold text-cta-foreground hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:opacity-60">{loading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Sparkles aria-hidden="true" className="h-4 w-4" />}{loading ? "Buscando…" : "Buscar"}</button>
      </div>
      <div id={`${ids}-status`} aria-live="polite" className="text-xs empty:hidden">
        {loading ? <span className="text-muted-foreground">Entendendo sua busca…</span> : error ? <span role="alert" className="text-destructive">{error}</span> : null}
      </div>
      <button type="button" onClick={() => { controller.current?.abort(); setOpen(false); setError(""); }} className="inline-flex min-h-11 items-center rounded-full px-1 text-xs font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Fechar busca com IA</button>
    </form>
    : <button type="button" onClick={() => setOpen(true)} aria-expanded={false} className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-1 text-xs font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Sparkles aria-hidden="true" className="h-4 w-4" />Buscar com IA</button>}
  </div>;
}
