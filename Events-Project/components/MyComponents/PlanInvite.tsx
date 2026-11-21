"use client";
import { useEffect, useMemo, useState } from "react";
import { Share2 } from "lucide-react";
import { toast } from "react-toastify";
import type { Evento } from "@/types";
import { buildPlanInvite } from "@/lib/planInvite";

export function PlanInvite({ events }: { events: Evento[] }) {
 const [selected, setSelected] = useState<string[]>([]);
 const [preview, setPreview] = useState("");
 const [busy, setBusy] = useState(false);
 const choices = useMemo(() => events.filter(event => selected.includes(event.id)), [events, selected]);
 useEffect(() => {
  setSelected(current => current.filter(id => events.some(event => event.id === id)));
  setPreview("");
 }, [events]);
 const toggle = (id: string) => {
  setSelected(current => current.includes(id) ? current.filter(item => item !== id) : current.length < 5 ? [...current,id] : current);
  setPreview("");
 };
 const prepare = () => { setPreview(buildPlanInvite(choices, window.location.origin)); };
 const share = async () => {
  if (!preview || busy) return;
  setBusy(true);
  try {
   if (navigator.share) { await navigator.share({ title: "Vamos juntos?", text: preview }); toast.success("Convite compartilhado.", { toastId: "plan-invite:shared" }); }
   else { await navigator.clipboard.writeText(preview); toast.success("Convite copiado. Cole na conversa com seus amigos.", { toastId: "plan-invite:copied" }); }
  } catch (error) {
   if (!(error instanceof DOMException && error.name === "AbortError")) toast.error("Não foi possível compartilhar. Selecione e copie o texto do convite abaixo.", { toastId: "plan-invite:error" });
  } finally { setBusy(false); }
 };
 if (!events.length) return null;
 return <section aria-labelledby="plan-invite-title" className="rounded-2xl border bg-card p-5 sm:p-6">
  <div className="flex items-start gap-3"><Share2 className="mt-1 h-5 w-5 shrink-0 text-brand" aria-hidden="true" /><div><h2 id="plan-invite-title" className="text-lg font-semibold tracking-tight">Combine com seus amigos</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Escolha até 5 próximos eventos e confira o convite antes de compartilhar.</p></div></div>
  <fieldset className="mt-4 space-y-1"><legend className="sr-only">Eventos para incluir no convite</legend>{events.map(event => <label key={event.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted"><input type="checkbox" checked={choices.some(item => item.id === event.id)} disabled={!selected.includes(event.id) && choices.length >= 5} onChange={() => toggle(event.id)} className="h-5 w-5 shrink-0 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" /><span className="min-w-0 break-words text-sm">{event.nome}</span></label>)}</fieldset>
  <button type="button" disabled={!choices.length} onClick={prepare} className="mt-4 min-h-11 rounded-xl border px-4 text-sm font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Prévia do convite ({choices.length}/5)</button>
  {preview && <div className="mt-4 space-y-3"><label htmlFor="plan-invite-preview" className="block text-sm font-medium">Este é o texto que será compartilhado</label><textarea id="plan-invite-preview" readOnly value={preview} rows={8} className="w-full resize-y rounded-xl border bg-background p-3 text-sm leading-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" /><button type="button" disabled={busy} onClick={share} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><Share2 className="h-4 w-4" aria-hidden="true" />{busy ? "Compartilhando..." : "Compartilhar convite"}</button></div>}
 </section>;
}
