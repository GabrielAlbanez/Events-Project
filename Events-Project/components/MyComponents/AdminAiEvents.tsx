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
import { importedBadge } from "@/lib/aiEvents/sources";
import type { ImportOutcome, ImportReport } from "@/lib/aiEvents/service";
import type { AiEventCandidate, AiEventsAction, AiEventsSnapshot } from "@/types/aiEvents";

const dateTime = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};
const statuses: Record<string, string> = { QUEUED: "Na fila", RUNNING: "Buscando e verificando", SUCCEEDED: "Concluída", PARTIAL: "Concluída em parte", FAILED: "Não concluída", EMPTY: "Nenhum novo evento", APPROVED: "Autorizado", PUBLISHED: "Publicado", REJECTED: "Rejeitado", INVALID: "Fonte não confirmada" };
const candidateStatus = (candidate: AiEventCandidate) =>
  candidate.status === "PENDING" ? (candidate.eventId ? "Aguardando validação" : "Proposta antiga — aguardando revisão") : statuses[candidate.status] ?? candidate.status;
type Confirmation = { payload: AiEventsAction; title: string; description: string };
/** A busca roda na requisição com orçamento de 45 s; o navegador espera um pouco mais que a rota (60 s). */
const IMPORT_TIMEOUT_MS = 65_000;
const outcomeLabels: [ImportOutcome, string][] = [["already_imported", "já importado(s)"], ["previously_rejected", "rejeitado(s) antes"], ["possible_duplicate", "possível(is) duplicado(s)"], ["invalid", "sem dados suficientes"], ["failed", "com falha"]];

