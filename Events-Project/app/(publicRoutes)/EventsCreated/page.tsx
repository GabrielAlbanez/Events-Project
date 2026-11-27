"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Evento } from "@/types";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useSocket, useSocketStatus } from "@/context/SocketContext";
import TableEventsClient, { ViewModeToggle, type EventViewMode } from "@/components/MyComponents/TableEventsClient";
import { AdminReviewWorkspace } from "@/components/MyComponents/admin/AdminReviewWorkspace";
import PublicEventFilters, { DiscoveryFilter, emptyDiscoveryFilter, filterDiscovery } from "@/components/MyComponents/PublicEventFilters";
import { AlertCircle, CalendarDays, LayoutGrid, MapPin, RotateCcw, Search, X } from "lucide-react";
import { matchesPeriod, type DiscoveryPeriod } from "@/lib/discoveryPeriod";
import { categoryVisual } from "@/components/MyComponents/home/discoveryVisuals";
import styles from "./agenda.module.css";
import { FadeInView } from "@/components/animations/FadeInView";
import { LoadingShimmer } from "@/components/animations/LoadingShimmer";
import { Button } from "@/components/ui/button";

const periods: { label: string; value: DiscoveryPeriod }[] = [
  { label: "Todos", value: "todos" },
  { label: "Hoje", value: "hoje" },
  { label: "Fim de semana", value: "fim-de-semana" },
  { label: "Este mês", value: "mes" },
];
const pill = "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const pillIdle = "border-border bg-card text-foreground/80 hover:border-primary/40 hover:bg-primary/5";
const pillActive = "border-cta-foreground/10 bg-cta text-cta-foreground shadow-sm";
const categoryActive = "border-primary/45 bg-primary/10 text-brand";

