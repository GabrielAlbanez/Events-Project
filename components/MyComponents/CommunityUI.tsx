"use client";

import { createContext, useContext, useEffect, useId, useState, type ReactNode, type FormEvent } from "react";
import { Radio, RefreshCw, WifiOff, CircleAlert } from "lucide-react";
import type { CommunityRealtimeStatus } from "@/hooks/useCommunityRealtime";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const communityInput = "min-h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CommunityOnlineContext = createContext(true);
export const useCommunityInteractions = () => useContext(CommunityOnlineContext);
export function CommunityInteractionBoundary({ online, children }: { online: boolean; children: ReactNode }) {
  return <CommunityOnlineContext.Provider value={online}>{children}</CommunityOnlineContext.Provider>;
}

export function CommunityCard({ title, description, children }: { title?: string; description?: string; children: ReactNode }) {
  return <section className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm sm:p-6">{title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}{description && <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>}<div className={title ? "mt-4 space-y-4" : "space-y-4"}>{children}</div></section>;
}

export function CommunityField({ name, label, type = "text", required = true, maxLength = 500, defaultValue, placeholder }: { name: string; label: string; type?: string; required?: boolean; maxLength?: number; defaultValue?: string; placeholder?: string }) {
  const id = useId();
  return <label htmlFor={id} className="block min-w-0 space-y-1.5 text-sm font-medium"><span>{label}</span>{type === "textarea" ? <textarea id={id} name={name} required={required} maxLength={maxLength} defaultValue={defaultValue} placeholder={placeholder} rows={3} className={communityInput} /> : <input id={id} name={name} type={type} required={required} maxLength={maxLength} defaultValue={defaultValue} placeholder={placeholder} className={communityInput} />}</label>;
}

export function CommunitySelect({ name, label, options, defaultValue }: { name: string; label: string; options: { value: string; label: string }[]; defaultValue?: string }) {
  const id = useId();
  const [selected, setSelected] = useState(defaultValue ?? options[0]?.value ?? "");
  const value = options.some(option => option.value === selected) ? selected : options[0]?.value ?? "";
  return <div className="min-w-0 space-y-1.5"><label htmlFor={id} className="text-sm font-medium">{label}</label><Select name={name} value={value} onValueChange={setSelected} disabled={!options.length}><SelectTrigger id={id} className="min-h-11 rounded-xl bg-background"><SelectValue /></SelectTrigger><SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>;
}

export function CommunityForm({ children, submit, busy, onSubmit, reset = true }: { children: ReactNode; submit: string; busy: boolean; onSubmit: (values: FormData) => Promise<boolean>; reset?: boolean }) {
  const online = useCommunityInteractions();
  const [error, setError] = useState("");
  const [resetVersion, setResetVersion] = useState(0);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !online) return;
    const form = event.currentTarget;
    setError("");
    try {
      if (await onSubmit(new FormData(form)) && reset) {
        form.reset();
        // Radix keeps its own selection state; remount fields after a successful reset.
        setResetVersion(value => value + 1);
      }
    } catch (cause) {
      setError(cause instanceof Error && !(cause instanceof RangeError) ? cause.message : "Confira os campos, incluindo a data e o horário.");
    }
  }
  return <form onSubmit={event => void handleSubmit(event)} className="space-y-3"><fieldset key={resetVersion} disabled={busy} className="min-w-0 space-y-3 disabled:opacity-60">{children}<Button type="submit" disabled={busy || !online} className="min-h-11 rounded-xl">{busy ? "Salvando..." : submit}</Button></fieldset>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</form>;
}

export function CommunityEmpty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed p-5 text-sm leading-6 text-muted-foreground">{children}</p>;
}

export function CommunityBadge({ children }: { children: ReactNode }) {
  return <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{children}</span>;
}

export function CommunityAction({ children, busy, onClick }: { children: ReactNode; busy: boolean; onClick: () => void }) {
  const online = useCommunityInteractions();
  return <Button type="button" variant="outline" disabled={busy || !online} onClick={onClick} className="min-h-11 max-w-full whitespace-normal rounded-xl">{children}</Button>;
}

export function CommunityStaleBanner({ error, hasData, online, refreshing, refresh }: { error: string; hasData: boolean; online: boolean; refreshing: boolean; refresh: () => void }) {
  if (!error && online) return null;
  return <aside role="alert" className="space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm"><p>{!online ? "Você está sem rede. Seus textos continuam nesta página; aguarde a conexão voltar para enviar." : error}</p>{hasData && <p className="text-muted-foreground">Exibindo a última atualização recebida. Alguns dados podem ter mudado. Seus rascunhos não foram apagados.</p>}<CommunityAction busy={refreshing || !online} onClick={refresh}>Tentar sincronizar novamente</CommunityAction></aside>;
}

export function CommunitySyncStatus({ refreshing, error, realtime, lastSuccessfulAt }: { refreshing: boolean; error: string; realtime: CommunityRealtimeStatus; lastSuccessfulAt?: string | null }) {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  const Icon = !online ? WifiOff : error ? CircleAlert : refreshing ? RefreshCw : Radio;
  const realtimeLabels = { connecting: "Conectando atualizações em tempo real...", live: "Atualizações ao vivo conectadas", fallback: "Tempo real desconectado · atualização periódica ativa", denied: "Atualizações ao vivo indisponíveis para este acesso" };
  const label = !online ? "Sem rede · os dados podem estar desatualizados" : error ? "Falha ao sincronizar · tente atualizar novamente" : refreshing ? "Atualizando dados..." : realtimeLabels[realtime];
  return <span role="status" className="inline-flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><Icon className="size-3.5 shrink-0" aria-hidden="true" />{label}{lastSuccessfulAt && <time dateTime={lastSuccessfulAt}>· Última atualização {new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(lastSuccessfulAt))}</time>}</span>;
}
