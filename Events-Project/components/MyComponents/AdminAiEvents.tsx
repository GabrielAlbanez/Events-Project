"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { Clock3, Download, ExternalLink, Loader2, Radio } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { useCommunityResource } from "@/components/MyComponents/CommunityResource";
import { useActivityRealtime } from "@/hooks/useActivityRealtime";
import { PUBLIC_EVENT_CITIES } from "@/lib/aiEvents/catalog";
import type { AiEventsAction, AiEventsSnapshot } from "@/types/aiEvents";

const dateTime = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};
const statuses: Record<string, string> = { QUEUED: "Na fila", RUNNING: "Buscando e verificando", SUCCEEDED: "Concluída", FAILED: "Não concluída", EMPTY: "Nenhum novo evento", PENDING: "Aguardando autorização", APPROVED: "Autorizado", PUBLISHED: "Publicado", REJECTED: "Descartado", INVALID: "Fonte não confirmada" };
type Confirmation = { payload: AiEventsAction; title: string; description: string };

export default function AdminAiEvents() {
  const { data: session, status } = useSession();
  if (status === "loading") return <main className="p-6"><p role="status" className="text-muted-foreground">Conferindo acesso ao painel…</p></main>;
  if (status !== "authenticated" || !session?.user?.id || session.user.role !== "ADMIN") return <main className="p-6"><p role="alert">Este painel está disponível somente para administradores.</p></main>;
  return <AiEventsContent key={`${session.user.id}:${session.user.role}`} />;
}