export default function AdminAiEvents() {
  const { data: session, status } = useSession();
  if (status === "loading") return <div className="p-6"><p role="status" className="text-muted-foreground">Conferindo acesso ao painel…</p></div>;
  if (status !== "authenticated" || !session?.user?.id || session.user.role !== "ADMIN") return <div className="p-6"><p role="alert">Este painel está disponível somente para administradores.</p></div>;
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
  const [importing, setImporting] = useState<"run" | "inspect" | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const initialized = useRef(false);
  const [localError, setLocalError] = useState("");
  const snapshot = resource.data;
  const disabled = resource.busy || importing !== null || !resource.online || !resource.authenticated;
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
  // Busca e verificação imediatas: chamada própria porque podem passar dos 30 s do recurso compartilhado.
  const importNow = async (payload: Extract<AiEventsAction, { action: "run" | "inspect" }>) => {
    setLocalError(""); setReport(null); setImporting(payload.action);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMPORT_TIMEOUT_MS);
    try {
      const response = await fetch("/api/admin/ai-events", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({})) as { message?: string; report?: ImportReport | null };
      if (!response.ok) throw new Error(result.message || "Não foi possível concluir a busca. Tente novamente.");
      setReport(result.report ?? null);
      if (payload.action === "inspect") setSourceUrl("");
      toast.success(result.report?.created ? `${result.report.created} evento(s) enviado(s) para validação.` : "Busca concluída.", { role: "status" });
    } catch (cause) {
      setLocalError(controller.signal.aborted ? "A busca demorou mais que o esperado. Atualize a página para ver o que foi importado." : cause instanceof Error ? cause.message : "Não foi possível concluir a busca. Tente novamente.");
    } finally {
      clearTimeout(timeout); setImporting(null);
      void resource.refresh();
    }
  };
  const saveSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setLocalError("");
    if (enabled && !authorize) { setLocalError("Confirme a autorização administrativa antes de salvar a configuração."); return; }
    const activating = enabled && !snapshot?.config?.enabled;
    setConfirmation({
      payload: { action: "settings", city: city.trim(), maxPerRun, enabled, authorize },
      title: activating ? "Ativar busca automática?" : "Salvar configuração?",
      description: activating
        ? "A primeira busca começa em instantes. Depois, as buscas seguem de hora em hora. Os eventos encontrados entram como pendentes na fila de validação."
        : enabled
          ? "Os parâmetros salvos serão usados nas próximas buscas. Os eventos encontrados entram como pendentes na fila de validação."
          : "A automação deixará de agendar buscas. Os eventos já importados continuam na fila de validação.",
    });
  };
  const inspectSource = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setLocalError("");
    try { if (new URL(sourceUrl).protocol !== "https:") throw new Error(); } catch { setLocalError("Informe uma página oficial com endereço HTTPS."); return; }
    void importNow({ action: "inspect", url: sourceUrl.trim() });
  };
  const supportedCity = PUBLIC_EVENT_CITIES.some(option => option === city);
  const searchInProgress = importing !== null;
  const reportCount = (outcome: ImportOutcome) => report?.items.filter(item => item.outcome === outcome).length ?? 0;
  const createdByPlatform = report ? Object.entries(report.items.filter(item => item.outcome === "created").reduce<Record<string, number>>((total, item) => ({ ...total, [item.platform]: (total[item.platform] ?? 0) + 1 }), {})) : [];
  const failure = localError || resource.error || (resource.message && resource.message !== "Alteração salva." ? resource.message : "");

  return <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10"><div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><Link href="/admin" className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-brand">← Administração</Link><p className="mt-3 text-xs font-bold uppercase tracking-[.18em] text-brand">Importação de fontes oficiais</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Importar eventos</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Busque eventos da cidade na Sympla e na Ticket360. Eles entram como pendentes na fila de validação; nada é publicado sem a sua aprovação.</p></div><Button variant="outline" disabled={resource.loading || resource.refreshing || resource.busy || !resource.online} onClick={() => void resource.refresh()}>Atualizar</Button></header>
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[22px] border bg-card px-5 py-4 text-sm shadow-[var(--em-shadow-card)]"><span className="inline-flex items-center gap-2"><Radio size={16} className="text-brand" aria-hidden="true" />{realtime === "live" ? "Atualizações em tempo real" : "Sincronizando atualizações"}</span><span className="inline-flex items-center gap-2 text-muted-foreground"><Clock3 size={16} aria-hidden="true" />Próxima execução: {dateTime(snapshot?.config?.nextRunAt ?? null)}</span></div>
    {failure && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"><p>{failure}</p><p className="mt-1 text-muted-foreground">Se a configuração ainda não estiver disponível, confira a preparação do servidor e tente atualizar novamente.</p></div>}
    {!resource.online && <p role="status" className="rounded-xl border p-4 text-sm text-muted-foreground">Sem conexão. Reconecte para buscar, autorizar ou publicar eventos.</p>}
    {resource.loading ? <p role="status" className="rounded-[22px] border bg-card p-6 text-muted-foreground shadow-[var(--em-shadow-card)]">Carregando configuração e eventos…</p> : !snapshot ? <section className="rounded-[22px] border bg-card p-6 shadow-[var(--em-shadow-card)]"><h2 className="text-xl font-semibold">Painel ainda indisponível</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Não foi possível consultar a configuração. Nenhuma automação foi ativada por esta tela. Use Atualizar para tentar novamente.</p></section> : <>
      {!snapshot.configured && <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5"><h2 className="font-semibold">Fontes públicas indisponíveis</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Não há fontes disponíveis para busca neste momento. Tente novamente mais tarde ou envie o endereço oficial de um evento para verificação. Nenhum evento será publicado automaticamente.</p></section>}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)]">
        <section className="min-w-0 rounded-[22px] border bg-card p-5 sm:p-6 shadow-[var(--em-shadow-card)]" aria-labelledby="ai-search-heading">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">Busca de eventos</p>
          <h2 id="ai-search-heading" className="mt-1 text-xl font-semibold">Defina o que buscar</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Escolha a cidade e quantos eventos quer importar por busca.</p>
          <form className="mt-5" onSubmit={saveSettings}>
            <fieldset disabled={disabled} className="space-y-5 disabled:opacity-60">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
                <label htmlFor="ai-events-city" className="block text-sm font-medium">
                  Cidade
                  <select id="ai-events-city" value={city} onChange={event => { setCity(event.target.value); setAuthorize(false); }}
                    className="mt-2 min-h-11 w-full rounded-2xl border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {!supportedCity && <option value={city} disabled>{city} — indisponível</option>}
                    {PUBLIC_EVENT_CITIES.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label htmlFor="ai-events-limit" className="block text-sm font-medium">
                  Limite por busca
                  <select id="ai-events-limit" value={maxPerRun} onChange={event => { setMaxPerRun(Number(event.target.value)); setAuthorize(false); }}
                    className="mt-2 min-h-11 w-full rounded-2xl border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {[1, 2, 3, 4, 5].map(limit => <option key={limit} value={limit}>Até {limit}</option>)}
                  </select>
                </label>
              </div>
              {!supportedCity && <p className="text-sm text-destructive">Selecione uma cidade disponível para buscar.</p>}
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="cta" disabled={!supportedCity || !snapshot.configured || searchInProgress} aria-busy={importing === "run"}
                  onClick={() => void importNow({ action: "run", city, maxPerRun })}>
                  {importing === "run"
                    ? <><Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Buscando em Sympla e Ticket360…</>
                    : <><Download size={16} aria-hidden="true" />Buscar agora em {city}</>}
                </Button>
                <span className="text-xs text-muted-foreground">Os eventos encontrados entram como pendentes na fila de validação.</span>
              </div>
              <div className="space-y-3 border-t pt-5">
                <h3 className="text-base font-semibold">Busca por hora</h3>
                <p className="text-sm leading-6 text-muted-foreground">
                  {snapshot.config?.enabled
                    ? `Ativa em ${snapshot.config.city}, com até ${snapshot.config.maxPerRun} eventos por busca.`
                    : "Pausada. Ao ativar e salvar, a primeira busca começa em instantes. As seguintes rodam de hora em hora."}
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
        <section className="rounded-[22px] border bg-card p-5 sm:p-6 shadow-[var(--em-shadow-card)]" aria-labelledby="ai-source-heading">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">Verificação manual</p>
          <h2 id="ai-source-heading" className="mt-1 text-xl font-semibold">Verificar link de evento</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Cole a página oficial de um evento da Sympla, Ticket360, Ingresse, Eventim ou Sesc SP. Se os dados forem confirmados, ele entra como pendente na fila de validação.</p>
          <form className="mt-4 space-y-3" onSubmit={inspectSource}>
            <label className="block text-sm font-medium" htmlFor="ai-events-source">Endereço oficial
              <Input id="ai-events-source" type="url" className="mt-2 min-h-11" placeholder="https://…" value={sourceUrl}
                onChange={event => setSourceUrl(event.target.value)} required maxLength={2000} disabled={disabled} />
            </label>
            <Button type="submit" variant="outline" disabled={disabled || !sourceUrl.trim()} aria-busy={importing === "inspect"}>
              {importing === "inspect" && <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}Verificar e importar agora
            </Button>
          </form>
        </section>
      </div>
      {report && <section role="status" aria-labelledby="ai-report-heading" className="rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:p-6">
        <h2 id="ai-report-heading" className="text-lg font-semibold">{report.created} evento(s) criado(s) e aguardando validação</h2>
        {outcomeLabels.some(([outcome]) => reportCount(outcome)) && <p className="mt-2 text-sm text-muted-foreground">{outcomeLabels.filter(([outcome]) => reportCount(outcome)).map(([outcome, label]) => `${reportCount(outcome)} ${label}`).join(" · ")}</p>}
        {createdByPlatform.length > 0 && <p className="mt-2 text-sm">{createdByPlatform.map(([platform, total]) => `${platform}: ${total}`).join(" · ")}</p>}
        {report.sourceErrors.map(error => <p key={error.platform} className="mt-2 text-sm text-destructive">{error.message}</p>)}
        {report.partial && <p className="mt-2 text-sm text-muted-foreground">A busca foi interrompida pelo tempo limite; rode de novo para continuar.</p>}
        {report.created > 0 && <Link href="/EventsCreated?importados=pendentes" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-cta px-4 text-sm font-semibold text-cta-foreground hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Validar agora →</Link>}
      </section>}
      <section className="rounded-[22px] border bg-card p-5 sm:p-6 shadow-[var(--em-shadow-card)]"><h2 className="text-xl font-semibold">Eventos encontrados</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Confira nome, data, endereço e origem. A fonte oficial abre em uma nova aba.</p>{!snapshot.candidates.length ? <p className="mt-5 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">Nenhum evento importado ainda. Faça uma busca ou cole o link oficial de um evento.</p> : <ul className="mt-5 divide-y divide-border">{snapshot.candidates.map(candidate => <li key={candidate.id} className="flex min-w-0 flex-col gap-4 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={candidate.status === "PUBLISHED" ? "inline-flex rounded-full border border-cta-foreground/15 bg-cta px-2.5 py-1 text-xs font-semibold text-cta-foreground" : "text-xs font-semibold text-muted-foreground"}>{candidateStatus(candidate)}</span><span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground">{importedBadge(candidate.sourceUrl)}</span></div><h3 className="mt-1 break-words text-lg font-semibold">{candidate.name}</h3><p className="mt-2 text-sm text-muted-foreground">{dateTime(candidate.startDate)}</p><p className="mt-1 break-words text-sm leading-6 text-muted-foreground">{candidate.address}</p>{/^https:\/\//i.test(candidate.sourceUrl) && <a href={candidate.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 max-w-full items-center gap-2 break-all text-sm font-medium text-brand hover:underline">Conferir fonte oficial <ExternalLink size={14} className="shrink-0" aria-hidden="true" /></a>}</div><div className="flex shrink-0 flex-wrap gap-2">{candidate.status === "PENDING" && !candidate.eventId && <><Button variant="cta" disabled={disabled} onClick={() => setConfirmation({ payload: { action: "approve", id: candidate.id }, title: "Criar como pendente?", description: `O evento “${candidate.name}” será criado como pendente e aparecerá na fila de validação. Ele só vai ao ar depois que você validar.` })}>Enviar para validação</Button><Button variant="outline" disabled={disabled} onClick={() => setConfirmation({ payload: { action: "reject", id: candidate.id }, title: "Descartar este evento?", description: "Este resultado não será importado. A decisão será registrada no painel." })}>Descartar</Button></>}{candidate.status === "PENDING" && candidate.eventId && <Button asChild variant="cta"><Link href="/EventsCreated?importados=pendentes">Validar na fila</Link></Button>}{candidate.eventId && <Button asChild variant="outline"><Link href={`/eventos/${encodeURIComponent(candidate.eventId)}`}>Ver evento</Link></Button>}</div></li>)}</ul>}</section>
      <section className="rounded-[22px] border bg-card p-5 sm:p-6 shadow-[var(--em-shadow-card)]"><h2 className="text-xl font-semibold">Execuções recentes</h2>{!snapshot.runs.length ? <p className="mt-4 text-sm text-muted-foreground">Nenhuma execução registrada.</p> : <ul className="mt-4 divide-y divide-border">{snapshot.runs.map(run => <li key={run.id} className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0"><div><p className="text-sm font-semibold">{statuses[run.status] ?? run.status}</p><p className="mt-1 text-xs text-muted-foreground">{dateTime(run.startedAt)}{run.finishedAt ? ` · Finalizada em ${dateTime(run.finishedAt)}` : ""}</p>{run.message && <p className="mt-2 max-w-3xl break-words text-sm leading-6 text-muted-foreground">{run.message}</p>}</div><span className="text-sm text-muted-foreground">{run.createdCount} evento{run.createdCount === 1 ? "" : "s"}</span></li>)}</ul>}</section>
    </>}
    <Dialog open={confirmation !== null} onOpenChange={open => { if (!open && !resource.busy) setConfirmation(null); }}><DialogContent className="max-h-[90dvh] max-w-[calc(100%_-_2rem)] overflow-y-auto rounded-2xl data-[state=closed]:animate-none sm:max-w-lg"><DialogTitle>{confirmation?.title}</DialogTitle><DialogDescription className="leading-6">{confirmation?.description}</DialogDescription>{failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}<DialogFooter className="gap-2"><Button variant="outline" disabled={resource.busy} onClick={() => setConfirmation(null)}>Cancelar</Button><Button variant="cta" disabled={disabled || !confirmation} onClick={() => { if (confirmation) void act(confirmation.payload, confirmation.payload.action === "approve" ? "Evento criado como pendente." : "Alteração salva."); }}>{resource.busy && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}Confirmar</Button></DialogFooter></DialogContent></Dialog>
  </div></div>;
}