export default function EventsCreated() {
  const { data: user } = useCurrentUser();
  const identity = useRef(`${user?.id ?? "anonymous"}:${user?.role ?? "public"}`);
  identity.current = `${user?.id ?? "anonymous"}:${user?.role ?? "public"}`;
  const latestRequest = useRef(0);
  const socket = useSocket();
  const socketConnected = useSocketStatus();
  const [discovery, setDiscovery] = useState<DiscoveryFilter>(emptyDiscoveryFilter);
  const [events, setEvents] = useState<Evento[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [period, setPeriod] = useState<DiscoveryPeriod>("todos");
  const [viewMode, setViewMode] = useState<EventViewMode>("cards");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchEvents = useCallback(async () => {
    const requestedIdentity = `${user?.id ?? "anonymous"}:${user?.role ?? "public"}`;
    // Only the newest request may write, so a slow older response cannot undo a confirmed review decision.
    const request = ++latestRequest.current;
    const isCurrent = () => request === latestRequest.current && requestedIdentity === identity.current;
    try {
      const response = await fetch(user?.role === "ADMIN" ? "/api/admin/events" : "/api/AllEvents");
      if (!response.ok) throw new Error("Request failed");
      const result: Evento[] = await response.json();
      if (!Array.isArray(result)) throw new Error("Invalid response");
      if (!isCurrent()) return;
      setEvents(result);
      setError("");
    } catch {
      if (!isCurrent()) return;
      setError("Não foi possível carregar os eventos. Tente novamente.");
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [user?.role, user?.id]);

  useEffect(() => {
    setEvents([]);
    setIsLoading(true);
    void fetchEvents();
    const handleUpdate = () => void fetchEvents();
    socket.on("update-events", handleUpdate);
    socket.on("connect", handleUpdate);
    return () => {
      socket.off("update-events", handleUpdate);
      socket.off("connect", handleUpdate);
    };
  }, [fetchEvents, socket]);

  const handleAdminChanged = useCallback((payload?: { validatedEventIds?: string[] }) => {
    if (payload) socket.emit("events-changed", payload);
    else socket.emit("events-changed");
    void fetchEvents();
  }, [fetchEvents, socket]);

  const filteredEvents = useMemo(() => filterDiscovery(events, discovery).filter((event) => {
    const query = searchTerm.trim().toLocaleLowerCase("pt-BR");
    return matchesPeriod(event, period) && (!query || [event.nome, event.descricao, event.dataInicio, event.dataFim]
      .some((value) => value?.toLocaleLowerCase("pt-BR").includes(query)));
  }), [events, searchTerm, discovery, period]);
  const publicResultCount = filteredEvents.filter(event => event.validate && event.status !== "CANCELLED").length;
  /** Real published catalog (same rule as the list) for the header count and the category pills. */
  const publishedEvents = useMemo(() => events.filter(event => event.validate && event.status !== "CANCELLED"), [events]);
  const categories = useMemo(() => Array.from(new Set(publishedEvents.map(event => event.category).filter((category): category is NonNullable<Evento["category"]> => Boolean(category)))).sort((a, b) => a.localeCompare(b, "pt-BR")), [publishedEvents]);
  const clearDiscovery = (patch: Partial<DiscoveryFilter>) => setDiscovery(current => ({ ...current, ...patch, travelMinutes: null, travelDurations: {} }));
  const appliedChips: { key: string; label: string; clear: () => void }[] = [
    ...(period !== "todos" ? [{ key: "period", label: periods.find(item => item.value === period)?.label ?? "Período", clear: () => setPeriod("todos") }] : []),
    ...(discovery.category ? [{ key: "category", label: discovery.category, clear: () => clearDiscovery({ category: "" }) }] : []),
    ...(discovery.free ? [{ key: "free", label: "Grátis", clear: () => clearDiscovery({ free: false }) }] : []),
    ...(discovery.maxPrice ? [{ key: "price", label: `Até R$ ${discovery.maxPrice}`, clear: () => clearDiscovery({ maxPrice: "" }) }] : []),
    ...(discovery.radius && discovery.origin ? [{ key: "radius", label: `Até ${discovery.radius} km`, clear: () => clearDiscovery({ radius: "" }) }] : []),
  ];
  const hasActiveFilters = Boolean(searchTerm.trim() || appliedChips.length || discovery.travelMinutes !== null);
  const clearAll = () => { setSearchTerm(""); setPeriod("todos"); setDiscovery(emptyDiscoveryFilter); };

  if (user?.role === "ADMIN") {
    return <AdminReviewWorkspace key={user.id} adminId={user.id} events={events} onEventsChange={setEvents} isLoading={isLoading} error={error} socketConnected={socketConnected} onRefresh={fetchEvents} onChanged={handleAdminChanged} />;
  }

  const resultLabel = publicResultCount === 1 ? "evento encontrado" : "eventos encontrados";
  return (
    <div className="em-page mx-auto flex min-h-full w-full max-w-7xl flex-col px-4 pb-10 pt-5 sm:px-6 sm:pb-14 sm:pt-9 lg:px-10 lg:pt-12" data-decor="ring">
      <FadeInView className="mb-6 w-full sm:mb-8">
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <p className="em-eyebrow">Explore o EventMap</p>
            <h1 className={`em-title ${styles.title} mt-3`}>Agenda de eventos<svg className={styles.titleUnderline} viewBox="0 0 240 24" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M4 19 C 70 9, 150 4, 236 7" /></svg></h1>
            <p className="em-subtitle mt-4">Encontre experiências e organize seus próximos dias.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {!isLoading && !error && publishedEvents.length > 0 && <span className="max-sm:hidden inline-flex min-h-9 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-sm text-muted-foreground shadow-[var(--em-shadow-card)]"><CalendarDays className="h-4 w-4 text-brand" aria-hidden="true" /><span><strong className="font-bold tabular-nums text-foreground">{publishedEvents.length}</strong> {publishedEvents.length === 1 ? "evento publicado" : "eventos publicados"}</span></span>}
            {socketConnected && <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-sm font-medium text-muted-foreground shadow-[var(--em-shadow-card)]" title="A lista se atualiza sozinha quando eventos são publicados ou alterados"><span aria-hidden="true" className={styles.liveDot} />Atualização ao vivo</span>}
          </div>
        </header>
      </FadeInView>
      {!socketConnected && <div className="mb-5 flex w-full items-center justify-between gap-3 rounded-[18px] border border-amber-300/50 bg-amber-50 px-4 py-2.5 text-[13px] leading-5 sm:py-3 sm:text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"><p role="status">Atualizações automáticas indisponíveis. Atualize a lista para ver mudanças.</p><Button type="button" variant="outline" className="min-h-11 shrink-0 rounded-full px-3 sm:px-4" disabled={isLoading} onClick={() => void fetchEvents()}><RotateCcw className="h-4 w-4" aria-hidden="true" />Atualizar<span className="max-sm:hidden">lista</span></Button></div>}
      {isLoading ? (
        <div role="status" aria-live="polite" aria-busy="true" className="w-full space-y-5">
          <span className="sr-only">Carregando eventos...</span>
          <div aria-hidden="true" className="h-[74px] rounded-[24px] border border-border bg-card shadow-[var(--em-shadow-card)]" />
          <div aria-hidden="true" className="flex gap-2 overflow-hidden">{[96, 80, 132, 112, 104].map((width, index) => <div key={index} className="h-11 shrink-0 rounded-full bg-muted" style={{ width }} />)}</div>
          <div aria-hidden="true" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => <div key={index} className="overflow-hidden rounded-[22px] border border-border bg-card shadow-[var(--em-shadow-card)]">
              <div className="relative aspect-[16/10] overflow-hidden bg-muted"><LoadingShimmer className="h-full w-full text-brand/20" /></div>
              <div className="space-y-3 p-5"><div className="flex gap-3.5"><div className="h-[68px] w-14 shrink-0 rounded-2xl bg-primary/10" /><div className="flex-1 space-y-3 pt-1"><div className="h-3 w-1/3 rounded-full bg-muted" /><div className="h-5 w-4/5 rounded-full bg-muted" /></div></div><div className="h-3 w-2/3 rounded-full bg-muted" /><div className="flex justify-end pt-3"><div className="h-11 w-36 rounded-full bg-cta/30" /></div></div>
            </div>)}
          </div>
        </div>
      ) : error ? (
        <div role="alert" className="flex min-h-80 w-full flex-col items-center justify-center gap-4 rounded-[22px] border border-border bg-card p-6 text-center shadow-[var(--em-shadow-card)]"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"><AlertCircle className="h-6 w-6" aria-hidden="true" /></span><h2 className="text-xl font-semibold tracking-tight">A agenda está indisponível</h2><p className="max-w-md text-sm leading-6 text-muted-foreground">{error}</p><Button type="button" className="min-h-11 rounded-full bg-cta px-5 text-cta-foreground hover:bg-cta/90" onClick={() => { setIsLoading(true); void fetchEvents(); }}><RotateCcw className="h-4 w-4" aria-hidden="true" />Tentar novamente</Button></div>
      ) : (
        <>
          <div className="flex w-full flex-col gap-4">
            <div className={styles.search}>
              <label className={styles.field}>
                <Search className={styles.fieldIcon} size={20} aria-hidden="true" />
                <span className={styles.fieldStack}><span className={styles.fieldLabel}>Buscar eventos</span><input type="search" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Nome, descrição ou data" /></span>
              </label>
              {searchTerm && <button type="button" className={styles.clear} onClick={() => setSearchTerm("")} aria-label="Limpar busca"><X className="h-4 w-4" aria-hidden="true" /></button>}
              <Link href="/#home-discovery" className={styles.mapButton} aria-label="Explorar no mapa" title="Explorar no mapa"><MapPin size={18} aria-hidden="true" /><span className={styles.mapButtonLabel}>Explorar no mapa</span></Link>
            </div>
            <div role="group" aria-label="Período" className={styles.chipRow}>
              {periods.map(item => <button key={item.value} type="button" aria-pressed={period === item.value} onClick={() => setPeriod(item.value)} className={`${pill} ${period === item.value ? pillActive : pillIdle}`}>{item.value !== "todos" && <CalendarDays className="h-4 w-4" aria-hidden="true" />}{item.label}</button>)}
            </div>
            {categories.length > 0 && <div role="group" aria-label="Categorias" className={styles.chipRow}>
              <button type="button" aria-pressed={!discovery.category} onClick={() => clearDiscovery({ category: "" })} className={`${pill} ${!discovery.category ? categoryActive : pillIdle}`}><LayoutGrid className="h-4 w-4" aria-hidden="true" />Todas</button>
              {categories.map(category => { const { icon: Icon } = categoryVisual(category); const active = discovery.category === category; return <button key={category} type="button" aria-pressed={active} onClick={() => clearDiscovery({ category: active ? "" : category })} className={`${pill} font-medium ${active ? categoryActive : pillIdle}`}><Icon className="h-4 w-4" aria-hidden="true" />{category}</button>; })}
            </div>}
            <div className="flex w-full flex-wrap items-center gap-2">
              <div className="contents sm:block sm:w-full"><PublicEventFilters compact events={events} value={discovery} onChange={setDiscovery} /></div>
              <ViewModeToggle mode={viewMode} onChange={setViewMode} className="ml-auto sm:hidden" />
            </div>
          </div>
          <div className="mt-6 w-full sm:mt-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 sm:mb-5">
              <p role="status" aria-live="polite" className="text-sm text-muted-foreground"><strong className="text-base font-bold tabular-nums text-foreground">{publicResultCount}</strong> {resultLabel}{hasActiveFilters && publishedEvents.length > publicResultCount ? ` de ${publishedEvents.length}` : ""}</p>
              <ViewModeToggle mode={viewMode} onChange={setViewMode} className="max-sm:hidden" />
            </div>
            {appliedChips.length > 0 && <ul aria-label="Filtros aplicados" className={`${styles.chipRow} mb-5`}>
              {appliedChips.map(chip => <li key={chip.key}><button type="button" onClick={chip.clear} aria-label={`Remover filtro ${chip.label}`} className={`${pill} gap-1.5 border-cta-foreground/10 bg-cta/20 pl-4 pr-3 text-xs text-foreground hover:bg-cta/30 dark:bg-cta/10`}>{chip.label}<X className="h-3.5 w-3.5" aria-hidden="true" /></button></li>)}
              <li><button type="button" onClick={clearAll} className={`${pill} border-transparent px-3 text-xs text-brand underline-offset-4 hover:underline`}>Limpar tudo</button></li>
            </ul>}
            {publicResultCount === 0 ? <div className="flex flex-col items-center rounded-[22px] border border-dashed border-border bg-card px-6 py-12 text-center shadow-[var(--em-shadow-card)]">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cta/25 text-foreground"><CalendarDays className="h-6 w-6" aria-hidden="true" /></span>
              <h2 className="mt-4 text-xl font-semibold tracking-tight">{publishedEvents.length === 0 ? "Ainda não há eventos publicados" : "Nenhum evento encontrado"}</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{publishedEvents.length === 0 ? "Assim que novos eventos forem publicados, eles aparecem aqui automaticamente." : "Experimente outra busca, período ou categoria."}</p>
              {hasActiveFilters ? <Button type="button" onClick={clearAll} className="mt-5 min-h-11 rounded-full bg-cta px-5 text-cta-foreground hover:bg-cta/90">Limpar filtros</Button> : <Button asChild variant="outline" className="mt-5 min-h-11 rounded-full"><Link href="/#home-discovery"><MapPin className="h-4 w-4" aria-hidden="true" />Explorar no mapa</Link></Button>}
            </div> : <TableEventsClient role={user?.role ?? ""} events={filteredEvents} adminId={user?.id ?? ""} mode={viewMode} onModeChange={setViewMode} />}
          </div>
        </>
      )}
    </div>
  );
}
