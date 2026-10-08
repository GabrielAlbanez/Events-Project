"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, CheckCircle2, Clock3, Plus, Search, Trash2 } from "lucide-react";
import { Evento } from "@/types";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import CardEvents from "@/components/MyComponents/CardEvents";
import { useSocket } from "@/context/SocketContext";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { getRecentEventHistory } from "@/app/(actions)/eventHistory/action";
import { eventStatusLabels, type EventHistoryAction, type EventStatus } from "@/types/features";
import { FadeInView } from "@/components/animations/FadeInView";
import { ParallaxCard } from "@/components/animations/ParallaxCard";
import { StaggerList } from "@/components/animations/StaggerList";

type StatusFilter = "all" | EventStatus;
type HistoryEntry = {
  id: string;
  eventId: string;
  eventName: string;
  actorName: string | null;
  action: EventHistoryAction;
  note?: string | null;
  createdAt: string;
};
const filters: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  ...Object.entries(eventStatusLabels).map(([value, label]) => ({ value: value as EventStatus, label })),
];
const historyLabels: Record<EventHistoryAction, string> = { CREATED: "Criado", VALIDATED: "Publicado", DELETED: "Excluído", UPDATED: "Atualizado", CHANGES_REQUESTED: "Correção solicitada", CANCELLED: "Cancelado", SUBMITTED: "Enviado para análise", DUPLICATED: "Duplicado" };

