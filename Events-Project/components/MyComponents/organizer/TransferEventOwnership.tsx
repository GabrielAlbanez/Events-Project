"use client";

import { useId, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { transferEventOwnership } from "@/app/(actions)/organizer/action";
import { ConfirmAction } from "@/components/MyComponents/ConfirmAction";
import { Input } from "@/components/ui/input";
import { extractEventId } from "@/lib/organizer/schema";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Admin tool to hand an imported event to its verified organizer (who must already be a Promoter). */
export function TransferEventOwnership() {
  const id = useId();
  const [eventValue, setEventValue] = useState("");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const eventId = extractEventId(eventValue);
  const ready = uuid.test(eventId) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function transfer() {
    try {
      const response = await transferEventOwnership(eventId, email.trim());
      setResult({ ok: response.success, message: response.message });
      if (response.success) { setEventValue(""); setEmail(""); }
    } catch {
      setResult({ ok: false, message: "Não foi possível transferir o evento agora. Tente novamente." });
    }
  }

  return <section aria-labelledby={`${id}-title`} className="rounded-2xl border border-border bg-card p-4 shadow-surface sm:p-6">
    <div className="flex items-start gap-3"><ArrowRightLeft className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" /><div><h2 id={`${id}-title`} className="text-xl font-semibold">Transferir evento para o organizador</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Use após confirmar a identidade de quem reivindicou o evento. A conta de destino precisa ser Promotor; a mudança fica registrada no histórico do evento.</p></div></div>
    <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
      <div><label htmlFor={`${id}-event`} className="mb-2 block text-sm font-medium">Link ou ID do evento</label><Input id={`${id}-event`} value={eventValue} onChange={event => { setEventValue(event.target.value); setResult(null); }} autoCapitalize="none" spellCheck={false} placeholder="https://.../eventos/... ou ID" aria-describedby={`${id}-event-help`} /><p id={`${id}-event-help`} className="mt-1 text-xs text-muted-foreground">Cole o endereço da página do evento.</p></div>
      <div><label htmlFor={`${id}-email`} className="mb-2 block text-sm font-medium">E-mail do novo responsável</label><Input id={`${id}-email`} type="email" value={email} onChange={event => { setEmail(event.target.value); setResult(null); }} autoCapitalize="none" spellCheck={false} placeholder="organizador@exemplo.com" /><p className="mt-1 text-xs text-muted-foreground">Antes, altere o papel da conta para Promotor na lista de usuários.</p></div>
      <div className="md:pb-5"><ConfirmAction title="Transferir evento?" description={`O evento passará para a conta ${email.trim() || "informada"}, que poderá editá-lo, ver inscrições e fazer check-in. Você poderá transferi-lo novamente se necessário.`} label="Transferir evento" busy={!ready} onConfirm={transfer} /></div>
    </div>
    {result && <p role={result.ok ? "status" : "alert"} className={`mt-4 text-sm ${result.ok ? "text-foreground" : "text-destructive"}`}>{result.message}</p>}
  </section>;
}
