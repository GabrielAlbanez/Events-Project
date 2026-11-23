"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Inbox, RefreshCw, Search, Sparkles, Trash2, WifiOff } from "lucide-react";
import { toast } from "react-toastify";
import { solicitarCorrecao } from "@/app/(actions)/eventos/actions";
import { deleteEvents } from "@/app/(actions)/deleteEvents/action";
import { validateEvents } from "@/app/(actions)/validateEvents/action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { countByTab, defaultSort, defaultTab, filterQueue, isPending, nextPendingId, queueSortLabels, queueSummary, queueTabs, sortQueue, type QueueSort, type QueueTab } from "@/lib/adminReviewQueue";
import type { Evento } from "@/types";
import { AdminReviewDetail } from "./AdminReviewDetail";
import { CorrectionDialog, DeleteDialog } from "./AdminReviewDialogs";
import { QueueRow, QueueTabs, queuePanelId, queueTabLabelId } from "./AdminReviewQueue";

export type AdminReviewActions = {
  validate: (ids: string[], adminId: string) => Promise<{ status: string; message?: string; validatedEventIds?: string[] }>;
  requestCorrection: (id: string, reason: string) => Promise<{ success: boolean; message?: string }>;
  remove: (ids: string[], adminId: string) => Promise<{ status: string; message?: string }>;
};

const serverActions: AdminReviewActions = { validate: validateEvents, requestCorrection: solicitarCorrecao, remove: deleteEvents };

export type AdminReviewWorkspaceProps = {
  adminId: string;
  events: Evento[];
  onEventsChange: Dispatch<SetStateAction<Evento[]>>;
  isLoading: boolean;
  error: string;
  socketConnected: boolean;
  onRefresh: () => Promise<void>;
  /** Called after a confirmed mutation so other sessions and this list refresh. */
  onChanged: (payload?: { validatedEventIds?: string[] }) => void;
  actions?: AdminReviewActions;
};