function AiEventsContent() {
  const resource = useCommunityResource<AiEventsSnapshot>("/api/admin/ai-events");
  const realtime = useActivityRealtime({ eventIds: [], roomIds: [] }, resource.refresh);
  const [city, setCity] = useState("São Paulo");
  const [maxPerRun, setMaxPerRun] = useState(3);
  const [enabled, setEnabled] = useState(false);
  const [authorize, setAuthorize] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const initialized = useRef(false);
  const [localError, setLocalError] = useState("");
  const snapshot = resource.data;
  const disabled = resource.busy || !resource.online || !resource.authenticated;
  useEffect(() => {
    if (!snapshot || initialized.current) return;
    initialized.current = true;
    if (!snapshot.config) return;
    setCity(snapshot.config.city); setMaxPerRun(snapshot.config.maxPerRun); setEnabled(snapshot.config.enabled);
  }, [snapshot]);

  const act = async (payload: AiEventsAction, success: string) => {
    setLocalError("");
    const saved = await resource.act({ ...payload });
    if (saved) {
      toast.success(success, { role: "status" });
      setConfirmation(null);
      if (payload.action === "settings") setAuthorize(false);
    }
    return saved;
  };
  const saveSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setLocalError("");
    if (enabled && !authorize) { setLocalError("Confirme a autorização administrativa antes de salvar a configuração."); return; }
    setConfirmation({ payload: { action: "settings", city: city.trim(), maxPerRun, enabled, authorize }, title: enabled ? "Autorizar busca a cada hora?" : "Salvar configuração?", description: enabled ? "A busca acontecerá de hora em hora. Cada evento ficará aguardando sua autorização antes de aparecer na agenda pública. Você pode pausar a busca neste painel." : "A automação ficará pausada. A busca não será executada de hora em hora até você ativá-la novamente." });
  };
  const inspectSource = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setLocalError("");
    try { if (new URL(sourceUrl).protocol !== "https:") throw new Error(); } catch { setLocalError("Informe uma página oficial com endereço HTTPS."); return; }
    void act({ action: "inspect", url: sourceUrl.trim() }, "Fonte enviada para verificação.");
  };
  const supportedCity = PUBLIC_EVENT_CITIES.some(option => option === city);
  const searchInProgress = snapshot?.runs.some(run => run.status === "QUEUED" || run.status === "RUNNING");
  const failure = localError || resource.error || (resource.message && resource.message !== "Alteração salva." ? resource.message : "");

  return <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10"><div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><Link href="/admin" className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-brand">← Administração</Link><p className="mt-3 text-xs font-bold uppercase tracking-[.18em] text-brand">Importação automática</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Importar eventos</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Busque eventos em fontes públicas e revise as propostas antes de publicá-las na agenda.</p></div><Button variant="outline" disabled={resource.loading || resource.refreshing || resource.busy || !resource.online} onClick={() => void resource.refresh()}>Atualizar</Button></header>
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border bg-card px-5 py-4 text-sm"><span className="inline-flex items-center gap-2"><Radio size={16} className="text-brand" aria-hidden="true" />{realtime === "live" ? "Atualizações em tempo real" : "Sincronizando atualizações"}</span><span className="inline-flex items-center gap-2 text-muted-foreground"><Clock3 size={16} aria-hidden="true" />Próxima execução: {dateTime(snapshot?.config?.nextRunAt ?? null)}</span></div>
    {failure && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"><p>{failure}</p><p className="mt-1 text-muted-foreground">Se a configuração ainda não estiver disponível, confira a preparação do servidor e tente atualizar novamente.</p></div>}
    {!resource.online && <p role="status" className="rounded-xl border p-4 text-sm text-muted-foreground">Sem conexão. Reconecte para buscar, autorizar ou publicar eventos.</p>}
    {resource.loading ? <p role="status" className="rounded-2xl border bg-card p-6 text-muted-foreground">Carregando configuração e eventos…</p> : !snapshot ? <section className="rounded-2xl border bg-card p-6"><h2 className="text-xl font-semibold">Painel ainda indisponível</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Não foi possível consultar a configuração. Nenhuma automação foi ativada por esta tela. Use Atualizar para tentar novamente.</p></section> : <>
      {!snapshot.configured && <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5"><h2 className="font-semibold">Fontes públicas indisponíveis</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Não há fontes disponíveis para busca neste momento. Tente novamente mais tarde ou envie o endereço oficial de um evento para verificação. Nenhum evento será publicado automaticamente.</p></section>}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)]">
        <section className="min-w-0 rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="ai-search-heading">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">Busca de eventos</p>
          <h2 id="ai-search-heading" className="mt-1 text-xl font-semibold">Defina o que buscar</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Escolha a cidade e quantas propostas quer receber por busca.</p>
          <form className="mt-5" onSubmit={saveSettings}>
            <fieldset disabled={disabled} className="space-y-5 disabled:opacity-60">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
                <label htmlFor="ai-events-city" className="block text-sm font-medium">
                  Cidade
                  <select id="ai-events-city" value={city} onChange={event => { setCity(event.target.value); setAuthorize(false); }}
                    className="mt-2 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {!supportedCity && <option value={city} disabled>{city} — indisponível</option>}
                    {PUBLIC_EVENT_CITIES.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label htmlFor="ai-events-limit" className="block text-sm font-medium">
                  Limite de propostas
                  <select id="ai-events-limit" value={maxPerRun} onChange={event => { setMaxPerRun(Number(event.target.value)); setAuthorize(false); }}
                    className="mt-2 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {[1, 2, 3, 4, 5].map(limit => <option key={limit} value={limit}>Até {limit}</option>)}
                  </select>
                </label>
              </div>
              {!supportedCity && <p className="text-sm text-destructive">Selecione uma cidade disponível para buscar.</p>}
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="cta" disabled={!supportedCity || !snapshot.configured || searchInProgress}
                  onClick={() => setConfirmation({
                    payload: { action: "run", city, maxPerRun },
                    title: "Iniciar busca agora?",
                    description: `A busca vai procurar até ${maxPerRun} ${maxPerRun === 1 ? "proposta" : "propostas"} em ${city}. Sua configuração de buscas por hora continua a mesma.`,
                  })}>
                  <Download size={16} aria-hidden="true" />{searchInProgress ? "Busca em andamento" : "Buscar agora"}
                </Button>
                <span className="text-xs text-muted-foreground">Cada proposta requer aprovação individual.</span>
              </div>
              <div className="space-y-3 border-t pt-5">
                <h3 className="text-base font-semibold">Busca por hora</h3>
                <p className="text-sm leading-6 text-muted-foreground">
                  {snapshot.config?.enabled
                    ? `Ativa em ${snapshot.config.city}, com até ${snapshot.config.maxPerRun} propostas por busca.`
                    : "Pausada. Ative e salve para usar os parâmetros acima a cada hora."}
                </p>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm font-medium">
                  <input type="checkbox" className="size-4 shrink-0 accent-primary" checked={enabled} disabled={!snapshot.configured && !enabled}
                    onChange={event => { setEnabled(event.target.checked); setAuthorize(false); }} />
                  Ativar busca por hora
                </label>
                {enabled && (
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm">
                    <input type="checkbox" className="size-4 shrink-0 accent-primary" checked={authorize} onChange={event => setAuthorize(event.target.checked)} />
                    Autorizo a execução de buscas por hora.
                  </label>
                )}
                <Button type="submit" variant="outline" disabled={!supportedCity || (enabled && !authorize)}>Salvar automação</Button>
              </div>
            </fieldset>
          </form>
        </section>
        <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="ai-source-heading">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">Verificação manual</p>
          <h2 id="ai-source-heading" className="mt-1 text-xl font-semibold">Verificar link de evento</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Envie a página oficial de um evento específico para verificar os dados e criar uma proposta.</p>
          <form className="mt-4 space-y-3" onSubmit={inspectSource}>
            <label className="block text-sm font-medium" htmlFor="ai-events-source">Endereço oficial
              <Input id="ai-events-source" type="url" className="mt-2 min-h-11" placeholder="https://…" value={sourceUrl}
                onChange={event => setSourceUrl(event.target.value)} required maxLength={2000} disabled={disabled} />
            </label>
            <Button type="submit" variant="outline" disabled={disabled || !sourceUrl.trim()}>Verificar fonte</Button>
          </form>
        </section>
      </div>
      <section className="rounded-2xl border bg-card p-5 sm:p-6"><h2 className="text-xl font-semibold">Eventos encontrados</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Confira nome, data, endereço e origem. A fonte oficial abre em uma nova aba.</p>{!snapshot.candidates.length ? <p className="mt-5 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">Nenhum evento encontrado ainda. Inicie uma busca ou envie uma fonte oficial.</p> : <ul className="mt-5 divide-y divide-border">{snapshot.candidates.map(candidate => <li key={candidate.id} className="flex min-w-0 flex-col gap-4 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><span className={candidate.status === "PUBLISHED" ? "inline-flex rounded-full border border-cta-foreground/15 bg-cta px-2.5 py-1 text-xs font-semibold text-cta-foreground" : "text-xs font-semibold text-muted-foreground"}>{statuses[candidate.status] ?? candidate.status}</span><h3 className="mt-1 break-words text-lg font-semibold">{candidate.name}</h3><p className="mt-2 text-sm text-muted-foreground">{dateTime(candidate.startDate)}</p><p className="mt-1 break-words text-sm leading-6 text-muted-foreground">{candidate.address}</p>{/^https:\/\//i.test(candidate.sourceUrl) && <a href={candidate.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 max-w-full items-center gap-2 break-all text-sm font-medium text-brand hover:underline">Conferir fonte oficial <ExternalLink size={14} className="shrink-0" aria-hidden="true" /></a>}</div><div className="flex shrink-0 flex-wrap gap-2">{candidate.status === "PENDING" && <><Button variant="cta" disabled={disabled} onClick={() => setConfirmation({ payload: { action: "approve", id: candidate.id }, title: "Autorizar publicação?", description: `O evento “${candidate.name}” será publicado na agenda do EventMap. Confirme os dados na fonte oficial antes de autorizar.` })}>Aprovar e publicar</Button><Button variant="outline" disabled={disabled} onClick={() => setConfirmation({ payload: { action: "reject", id: candidate.id }, title: "Descartar este evento?", description: "Este resultado não será publicado. A decisão será registrada no painel." })}>Descartar</Button></>}{candidate.eventId && <Button asChild variant="outline"><Link href={`/eventos/${encodeURIComponent(candidate.eventId)}`}>Ver evento</Link></Button>}</div></li>)}</ul>}</section>
      <section className="rounded-2xl border bg-card p-5 sm:p-6"><h2 className="text-xl font-semibold">Execuções recentes</h2>{!snapshot.runs.length ? <p className="mt-4 text-sm text-muted-foreground">Nenhuma execução registrada.</p> : <ul className="mt-4 divide-y divide-border">{snapshot.runs.map(run => <li key={run.id} className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0"><div><p className="text-sm font-semibold">{statuses[run.status] ?? run.status}</p><p className="mt-1 text-xs text-muted-foreground">{dateTime(run.startedAt)}{run.finishedAt ? ` · Finalizada em ${dateTime(run.finishedAt)}` : ""}</p>{run.message && <p className="mt-2 max-w-3xl break-words text-sm leading-6 text-muted-foreground">{run.message}</p>}</div><span className="text-sm text-muted-foreground">{run.createdCount} evento{run.createdCount === 1 ? "" : "s"}</span></li>)}</ul>}</section>
    </>}
    <Dialog open={confirmation !== null} onOpenChange={open => { if (!open && !resource.busy) setConfirmation(null); }}><DialogContent className="max-h-[90dvh] max-w-[calc(100%_-_2rem)] overflow-y-auto rounded-2xl data-[state=closed]:animate-none sm:max-w-lg"><DialogTitle>{confirmation?.title}</DialogTitle><DialogDescription className="leading-6">{confirmation?.description}</DialogDescription>{failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}<DialogFooter className="gap-2"><Button variant="outline" disabled={resource.busy} onClick={() => setConfirmation(null)}>Cancelar</Button><Button variant="cta" disabled={disabled || !confirmation} onClick={() => { if (confirmation) void act(confirmation.payload, confirmation.payload.action === "approve" ? "Evento publicado." : confirmation.payload.action === "run" ? "Busca adicionada à fila." : "Alteração salva."); }}>{resource.busy && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}Confirmar autorização</Button></DialogFooter></DialogContent></Dialog>
  </div></main>;
}

