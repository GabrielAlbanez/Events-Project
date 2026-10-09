"use client";

import PublicEventFilters, { DiscoveryFilter, emptyDiscoveryFilter, filterDiscovery } from "@/components/MyComponents/PublicEventFilters";
import { useSocket } from "@/context/SocketContext";
import Mapa from "@/components/MyComponents/Map";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Evento } from "@/types";
import { CalendarDays, ChevronDown, Compass, MapPin, Search, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { BrandLogo } from "@/components/MyComponents/BrandLogo";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { matchesPeriod, parseEventDate, type DiscoveryPeriod as Period } from "@/lib/discoveryPeriod";
import styles from "./discovery.module.css";
import { HomePresentation } from "@/components/MyComponents/home/HomePresentation";
import { FadeInView } from "@/components/animations/FadeInView";
import { StaggerList } from "@/components/animations/StaggerList";
import { InteractiveSurface } from "@/components/animations/InteractiveSurface";
import { ParallaxCard } from "@/components/animations/ParallaxCard";
import { LoadingShimmer } from "@/components/animations/LoadingShimmer";

const filters: { label: string; value: Period }[] = [
  { label: "Todos", value: "todos" },
  { label: "Hoje", value: "hoje" },
  { label: "Fim de semana", value: "fim-de-semana" },
  { label: "Este mês", value: "mes" },
];

export default function Home() {
  const socket = useSocket();
  const homeScrollContainer = useRef<HTMLDivElement>(null);
  const { data: session, status } = useSession();
  const canManageEvents = status === "authenticated" && Boolean(session?.user?.id) &&
    (session?.user?.role === "ADMIN" || session?.user?.role === "PROMOTER");
  const [discovery, setDiscovery] = useState<DiscoveryFilter>(emptyDiscoveryFilter);
  const [events, setEvents] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<Period>("todos");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const sheetToggle = useRef<HTMLButtonElement>(null);
  const touchStart = useRef<number | null>(null);
  const [retry, setRetry] = useState(0);
  const [urlReady, setUrlReady] = useState(false);

  useEffect(() => {
    const restore = () => {
      const query = new URLSearchParams(window.location.search);
      setSearch((query.get("q") || "").slice(0, 100));
      const requested = query.get("periodo");
      setPeriod(requested === "hoje" || requested === "fim-de-semana" || requested === "mes" ? requested : "todos");
      const price = query.get("preco") || "";
      setDiscovery({ ...emptyDiscoveryFilter, category: (query.get("categoria") || "").slice(0, 50), free: query.get("gratis") === "1",
        maxPrice: /^\d{1,6}(?:\.\d{1,2})?$/.test(price) ? price : "" });
      setUrlReady(true);
    };
    restore(); window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    if (!urlReady) return;
    const timer = window.setTimeout(() => {
      const url = new URL(window.location.href);
      const entries = { q: search, periodo: period === "todos" ? "" : period, categoria: discovery.category, gratis: discovery.free ? "1" : "", preco: discovery.maxPrice };
      Object.entries(entries).forEach(([key, value]) => { if (value) url.searchParams.set(key, value); else url.searchParams.delete(key); });
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [urlReady, search, period, discovery.category, discovery.free, discovery.maxPrice]);

  useEffect(() => {
    const controller = new AbortController();
    let generation = 0;
    const refresh = () => { const request = ++generation; void fetch("/api/AllEvents", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Falha ao carregar eventos");
        return response.json();
      })
      .then((data: Evento[]) => { if (request !== generation || controller.signal.aborted) return; if (!Array.isArray(data)) throw new Error("Resposta inválida"); setLoadError(false); setEvents(data.filter((event) => event.validate && event.status !== "CANCELLED")); })
      .catch(() => { if (!controller.signal.aborted && request === generation) setLoadError(true); })
      .finally(() => { if (!controller.signal.aborted && request === generation) setLoading(false); }); };
    refresh();
    socket.on("update-events", refresh);
    socket.on("connect", refresh);
    return () => { controller.abort(); socket.off("update-events", refresh); socket.off("connect", refresh); };
  }, [socket, retry]);

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return filterDiscovery(events, discovery).filter((event) => matchesPeriod(event, period) &&
      (!query || `${event.nome} ${event.descricao} ${event.endereco}`.toLocaleLowerCase("pt-BR").includes(query)));
  }, [events, period, search, discovery]);

  const hasActiveFilters = Boolean(search || period !== "todos" || discovery.category || discovery.free || discovery.maxPrice || discovery.radius || discovery.travelMinutes !== null);

  return (
    <div className={`${styles.shell} flex min-h-0 flex-col bg-background text-foreground`}>
      <header className="z-30 flex h-[72px] shrink-0 items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur-xl md:px-7">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="h-10 w-10 rounded-xl border border-border" />
          <Link href="/" className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
            <BrandLogo priority />
          </Link>
        </div>
        <nav aria-label="Navegação principal" className="hidden items-center gap-1 rounded-full border border-border bg-muted p-1 text-sm xl:flex">
          <Link href="/" aria-current="page" className="inline-flex min-h-11 items-center rounded-full bg-card px-4 py-2 font-semibold text-primary shadow-sm">Descobrir</Link>
          <Link href="/EventsCreated" className="inline-flex min-h-11 items-center rounded-full px-4 py-2 text-muted-foreground transition hover:text-primary">Agenda</Link>
          {canManageEvents && <Link href="/myEvents" className="inline-flex min-h-11 items-center rounded-full px-4 py-2 text-muted-foreground transition hover:text-primary">Meus eventos</Link>}
        </nav>
        <Link href="/EventsCreated" className="flex items-center gap-2 min-h-11 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><Compass className="h-4 w-4" /><span className="hidden sm:inline">Explorar agenda</span><span className="sm:hidden">Agenda</span></Link>
      </header>

      <div ref={homeScrollContainer} className={styles.scroller}>
      <HomePresentation events={events} loading={loading} loadError={loadError} scrollContainer={homeScrollContainer} />
      <main id="home-discovery" tabIndex={-1} aria-label="Explorar eventos no mapa" className={`${styles.main} ${sheetExpanded ? styles.mainExpanded : ""} relative min-h-0 flex-1 md:min-h-[520px] md:grid md:grid-cols-[minmax(340px,410px)_minmax(0,1fr)]`}>
        <section className={`${styles.sheet} absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden rounded-t-[1.75rem] border-t border-border bg-card shadow-sheet transition-[height] duration-300 md:relative md:inset-auto md:rounded-none md:border-r md:border-t-0 md:shadow-none`} onKeyDown={(event) => { if (event.key === "Escape" && sheetExpanded && window.matchMedia("(max-width: 767px)").matches) { setSheetExpanded(false); sheetToggle.current?.focus(); } }}>
          <button ref={sheetToggle} type="button" aria-expanded={sheetExpanded} aria-controls="discovery-panel-content" aria-label={sheetExpanded ? "Recolher busca e lista de eventos" : "Expandir busca, filtros e lista de eventos"} onClick={() => setSheetExpanded((value) => !value)} onTouchStart={(event) => { touchStart.current = event.touches[0].clientY; }} onTouchCancel={() => { touchStart.current = null; }} onTouchEnd={(event) => { if (touchStart.current !== null) { const delta = event.changedTouches[0].clientY - touchStart.current; if (Math.abs(delta) > 55) setSheetExpanded(delta < 0); touchStart.current = null; } }} className={`${styles.sheetToggle} shrink-0 touch-none px-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:hidden`}>
            <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 rounded-full bg-muted-foreground/30" />
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Search className="h-4 w-4" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{sheetExpanded ? "Explorar eventos" : "O que acontece por perto?"}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{loading ? "Carregando eventos…" : loadError ? "Falha ao atualizar · toque para tentar novamente" : `${filteredEvents.length} evento${filteredEvents.length === 1 ? "" : "s"}${hasActiveFilters ? " · filtros ativos" : " · buscar e filtrar"}`}</span></span>
              <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${sheetExpanded ? "" : "rotate-180"}`} />
            </span>
          </button>
          <div id="discovery-panel-content" className={`${styles.sheetContent} ${sheetExpanded ? styles.sheetContentExpanded : ""} min-h-0 flex-1 flex-col overflow-y-auto`}>
          <div className="px-5 pb-4 pt-2 md:px-7 md:pt-8">
            <div className="relative isolate">
              <ParallaxCard
                pointerHost="parent"
                mobileScroll
                className="pointer-events-none absolute -inset-x-3 -inset-y-2 -z-10 overflow-hidden rounded-3xl"
                decorationClassName="absolute inset-0"
                secondaryClassName="absolute inset-0"
                secondaryDecoration={<>
                  <span className="absolute -right-8 -top-12 h-40 w-40 rounded-full border border-border" />
                  <span className="absolute -right-2 -top-6 h-28 w-28 rounded-full border border-border bg-muted/20" />
                  <span className="absolute -bottom-12 right-8 h-32 w-32 rounded-full bg-decoration-brand" />
                </>}
              >
                <span className="absolute -left-10 -top-12 h-44 w-44 rounded-full bg-decoration-brand" />
                <span className="absolute -left-8 -top-10 h-36 w-36 rounded-full border border-border" />
              </ParallaxCard>
            <FadeInView>
            <div className="mb-3 hidden items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-muted-foreground md:flex"><Sparkles className="h-4 w-4" /> Descubra por perto</div>
            <h2 className="text-2xl font-bold tracking-tight md:text-[2rem]">Encontre seu próximo evento</h2>
            <p className="mt-1 hidden text-sm leading-6 text-muted-foreground md:block">Explore a agenda e escolha o que combina com você.</p>
            </FadeInView>
            </div>
            <FadeInView stationary>
            <label className="mt-4 flex h-12 items-center gap-3 rounded-2xl border border-border bg-muted px-4 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar evento ou lugar" aria-label="Buscar evento ou lugar" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
              {search && <button type="button" onClick={() => setSearch("")} aria-label="Limpar busca" className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="h-4 w-4 text-muted-foreground" /></button>}
            </label>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
              {filters.map((filter) => <button key={filter.value} type="button" onClick={() => setPeriod(filter.value)} aria-pressed={period === filter.value} className={`min-h-11 shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${period === filter.value ? "bg-primary text-primary-foreground shadow-highlight" : "border border-border bg-card text-muted-foreground hover:border-primary/30   "}`}>{filter.label}</button>)}
            </div>
            </FadeInView>
          </div>
          <FadeInView stationary className="shrink-0 px-4 pb-3"><PublicEventFilters events={events} value={discovery} onChange={setDiscovery} onOpen={() => setSheetExpanded(true)} /></FadeInView>
          <div className="flex min-h-0 flex-1 flex-col border-t border-border">
            <div className="flex items-center justify-between px-5 py-4 md:px-7"><h2 className="text-sm font-semibold">Eventos próximos</h2><span className="text-xs text-muted-foreground">{filteredEvents.length} encontrados</span></div>
            <div className="flex-1 space-y-2 px-4 pb-6 md:px-5">
              {loading && <div role="status" className="space-y-2"><span className="sr-only">Carregando eventos…</span>{[0, 1, 2].map((item) => <div key={item} aria-hidden="true" className="relative flex gap-3 overflow-hidden rounded-2xl border border-border bg-card p-3"><div className="h-[84px] w-[84px] shrink-0 rounded-xl bg-muted" /><div className="flex min-w-0 flex-1 flex-col justify-center gap-3"><div className="h-2.5 w-20 rounded bg-muted" /><div className="h-3.5 w-4/5 rounded bg-muted" /><div className="h-3 w-3/5 rounded bg-muted" /></div><LoadingShimmer className="pointer-events-none absolute inset-0 h-full w-full text-muted-foreground/20" /></div>)}</div>}
              {loadError && <div role="alert" className="rounded-2xl border border-border bg-muted/40 p-5 text-sm leading-6 text-muted-foreground"><p>{events.length ? "Não foi possível atualizar. Os eventos exibidos podem estar desatualizados." : "Não foi possível carregar os eventos."}</p><button type="button" onClick={() => { setLoading(true); setRetry(count => count + 1); }} className="mt-3 min-h-11 rounded-xl border px-4 font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Tentar novamente</button></div>}
              {!loading && !loadError && filteredEvents.length === 0 && <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-8 text-center"><CalendarDays className="mx-auto mb-3 h-6 w-6 text-primary" /><p className="text-sm font-medium">Nenhum evento encontrado</p><p className="mt-1 text-xs text-muted-foreground">Experimente outra busca ou período.</p></div>}
              <StaggerList className="space-y-2">{filteredEvents.map((event) => <InteractiveSurface key={event.id}><button type="button" onMouseEnter={() => setHighlightedId(event.id)} onMouseLeave={() => setHighlightedId(null)} onFocus={() => setHighlightedId(event.id)} onBlur={() => setHighlightedId(null)} onClick={() => { setSelectedId(event.id); setHighlightedId(null); setSheetExpanded(false); if (window.matchMedia("(max-width: 767px)").matches) sheetToggle.current?.focus(); }} className={`${styles.eventCard} group flex w-full gap-3 rounded-2xl border p-3 text-left transition hover:shadow-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${selectedId === event.id ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:border-primary/30  "}`}>
                <div className="relative h-[84px] w-[84px] shrink-0 overflow-hidden rounded-xl bg-primary/10">{event.banner ? <img src={event.banner} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-primary"><CalendarDays className="h-6 w-6" aria-hidden="true" /><span className="text-[10px] font-semibold">EventMap</span></div>}</div>
                <div className="min-w-0 flex-1 py-0.5"><span className="block text-[11px] font-semibold leading-4 text-primary">{parseEventDate(event.dataInicio) ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(parseEventDate(event.dataInicio)!) : "Data a confirmar"}</span><h3 className="mt-1.5 line-clamp-2 text-sm font-semibold leading-5 tracking-tight">{event.nome}</h3><p className="mt-2 flex items-center gap-1.5 truncate text-xs leading-4 text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" />{event.endereco}</p></div>
              </button></InteractiveSurface>)}</StaggerList>
            </div>
          </div>
          </div>
        </section>
        <section className={`${sheetExpanded ? styles.mapExpanded : styles.map} relative overflow-hidden bg-muted transition-[height] duration-300 `} aria-label="Mapa dos eventos">
          <Mapa events={filteredEvents} selectedId={selectedId} highlightedId={highlightedId} onSelectEvent={setSelectedId} />
        </section>
      </main>
      </div>
    </div>
  );
}