export default function MyEvents() {
  const { data: user, status } = useCurrentUser();
  const socket = useSocket();
  const [events, setEvents] = useState<Evento[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [historyRetry, setHistoryRetry] = useState(0);

  useEffect(() => {
    if (!user?.id) {
      if (status !== "loading") setIsLoading(false);
      return;
    }
    let active = true;
    const fetchEvents = async () => {
      try {
        const response = await fetch("/api/EventsUser", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idUser: user.id }),
        });
        if (!response.ok) throw new Error("Request failed");
        const result: { status: string; message?: string; events?: Evento[] } = await response.json();
        if (result.status === "error" && result.message !== "Nenhum evento encontrado.") throw new Error("Request failed");
        if (active) {
          setEvents(result.events ?? []);
          setError("");
        }
      } catch {
        if (active) setError("Não foi possível carregar seus eventos. Tente novamente.");
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void fetchEvents();
    socket?.on("update-events", fetchEvents);
    socket?.on("connect", fetchEvents);
    return () => {
      active = false;
      socket?.off("update-events", fetchEvents);
      socket?.off("connect", fetchEvents);
    };
  }, [user?.id, status, socket, retryCount]);

  useEffect(() => {
    if (!user?.id) {
      if (status !== "loading") setHistoryLoading(false);
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fetchHistory = async () => {
      try {
        const result = await getRecentEventHistory();
        if (!active) return;
        if (result.status !== "success") throw new Error("History unavailable");
        setHistory(result.history);
        setHistoryError("");
      } catch {
        if (active) setHistoryError("Não foi possível carregar a atividade recente.");
      } finally {
        if (active) setHistoryLoading(false);
      }
    };
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void fetchHistory(); }, 150);
    };
    void fetchHistory();
    socket.on("event-history-updated", scheduleRefresh);
    socket.on("update-events", scheduleRefresh);
    socket.on("connect", scheduleRefresh);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      socket.off("event-history-updated", scheduleRefresh);
      socket.off("update-events", scheduleRefresh);
      socket.off("connect", scheduleRefresh);
    };
  }, [user?.id, status, socket, historyRetry]);

  const filteredEvents = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase("pt-BR");
    return events.filter((event) => {
      const matchesSearch = !query || [event.nome, event.descricao, event.endereco]
        .some((value) => value?.toLocaleLowerCase("pt-BR").includes(query));
      const matchesStatus = filterStatus === "all" || event.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [events, searchTerm, filterStatus]);
  const publishedCount = events.filter((event) => event.status === "PUBLISHED").length;
  const pendingCount = events.filter((event) => event.status === "PENDING").length;

  return (
    <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="relative isolate flex flex-wrap items-start justify-between gap-5 overflow-hidden rounded-3xl border bg-card/80 p-5 shadow-sm sm:p-6">
          <ParallaxCard
            className="pointer-events-none absolute inset-0"
            decorationClassName="absolute inset-0"
            secondaryClassName="absolute inset-0"
            pointerHost="parent"
            mobileScroll
            secondaryDecoration={<span className="absolute -right-8 -top-20 h-56 w-56 rounded-full bg-accent/30 blur-3xl" />}
          >
            <span className="absolute -right-24 top-2 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
          </ParallaxCard>
          <div className="relative z-10 flex min-w-0 items-start gap-4">
            <SidebarTrigger className="mt-1 shrink-0" />
            <FadeInView>
              <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-primary">Painel de eventos</p>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Meus eventos</h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">Acompanhe cada etapa, edite rascunhos e responda aos pedidos de correção.</p>
            </FadeInView>
          </div>
          <Link href="/CriarEvento" className="relative z-10 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <Plus className="size-4" aria-hidden="true" /> Criar evento
          </Link>
        </header>

        {!isLoading && !error && events.length > 0 && (
          <StaggerList className="grid gap-3 sm:grid-cols-3" itemClassName="h-full">
            <div className="h-full rounded-2xl border bg-card p-4 shadow-sm"><p className="text-sm text-muted-foreground">Total de eventos</p><p className="mt-1 text-2xl font-bold">{events.length}</p></div>
            <div className="h-full rounded-2xl border bg-card p-4 shadow-sm"><p className="text-sm text-muted-foreground">Publicados</p><p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{publishedCount}</p></div>
            <div className="h-full rounded-2xl border bg-card p-4 shadow-sm"><p className="text-sm text-muted-foreground">Em análise</p><p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">{pendingCount}</p></div>
          </StaggerList>
        )}

        <section aria-labelledby="event-history-title" className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 id="event-history-title" className="text-xl font-semibold">Atividade recente</h2><p className="mt-1 text-sm text-muted-foreground">Um registro das últimas mudanças, inclusive de eventos excluídos.</p></div></div>
          {historyLoading ? <p role="status" className="py-5 text-sm text-muted-foreground">Carregando atividade...</p> : historyError ? <div role="alert" className="py-3 text-sm"><p>{historyError}</p><button type="button" onClick={() => { setHistoryLoading(true); setHistoryRetry((count) => count + 1); }} className="mt-2 font-semibold text-primary underline underline-offset-4">Tentar novamente</button></div> : history.length === 0 ? <p className="py-5 text-sm text-muted-foreground">As mudanças dos seus eventos aparecerão aqui.</p> : <ol className="divide-y divide-border">{history.slice(0, 6).map((entry) => {
            const Icon = entry.action === "VALIDATED" ? CheckCircle2 : entry.action === "DELETED" ? Trash2 : Clock3;
            const actionLabel = historyLabels[entry.action];
            const date = new Date(entry.createdAt);
            return <li key={entry.id} className="flex gap-3 py-3 first:pt-0 last:pb-0"><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" aria-hidden="true" /></span><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{actionLabel}: {entry.eventName}</p>{entry.note && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{entry.note}</p>}<p className="mt-1 text-xs text-muted-foreground">{entry.actorName ? `Por ${entry.actorName} · ` : ""}{Number.isNaN(date.getTime()) ? "Data indisponível" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date)}</p></div></li>;
          })}</ol>}
        </section>

        {events.length > 0 && !error && (
          <section aria-label="Filtrar eventos" className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
            <label htmlFor="event-search" className="text-sm font-medium">Encontre um evento</label>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input id="event-search" type="search" placeholder="Busque por nome, descrição ou endereço" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="h-11 w-full rounded-xl border bg-background pl-10 pr-4 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar por status">
              {filters.map((filter) => (
                <button key={filter.value} type="button" aria-pressed={filterStatus === filter.value} onClick={() => setFilterStatus(filter.value)} className={`min-h-10 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${filterStatus === filter.value ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"}`}>
                  {filter.label}
                </button>
              ))}
            </div>
          </section>
        )}

        {isLoading ? (
          <div role="status" className="rounded-2xl border bg-card p-10 text-center text-muted-foreground">Carregando seus eventos...</div>
        ) : error ? (
          <div role="alert" className="rounded-2xl border bg-card p-10 text-center"><p>{error}</p><button type="button" onClick={() => { setIsLoading(true); setRetryCount((count) => count + 1); }} className="mt-4 font-semibold text-primary underline underline-offset-4">Tentar novamente</button></div>
        ) : events.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card p-8 text-center sm:p-12">
            <CalendarDays className="mx-auto size-10 text-primary" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-semibold">Seu primeiro evento começa aqui</h2>
            <p className="mx-auto mt-2 max-w-md text-muted-foreground">Crie um evento para compartilhar informações, imagens e localização com o público.</p>
            <Link href="/CriarEvento" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground">Criar meu primeiro evento</Link>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
            <h2 className="text-lg font-semibold">Nenhum evento corresponde aos filtros</h2>
            <p className="mt-2 text-muted-foreground">Tente outro termo ou veja todos os eventos.</p>
            <button type="button" onClick={() => { setSearchTerm(""); setFilterStatus("all"); }} className="mt-4 font-semibold text-primary underline underline-offset-4">Limpar filtros</button>
          </div>
        ) : (
          <section aria-label="Lista dos meus eventos">
            <p className="mb-4 text-sm text-muted-foreground">{filteredEvents.length} {filteredEvents.length === 1 ? "evento encontrado" : "eventos encontrados"}</p>
            {user && <CardEvents events={filteredEvents} adminId={user.id} />}
          </section>
        )}
      </div>
    </main>
  );
}