const desktopQuery = "(min-width: 1024px)";
function subscribeDesktop(callback: () => void) {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const useIsDesktop = () => useSyncExternalStore(subscribeDesktop, () => window.matchMedia(desktopQuery).matches, () => false);

const emptyCopy: Record<QueueTab, { title: string; text: string }> = {
  pending: { title: "Fila zerada", text: "Nenhum evento aguarda sua decisão agora." },
  published: { title: "Nenhum evento publicado", text: "Eventos aprovados aparecem aqui." },
  changes: { title: "Nenhuma correção em aberto", text: "Eventos devolvidos ao promotor aparecem aqui." },
  cancelled: { title: "Nenhum evento cancelado", text: "Eventos cancelados pela organização aparecem aqui." },
  ended: { title: "Nenhum evento encerrado", text: "Eventos finalizados aparecem aqui." },
  all: { title: "Nenhum evento recebido", text: "Quando um promotor enviar um evento, ele aparece aqui." },
};

function QueueSkeleton() {
  return <div role="status" aria-live="polite" aria-busy="true" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
    <span className="sr-only">Carregando eventos...</span>
    <div aria-hidden="true" className="divide-y divide-border rounded-xl border border-border bg-card">{Array.from({ length: 6 }, (_, index) => <div key={index} className="flex gap-3 p-3"><div className="size-14 shrink-0 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" /><div className="flex-1 space-y-2 py-1"><div className="h-3.5 w-3/5 rounded-full bg-muted" /><div className="h-3 w-4/5 rounded-full bg-muted" /><div className="h-3 w-2/5 rounded-full bg-muted" /></div></div>)}</div>
    <div aria-hidden="true" className="hidden h-96 rounded-xl border border-border bg-card lg:block" />
  </div>;
}

export function AdminReviewWorkspace({ adminId, events, onEventsChange, isLoading, error, socketConnected, onRefresh, onChanged, actions = serverActions }: AdminReviewWorkspaceProps) {
  const isDesktop = useIsDesktop();
  const [now] = useState(() => new Date());
  const [chosenTab, setChosenTab] = useState<QueueTab | null>(null);
  const [chosenSort, setChosenSort] = useState<QueueSort | null>(null);
  const [query, setQuery] = useState("");
  const [importedOnly, setImportedOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [correctionEvent, setCorrectionEvent] = useState<Evento | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<Evento[]>([]);
  const lock = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const queueRef = useRef<HTMLDivElement>(null);
  const focusTimer = useRef<number | undefined>(undefined);
  const skipFocusRestore = useRef(false);

  // Atalho "Validar agora" da importação. Lido no cliente para a página não precisar de Suspense no build.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("importados") === "pendentes") { setImportedOnly(true); setChosenTab("pending"); }
  }, []);
  useEffect(() => () => window.clearTimeout(focusTimer.current), []);

  const tab = chosenTab ?? defaultTab(events);
  const sort = chosenSort ?? defaultSort(tab);
  const counts = useMemo(() => countByTab(events, importedOnly), [events, importedOnly]);
  const summary = useMemo(() => queueSummary(events, now), [events, now]);
  const visible = useMemo(() => sortQueue(filterQueue(events, { tab, importedOnly, query }), sort), [events, tab, importedOnly, query, sort]);
  const explicit = selectedId ? visible.find(event => event.id === selectedId) ?? null : null;
  const detailEvent = explicit ?? (isDesktop ? visible[0] ?? null : null);
  const detailIndex = detailEvent ? visible.findIndex(event => event.id === detailEvent.id) : -1;
  const checkedVisible = useMemo(() => visible.filter(event => checkedIds.has(event.id)), [visible, checkedIds]);
  const checkedPending = checkedVisible.filter(isPending);
  const allChecked = visible.length > 0 && checkedVisible.length === visible.length;
  const hasFilters = importedOnly || Boolean(query.trim());
  const selectAllRef = useCallback((node: HTMLInputElement | null) => { if (node) node.indeterminate = checkedVisible.length > 0 && !allChecked; }, [checkedVisible.length, allChecked]);

  const moveFocus = useCallback((target: "detail" | "queue") => {
    window.clearTimeout(focusTimer.current);
    focusTimer.current = window.setTimeout(() => {
      skipFocusRestore.current = false;
      (target === "detail" ? headingRef.current ?? queueRef.current : queueRef.current)?.focus({ preventScroll: target === "queue" ? false : true });
    }, 60);
  }, []);
  const onDialogCloseAutoFocus = useCallback((event: Event) => { if (skipFocusRestore.current) event.preventDefault(); }, []);

  const changeTab = useCallback((next: QueueTab) => { setChosenTab(next); setChosenSort(null); setSelectedId(null); setActionError(""); }, []);
  const openEvent = useCallback((id: string) => { setSelectedId(id); setActionError(""); }, []);
  const toggleChecked = useCallback((id: string) => setCheckedIds(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }), []);
  const openCorrection = useCallback((event: Evento) => setCorrectionEvent(event), []);
  const openDelete = useCallback((event: Evento) => setDeleteTargets([event]), []);

  function clearImported() {
    setImportedOnly(false);
    if (new URLSearchParams(window.location.search).has("importados")) window.history.replaceState(null, "", window.location.pathname);
  }

  /** Runs after a server-confirmed decision: keeps the current tab and moves to the next pending event. */
  function advanceFrom(decidedIds: string[], order: Evento[], message: string) {
    const decided = new Set(decidedIds);
    const anchor = decidedIds[0];
    const next = nextPendingId(order, anchor, decided);
    const nextEvent = next ? order.find(event => event.id === next) : null;
    setChosenTab(tab);
    setCheckedIds(current => new Set(Array.from(current).filter(id => !decided.has(id))));
    setSelectedId(current => (current === null || decided.has(current)) ? next : current);
    setAnnouncement(nextEvent ? `${message} Próximo: ${nextEvent.nome}.` : `${message} Não há outros eventos pendentes nesta lista.`);
    skipFocusRestore.current = true;
    moveFocus(next ? "detail" : "queue");
  }

  async function publish(event: Evento) {
    if (lock.current) return;
    lock.current = true;
    setBusyId(event.id);
    setActionError("");
    const order = visible;
    try {
      const result = await actions.validate([event.id], adminId);
      if (result.status !== "success") { setActionError(result.message || "Não foi possível publicar o evento."); return; }
      const validated = result.validatedEventIds ?? [];
      if (!validated.includes(event.id)) {
        setActionError("Este evento já não está em análise. A lista foi atualizada.");
        await onRefresh();
        return;
      }
      onEventsChange(list => list.map(item => item.id === event.id ? { ...item, validate: true, status: "PUBLISHED", reviewNote: null } : item));
      onChanged({ validatedEventIds: validated });
      toast.success("Evento publicado.");
      advanceFrom([event.id], order, "Evento publicado.");
    } catch {
      setActionError("Não foi possível publicar o evento. Tente novamente.");
    } finally {
      lock.current = false;
      setBusyId(null);
    }
  }

  async function publishChecked() {
    const ids = checkedPending.map(event => event.id);
    if (!ids.length || lock.current) return;
    lock.current = true;
    setBulkBusy(true);
    const order = visible;
    try {
      const result = await actions.validate(ids, adminId);
      if (result.status !== "success") { toast.error(result.message || "Não foi possível publicar os eventos."); return; }
      const validated = result.validatedEventIds ?? [];
      onEventsChange(list => list.map(item => validated.includes(item.id) ? { ...item, validate: true, status: "PUBLISHED", reviewNote: null } : item));
      onChanged({ validatedEventIds: validated });
      if (validated.length === ids.length) toast.success(`${validated.length} evento(s) publicado(s).`);
      else toast.warning(`${validated.length} de ${ids.length} publicados. Os demais já não estavam em análise.`);
      if (validated.length) advanceFrom(validated, order, `${validated.length} evento(s) publicado(s).`);
    } catch {
      toast.error("Não foi possível publicar os eventos. Tente novamente.");
    } finally {
      lock.current = false;
      setBulkBusy(false);
    }
  }

  async function submitCorrection(event: Evento, reason: string) {
    if (lock.current) return "Aguarde a ação em andamento.";
    lock.current = true;
    setBusyId(event.id);
    const order = visible;
    try {
      const result = await actions.requestCorrection(event.id, reason);
      if (!result.success) return result.message || "Não foi possível solicitar a correção.";
      onEventsChange(list => list.map(item => item.id === event.id ? { ...item, status: "CHANGES_REQUESTED", reviewNote: reason } : item));
      onChanged();
      toast.success("Pedido de correção enviado ao promotor.");
      advanceFrom([event.id], order, "Pedido de correção enviado.");
      return null;
    } catch {
      return "Não foi possível solicitar a correção.";
    } finally {
      lock.current = false;
      setBusyId(null);
    }
  }

  async function confirmDelete(targets: Evento[]) {
    if (lock.current) return "Aguarde a ação em andamento.";
    lock.current = true;
    setBulkBusy(true);
    const ids = targets.map(event => event.id);
    const order = visible;
    try {
      const result = await actions.remove(ids, adminId);
      if (result.status !== "success") return result.message || "Não foi possível excluir.";
      onEventsChange(list => list.filter(item => !ids.includes(item.id)));
      onChanged();
      toast.success(ids.length === 1 ? "Evento excluído." : `${ids.length} eventos excluídos.`);
      advanceFrom(ids, order, ids.length === 1 ? "Evento excluído." : `${ids.length} eventos excluídos.`);
      return null;
    } catch {
      return "Não foi possível excluir os eventos.";
    } finally {
      lock.current = false;
      setBulkBusy(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  }

  function stepDetail(direction: -1 | 1) {
    if (!visible.length) return;
    const next = visible[(Math.max(detailIndex, 0) + direction + visible.length) % visible.length];
    openEvent(next.id);
    moveFocus("detail");
  }

  function onQueueKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const current = (event.target as HTMLElement).closest<HTMLElement>("[data-queue-row]");
    if (!current) return;
    const rows = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-queue-row]"));
    const target = rows[rows.indexOf(current) + (event.key === "ArrowDown" ? 1 : -1)];
    if (!target) return;
    event.preventDefault();
    target.focus();
    if (isDesktop) openEvent(target.dataset.queueRow as string);
  }

  const detail = detailEvent ? <AdminReviewDetail key={detailEvent.id} event={detailEvent} now={now} position={detailIndex + 1} total={visible.length} busy={busyId === detailEvent.id || bulkBusy} error={actionError} headingRef={headingRef} onStep={stepDetail} onPublish={item => void publish(item)} onRequestCorrection={openCorrection} onDelete={openDelete} /> : null;
  const firstPending = sortQueue(events.filter(event => isPending(event) && (!importedOnly || event.aiImport)), "oldest")[0];
  const tabLabel = queueTabs.find(item => item.id === tab)?.label ?? "";

  return <div className="mx-auto w-full max-w-[1440px] px-3 pb-6 pt-4 sm:px-6 lg:px-8 lg:py-6">
    <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    <header className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Revisar eventos</h1>
        {!isLoading && <p className="mt-0.5 text-sm text-muted-foreground">{summary.pending ? <><strong className="font-semibold text-foreground">{summary.pending} {summary.pending === 1 ? "evento aguarda" : "eventos aguardam"} você</strong>{summary.imported > 0 && ` · ${summary.imported} ${summary.imported === 1 ? "importado" : "importados"}`}{summary.withProblems > 0 && ` · ${summary.withProblems} com dados a conferir`}</> : "Nenhum evento aguardando validação"}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon" aria-label="Atualizar lista" title="Atualizar lista" disabled={refreshing || isLoading} onClick={() => void refresh()}><RefreshCw className={`h-4 w-4 ${refreshing ? "motion-safe:animate-spin" : ""}`} aria-hidden="true" /></Button>
        {firstPending && <Button type="button" onClick={() => { if (tab !== "pending") changeTab("pending"); setChosenSort(null); openEvent(firstPending.id); moveFocus("detail"); }}>Revisar próximo</Button>}
      </div>
    </header>

    {!socketConnected && <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"><WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" /><p role="status">Atualizações automáticas indisponíveis. Atualize a lista para ver mudanças.</p></div>}

    {isLoading ? <QueueSkeleton /> : error && !events.length ? <div role="alert" className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-6 text-center"><AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" /><h2 className="text-lg font-semibold">A fila está indisponível</h2><p className="max-w-md text-sm text-muted-foreground">{error}</p><Button type="button" variant="outline" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? "Tentando..." : "Tentar novamente"}</Button></div> : <>
      {error && <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-sm"><p>Não foi possível atualizar. Exibindo os últimos dados carregados.</p><Button type="button" variant="ghost" disabled={refreshing} onClick={() => void refresh()}>Tentar novamente</Button></div>}
      <QueueTabs active={tab} counts={counts} onChange={changeTab} />

      <div className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label className="relative block"><span className="sr-only">Buscar na fila</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input type="search" value={query} onChange={item => setQuery(item.target.value)} placeholder="Nome, organizador, local ou data" className="pl-9" /></label>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 sm:contents">
          <Button type="button" variant={importedOnly ? "secondary" : "outline"} aria-pressed={importedOnly} onClick={() => { if (importedOnly) clearImported(); else setImportedOnly(true); setSelectedId(null); }}><Sparkles className="h-4 w-4" aria-hidden="true" />Importados</Button>
          <label className="block"><span className="sr-only">Ordenar fila</span><select value={sort} onChange={item => setChosenSort(item.target.value as QueueSort)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{(Object.keys(queueSortLabels) as QueueSort[]).map(key => <option key={key} value={key}>{queueSortLabels[key]}</option>)}</select></label>
        </div>
      </div>

      {importedOnly && tab === "pending" && <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1 text-sm"><p className="font-semibold">Importados aguardando validação <span className="font-normal text-muted-foreground">· {visible.length}</span></p><Link href="/EventsCreated" onClick={() => setImportedOnly(false)} className="inline-flex min-h-11 items-center font-semibold text-brand hover:underline">Ver todos</Link></div>}

      <div className={`grid items-start gap-4 ${visible.length ? "lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_460px]" : ""}`}>
        <div ref={queueRef} id={queuePanelId} role="tabpanel" tabIndex={-1} aria-labelledby={queueTabLabelId(tab)} className="min-w-0 overflow-hidden rounded-xl border border-border bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {visible.length > 0 && <div className="flex min-h-11 flex-wrap items-center gap-x-2 border-b border-border py-0.5 pl-0.5 pr-2 sm:pl-2">
            <label className="flex min-h-11 cursor-pointer items-center gap-1 pr-2 text-xs font-medium text-muted-foreground"><span className="flex size-11 items-center justify-center"><input ref={selectAllRef} type="checkbox" checked={allChecked} disabled={bulkBusy} onChange={() => setCheckedIds(allChecked ? new Set() : new Set(visible.map(event => event.id)))} aria-label={`Selecionar todos os ${visible.length} eventos de ${tabLabel}`} className="size-4 rounded accent-[hsl(var(--primary))]" /></span>{checkedVisible.length ? `${checkedVisible.length} selecionado(s)` : `${visible.length} ${visible.length === 1 ? "evento" : "eventos"}`}</label>
            {checkedVisible.length > 0 && <div className="ml-auto flex items-center gap-1">
              {checkedPending.length > 0 && <Button type="button" variant="ghost" size="sm" disabled={bulkBusy} onClick={() => void publishChecked()}><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Publicar ({checkedPending.length})</Button>}
              <Button type="button" variant="ghost" size="sm" disabled={bulkBusy} className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteTargets(checkedVisible)}><Trash2 className="h-4 w-4" aria-hidden="true" />Excluir ({checkedVisible.length})</Button>
            </div>}
          </div>}
          {visible.length ? <ul aria-label={`Eventos em ${tabLabel}`} onKeyDown={onQueueKeyDown} className="divide-y divide-border">{visible.map(event => <QueueRow key={event.id} event={event} now={now} selected={detailEvent?.id === event.id} checked={checkedIds.has(event.id)} disabled={bulkBusy} onOpen={openEvent} onToggle={toggleChecked} onRequestCorrection={openCorrection} onDelete={openDelete} />)}</ul>
            : <div className="flex min-h-64 flex-col items-center justify-center gap-2 p-6 text-center">{tab === "pending" && !hasFilters ? <CheckCircle2 className="h-6 w-6 text-emerald-700 dark:text-emerald-300" aria-hidden="true" /> : <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden="true" />}<h2 className="font-semibold">{hasFilters ? "Nada com estes filtros" : emptyCopy[tab].title}</h2><p className="max-w-sm text-sm text-muted-foreground">{hasFilters ? "Ajuste a busca ou remova o filtro de importados." : emptyCopy[tab].text}</p>{hasFilters ? <Button type="button" variant="outline" onClick={() => { setQuery(""); clearImported(); }}>Limpar filtros</Button> : tab === "pending" ? <Button type="button" variant="outline" onClick={() => changeTab("published")}>Ver publicados</Button> : null}</div>}
        </div>

        {isDesktop && detail && <aside aria-label="Revisão do evento" className="sticky top-[calc(var(--site-header-height,76px)+1rem)] h-[calc(100dvh-var(--site-header-height,76px)-2rem)] overflow-hidden rounded-xl border border-border bg-card">{detail}</aside>}
      </div>
    </>}

    {!isDesktop && <Sheet open={Boolean(detailEvent)} onOpenChange={open => { if (!open) { setSelectedId(null); setActionError(""); } }}>
      <SheetContent side="bottom" onCloseAutoFocus={onDialogCloseAutoFocus} className="z-[110] flex h-[92dvh] flex-col gap-0 rounded-t-2xl bg-card p-0 [&>button:first-of-type]:right-1 [&>button:first-of-type]:top-0 [&>button:first-of-type]:flex [&>button:first-of-type]:size-11 [&>button:first-of-type]:items-center [&>button:first-of-type]:justify-centerdata-[state=open]:duration-200 motion-reduce:!animate-none motion-reduce:!transition-none">
        <SheetTitle className="sr-only">Revisão do evento{detailEvent ? `: ${detailEvent.nome}` : ""}</SheetTitle>
        <SheetDescription className="sr-only">Confira os dados e decida sem sair da fila.</SheetDescription>
        {detail}
      </SheetContent>
    </Sheet>}

    <CorrectionDialog event={correctionEvent} onClose={() => setCorrectionEvent(null)} onSubmit={submitCorrection} onCloseAutoFocus={onDialogCloseAutoFocus} />
    <DeleteDialog events={deleteTargets} onClose={() => setDeleteTargets([])} onConfirm={confirmDelete} onCloseAutoFocus={onDialogCloseAutoFocus} />
  </div>;
}
