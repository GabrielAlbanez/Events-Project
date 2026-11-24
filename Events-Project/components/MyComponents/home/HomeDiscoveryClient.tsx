"use client";

import PublicEventFilters, { DiscoveryFilter, emptyDiscoveryFilter, filterDiscovery } from "@/components/MyComponents/PublicEventFilters";
import { useSocket } from "@/context/SocketContext";
import Mapa from "@/components/MyComponents/Map";
import { useGoogleMaps } from "@/components/MyComponents/GoogleMapsLoader";
import { LocationPicker } from "@/components/MyComponents/home/LocationPicker";
import { requestBrowserPosition } from "@/lib/geolocationHelp";
import { Evento } from "@/types";
import { ArrowRight, CalendarDays, ChevronDown, ChevronRight, LayoutGrid, List, MapPin, Map as MapIcon, Search, Star, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { matchesPeriod, type DiscoveryPeriod as Period } from "@/lib/discoveryPeriod";
import styles from "@/app/discovery.module.css";
import { LuxuryHomePresentation } from "@/components/MyComponents/home/LuxuryHomePresentation";
import { LoadingShimmer } from "@/components/animations/LoadingShimmer";
import { HomeEventImage } from "@/components/MyComponents/home/HomeEventImage";
import { DayMonthBlock, FeaturedTag, categoryVisual, eventCity, resolveCity } from "@/components/MyComponents/home/discoveryVisuals";
import { prioritizeFeatured } from "@/lib/promotions";

const filters: { label: string; value: Period }[] = [
  { label: "Todos", value: "todos" },
  { label: "Hoje", value: "hoje" },
  { label: "Fim de semana", value: "fim-de-semana" },
  { label: "Este mês", value: "mes" },
];

/** Same visibility rule the realtime refresh applies to `/api/AllEvents` replies. */
function visibleHomeEvents(events: Evento[]): Evento[] {
  return events.filter((event) => event.validate && event.status !== "CANCELLED");
}

type HomeDiscoveryClientProps = {
  /** Published catalog rendered on the server (null when the server could not load it in time). */
  initialEvents: Evento[] | null;
};

/**
 * Client side of the home: discovery filters, list, map and realtime refresh.
 * With server data the first paint already lists events (SEO/LCP); the socket effect
 * still revalidates on mount so nothing published between render and hydration is missed.
 */
export default function HomeDiscoveryClient({ initialEvents }: HomeDiscoveryClientProps) {
  const socket = useSocket();
  const homeScrollContainer = useRef<HTMLDivElement>(null);
  const [discovery, setDiscovery] = useState<DiscoveryFilter>(emptyDiscoveryFilter);
  const [events, setEvents] = useState<Evento[]>(() => initialEvents ? visibleHomeEvents(initialEvents) : []);
  const [loading, setLoading] = useState(initialEvents === null);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<Period>("todos");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const sheetToggle = useRef<HTMLButtonElement>(null);
  const touchStart = useRef<number | null>(null);
  const listScroll = useRef<HTMLDivElement>(null);
  /** Id picked on the map (not in the list): only those selections scroll the list. */
  const mapSelection = useRef<string | null>(null);
  const [retry, setRetry] = useState(0);
  /** Desktop only: the map area can switch to a card grid. On mobile "Lista" expands the bottom sheet instead. */
  const [view, setView] = useState<"mapa" | "lista">("mapa");
  const [compact, setCompact] = useState(false);
  const [city, setCity] = useState("");
  // Visitor's own location for "Sua localização": React state only (never storage, URL, server or logs).
  const [userPlace, setUserPlace] = useState<{ label: string | null } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const locationRequest = useRef(0);
  const { isLoaded: mapsLoaded, enabled: mapsEnabled, configured: mapsConfigured, enableMaps } = useGoogleMaps();
  const [showAllCategories, setShowAllCategories] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const sync = () => setCompact(query.matches);
    sync(); query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  const [urlReady, setUrlReady] = useState(false);
  useEffect(() => {
    const restore = () => {
      const query = new URLSearchParams(window.location.search);
      setSearch((query.get("q") || "").slice(0, 100));
      const requested = query.get("periodo");
      setPeriod(requested === "hoje" || requested === "fim-de-semana" || requested === "mes" ? requested : "todos");
      const price = query.get("preco") || "";
      setDiscovery({ ...emptyDiscoveryFilter, category: (query.get("categoria") || "").slice(0, 80), free: query.get("gratis") === "1",
        maxPrice: /^\d{1,6}(?:\.\d{1,2})?$/.test(price) ? price : "" });
      setUrlReady(true);
    };
    restore(); window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const periodLinks = filters.filter(filter => filter.value !== "todos").map(filter => {
    const query = new URLSearchParams();
    const entries = { q: search, periodo: filter.value, categoria: discovery.category, gratis: discovery.free ? "1" : "", preco: discovery.maxPrice };
    Object.entries(entries).forEach(([key, value]) => { if (value) query.set(key, value); });
    return { ...filter, href: `?${query.toString()}#home-discovery` };
  });

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

  useEffect(() => {
    if (!urlReady) return;
    let frame = 0;
    const openDiscovery = (event?: Event) => {
      const container = homeScrollContainer.current;
      const target = document.getElementById("home-discovery");
      if (!container || !target) return;
      const focusSearch = event ? Boolean((event as CustomEvent<{ focusSearch?: boolean }>).detail?.focusSearch) : window.location.hash === "#home-discovery-search";
      if (window.matchMedia("(max-width: 767px)").matches) setSheetExpanded(focusSearch);
      const top = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 16;
      container.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      frame = window.requestAnimationFrame(() => (focusSearch ? document.getElementById("home-discovery-search") : target)?.focus({ preventScroll: true }));
    };
    const openHome = () => homeScrollContainer.current?.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    window.addEventListener("eventmap:discovery", openDiscovery);
    window.addEventListener("eventmap:home", openHome);
    if (["#home-discovery", "#home-discovery-search"].includes(window.location.hash)) openDiscovery();
    return () => { window.removeEventListener("eventmap:discovery", openDiscovery); window.removeEventListener("eventmap:home", openHome); window.cancelAnimationFrame(frame); };
  }, [urlReady]);

  /** Raw city names first, then venue-prefixed names ("Arena Campinas, SP") folded into a known city. */
  const cityOf = useMemo(() => {
    const known = new Set(events.map((event) => eventCity(event.endereco)).filter((name): name is string => Boolean(name)));
    return (address: string | null | undefined) => resolveCity(eventCity(address), known);
  }, [events]);
  const filteredEvents = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return filterDiscovery(events, discovery).filter((event) => matchesPeriod(event, period) && (!city || cityOf(event.endereco) === city) &&
      (!query || `${event.nome} ${event.descricao} ${event.endereco}`.toLocaleLowerCase("pt-BR").includes(query)));
  }, [events, period, search, discovery, city, cityOf]);
  // With an origin, nearest first (events without coordinates last); paid highlights still lead.
  const listedEvents = useMemo(() => {
    const origin = discovery.origin;
    if (!origin) return prioritizeFeatured(filteredEvents);
    const distance = (event: Evento) => event.lat == null || event.lng == null ? Number.POSITIVE_INFINITY
      : (event.lat - origin.lat) ** 2 + ((event.lng - origin.lng) * Math.cos(origin.lat * Math.PI / 180)) ** 2;
    return prioritizeFeatured([...filteredEvents].sort((a, b) => distance(a) - distance(b)));
  }, [filteredEvents, discovery.origin]);

  /** "Bairro, Cidade - UF" from a reverse geocode; null when Google gives nothing usable. */
  const shortAddress = useCallback(async (location: { lat: number; lng: number }): Promise<string | null> => {
    try {
      const { results } = await new google.maps.Geocoder().geocode({ location });
      const parts = results?.[0]?.address_components ?? [];
      const pick = (type: string, short = false) => { const part = results.flatMap((result) => result.address_components).find((component) => component.types.includes(type)); return part ? (short ? part.short_name : part.long_name) : null; };
      const district = pick("sublocality_level_1") ?? pick("sublocality") ?? pick("neighborhood");
      const cityName = pick("administrative_area_level_2") ?? pick("locality");
      const uf = pick("administrative_area_level_1", true);
      if (!parts.length || (!district && !cityName)) return null;
      const place = cityName ? (uf ? `${cityName} - ${uf}` : cityName) : uf;
      return [district, place].filter(Boolean).join(", ") || null;
    } catch {
      return null;
    }
  }, []);

  const locateMe = useCallback(async () => {
    const request = ++locationRequest.current;
    setLocating(true);
    setLocationError(null);
    try {
      const origin = await requestBrowserPosition();
      if (request !== locationRequest.current) return;
      setCity("");
      setDiscovery((current) => ({ ...current, origin, travelMinutes: null, travelDurations: {} }));
      const label = mapsLoaded && window.google?.maps ? await shortAddress(origin) : null;
      if (request !== locationRequest.current) return;
      setUserPlace({ label });
    } catch (error) {
      if (request !== locationRequest.current) return;
      setLocationError(error instanceof Error ? error.message : "Não foi possível obter a localização.");
    } finally {
      if (request === locationRequest.current) setLocating(false);
    }
  }, [mapsLoaded, shortAddress]);

  const clearMyLocation = useCallback(() => {
    locationRequest.current++;
    setLocating(false);
    setLocationError(null);
    setUserPlace(null);
    setDiscovery((current) => ({ ...current, origin: null, radius: "", travelMinutes: null, travelDurations: {} }));
  }, []);

  const pickCity = useCallback((name: string) => {
    if (userPlace) clearMyLocation();
    setLocationError(null);
    setCity(name);
  }, [userPlace, clearMyLocation]);

  // Origin removed elsewhere ("Limpar filtros"): the trigger goes back to the city choice.
  useEffect(() => { if (!discovery.origin && userPlace) setUserPlace(null); }, [discovery.origin, userPlace]);
  // The map was enabled after locating: now the address can be resolved (still only in memory).
  useEffect(() => {
    const origin = discovery.origin;
    if (!mapsLoaded || !origin || !userPlace || userPlace.label !== null || !window.google?.maps) return;
    let cancelled = false;
    void shortAddress(origin).then((label) => { if (!cancelled && label) setUserPlace({ label }); });
    return () => { cancelled = true; };
  }, [mapsLoaded, discovery.origin, userPlace, shortAddress]);
  const hasFeatured = listedEvents.some((event) => event.featured);
  /** Cities parsed from the published addresses, most frequent first (a display/filter hint, never geocoded). */
  const cities = useMemo(() => {
    const counts = new Map<string, number>();
    events.forEach((event) => { const name = cityOf(event.endereco); if (name) counts.set(name, (counts.get(name) ?? 0) + 1); });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR")).map(([name]) => name);
  }, [events, cityOf]);
  /** Real categories present in the catalog, most frequent first. */
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    events.forEach((event) => { if (event.category) counts.set(event.category, (counts.get(event.category) ?? 0) + 1); });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR")).map(([name]) => name);
  }, [events]);
  const pickCategory = (category: string) => setDiscovery((current) => ({ ...current, category: current.category === category ? "" : category, travelMinutes: null, travelDurations: {} }));
  const listActive = compact ? sheetExpanded : view === "lista";
  const chooseView = (next: "mapa" | "lista") => {
    if (window.matchMedia("(max-width: 767px)").matches) { setSheetExpanded(next === "lista"); setView("mapa"); }
    else setView(next);
  };
  const selectFromList = (id: string) => { setSelectedId(id); setHighlightedId(null); setSheetExpanded(false); setView("mapa"); if (window.matchMedia("(max-width: 767px)").matches) sheetToggle.current?.focus(); };

  const handleMapSelect = useCallback((id: string | null) => { mapSelection.current = id; setSelectedId(id); }, []);

  // Pin -> list: bring the event picked on the map into view inside the list panel (desktop only, focus stays put).
  useEffect(() => {
    const id = mapSelection.current;
    mapSelection.current = null;
    if (!id || id !== selectedId || !window.matchMedia("(min-width: 768px)").matches) return;
    const container = listScroll.current;
    const item = container?.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(id)}"]`);
    if (!container || !item) return;
    const bounds = container.getBoundingClientRect();
    const rect = item.getBoundingClientRect();
    const offset = rect.top < bounds.top ? rect.top - bounds.top - 12 : rect.bottom > bounds.bottom ? rect.bottom - bounds.bottom + 12 : 0;
    if (offset) container.scrollBy({ top: offset, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [selectedId]);

  const hasActiveFilters = Boolean(city || search || period !== "todos" || discovery.category || discovery.free || discovery.maxPrice || discovery.radius || discovery.travelMinutes !== null);

  const handleQuickSearch = ({ location, period: selectedPeriod, category }: { location: string; period: Period; category: string }) => {
    const query = location.trim().slice(0, 100);
    const selectedCategory = category.slice(0, 80);
    setSearch(query);
    setPeriod(selectedPeriod);
    setDiscovery(current => ({ ...current, category: selectedCategory }));
    if (window.matchMedia("(max-width: 767px)").matches) setSheetExpanded(true);
    const url = new URL(window.location.href);
    const entries = { q: query, periodo: selectedPeriod === "todos" ? "" : selectedPeriod, categoria: selectedCategory };
    Object.entries(entries).forEach(([key, value]) => { if (value) url.searchParams.set(key, value); else url.searchParams.delete(key); });
    url.hash = "home-discovery";
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    const container = homeScrollContainer.current;
    const target = document.getElementById("home-discovery");
    if (!container || !target || !container.contains(target)) return;
    const top = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 16;
    container.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    target.focus({ preventScroll: true });
  };

  return (
    <div className={`${styles.shell} flex min-h-0 flex-col bg-background text-foreground`}>


      <div ref={homeScrollContainer} className={styles.scroller}>
      <LuxuryHomePresentation events={events} loading={loading} loadError={loadError} scrollContainer={homeScrollContainer} period={period} periodLinks={periodLinks} onPeriodChange={setPeriod} onQuickSearch={handleQuickSearch} searchValue={search} categoryValue={discovery.category} />
      <section id="home-discovery" tabIndex={-1} aria-label="Explorar eventos no mapa" className={`${styles.main} ${sheetExpanded ? styles.mainExpanded : ""} relative min-h-0 flex-1 md:min-h-[520px] md:grid md:grid-cols-[minmax(340px,400px)_minmax(0,1fr)] lg:grid-cols-[minmax(400px,480px)_minmax(0,1fr)]`}>
        <section className={`${styles.sheet} absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden rounded-t-[1.75rem] border-t border-border bg-card shadow-sheet md:relative md:inset-auto md:z-30 md:rounded-r-[2rem] md:rounded-tl-none md:border-r md:border-t-0 md:shadow-[18px_0_48px_-28px_hsl(var(--foreground)/0.28)]`} onKeyDown={(event) => { if (event.key === "Escape" && sheetExpanded && window.matchMedia("(max-width: 767px)").matches) { setSheetExpanded(false); sheetToggle.current?.focus(); } }}>
          <button ref={sheetToggle} type="button" aria-expanded={sheetExpanded} aria-controls="discovery-panel-content" aria-label={sheetExpanded ? "Recolher busca e lista de eventos" : "Expandir busca, filtros e lista de eventos"} onClick={() => setSheetExpanded((value) => !value)} onTouchStart={(event) => { touchStart.current = event.touches[0].clientY; }} onTouchCancel={() => { touchStart.current = null; }} onTouchEnd={(event) => { if (touchStart.current !== null) { const delta = event.changedTouches[0].clientY - touchStart.current; if (Math.abs(delta) > 55) setSheetExpanded(delta < 0); touchStart.current = null; } }} className={`${styles.sheetToggle} shrink-0 touch-none px-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:hidden`}>
            <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 rounded-full bg-muted-foreground/30" />
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Search className="h-4 w-4" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{sheetExpanded ? "Explorar eventos" : "O que acontece por perto?"}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{loading ? "Carregando eventos…" : loadError ? "Falha ao atualizar · toque para tentar novamente" : `${filteredEvents.length} evento${filteredEvents.length === 1 ? "" : "s"}${hasActiveFilters ? " · filtros ativos" : " · buscar e filtrar"}`}</span></span>
              <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${sheetExpanded ? "" : "rotate-180"}`} />
            </span>
          </button>
          <div ref={listScroll} id="discovery-panel-content" className={`${styles.sheetContent} ${sheetExpanded ? styles.sheetContentExpanded : ""} min-h-0 flex-1 flex-col overflow-y-auto`}>
          <div className="relative isolate px-5 pb-4 pt-2 md:px-8 md:pt-7">
            <svg aria-hidden="true" viewBox="0 0 160 120" fill="none" className="pointer-events-none absolute -left-10 -top-14 -z-10 hidden h-32 w-44 text-cta md:block"><path d="M4 112C30 58 78 22 156 8" stroke="currentColor" strokeWidth="10" strokeLinecap="round" opacity=".55" /></svg>
            <div className="relative flex items-start justify-between gap-3">
              <LocationPicker
                cities={cities}
                city={city}
                userLabel={userPlace ? userPlace.label ?? "Perto de você" : null}
                locating={locating}
                error={locationError}
                showEnableMaps={Boolean(userPlace && userPlace.label === null && !mapsEnabled && mapsConfigured)}
                onEnableMaps={enableMaps}
                onCity={pickCity}
                onUseLocation={() => void locateMe()}
                onClear={clearMyLocation}
              />
              <span className="mt-2 inline-flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${loadError ? "bg-amber-500" : "bg-emerald-500"}`} />
                {loadError ? "Atualização pendente" : discovery.origin ? "Perto de você" : "Eventos por perto"}
              </span>
            </div>
            <h2 className="mt-4 text-[1.75rem] font-bold leading-[1.1] tracking-tight md:mt-6 md:text-[2.5rem]">
              Escolha como viver a{" "}
              <span className="relative inline-block text-[#4E7A00] dark:text-cta">cidade<svg aria-hidden="true" viewBox="0 0 140 14" preserveAspectRatio="none" className="absolute -bottom-2 left-0 h-3 w-full text-cta"><path d="M3 9C34 4 70 3 137 6M10 12c30-3 62-4 104-3" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" fill="none" /></svg></span>
            </h2>
            <p className="mt-3 hidden text-[15px] leading-6 text-muted-foreground md:block">Explore a agenda e encontre o que combina com você.</p>
            <label className="mt-5 flex h-12 items-center gap-3 rounded-2xl border border-border bg-muted/60 px-4 transition-colors focus-within:border-ring focus-within:bg-card focus-within:ring-2 focus-within:ring-ring/20 md:h-14">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input id="home-discovery-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar evento ou lugar…" aria-label="Buscar evento ou lugar" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
              {search && <button type="button" onClick={() => setSearch("")} aria-label="Limpar busca" className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="h-4 w-4 text-muted-foreground" /></button>}
            </label>
            <div role="group" aria-label="Período" className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] md:mx-0 md:px-0">
              {filters.map((filter) => <button key={filter.value} type="button" onClick={() => setPeriod(filter.value)} aria-pressed={period === filter.value} className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${period === filter.value ? "border border-cta-foreground/10 bg-cta text-cta-foreground shadow-sm" : "border border-border bg-card text-foreground/80 hover:border-primary/30"}`}>{filter.value !== "todos" && <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />}{filter.label}</button>)}
            </div>
          </div>
          {categories.length > 0 && <div className="px-5 pb-4 md:px-8">
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><LayoutGrid aria-hidden="true" className="h-4 w-4" /> Categorias populares</h3>
              {categories.length > 5 && <button type="button" aria-expanded={showAllCategories} aria-controls="discovery-categories" onClick={() => setShowAllCategories((value) => !value)} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-xs font-semibold text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{showAllCategories ? "Ver menos" : "Ver todas"} <ArrowRight aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${showAllCategories ? "-rotate-90" : ""}`} /></button>}
            </div>
            <div id="discovery-categories" role="group" aria-label="Categorias" className={`mt-2 gap-2 ${showAllCategories ? "grid grid-cols-[repeat(auto-fill,minmax(5.75rem,1fr))]" : "-mx-5 flex overflow-x-auto px-5 pb-1 [scrollbar-width:none] md:mx-0 md:px-0"}`}>
              {(showAllCategories ? categories : categories.slice(0, 5)).map((category) => {
                const { icon: Icon, tone } = categoryVisual(category);
                const active = discovery.category === category;
                return <button key={category} type="button" aria-pressed={active} onClick={() => pickCategory(category)} className={`flex min-h-[5.5rem] min-w-[5.75rem] flex-1 shrink-0 flex-col items-center justify-start gap-1.5 rounded-2xl border px-1.5 py-2.5 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card ${active ? "border-cta bg-cta/15 text-foreground ring-1 ring-cta" : "border-border bg-card text-foreground/80 hover:border-primary/30 hover:shadow-surface"}`}>
                  <span aria-hidden="true" className={`grid h-9 w-9 place-items-center rounded-full ${tone}`}><Icon className="h-[18px] w-[18px]" /></span>
                  <span className="line-clamp-2 max-w-full break-words text-center leading-[1.2]">{category}</span>
                </button>;
              })}
            </div>
          </div>}
          <div className="shrink-0 px-5 pb-3 md:px-8"><PublicEventFilters events={events} value={discovery} onChange={setDiscovery} onOpen={() => setSheetExpanded(true)} /></div>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mx-5 flex items-center justify-between border-t border-border py-4 md:mx-8"><h2 className="flex items-center gap-2 text-sm font-semibold"><Star aria-hidden="true" className="h-4 w-4" />{hasFeatured ? "Eventos em destaque" : "Próximos eventos"}</h2><span className="text-xs text-muted-foreground">{filteredEvents.length} {filteredEvents.length === 1 ? "encontrado" : "encontrados"}</span></div>
            <div className="flex-1 space-y-2 px-4 pb-6 md:px-6">
              {loading && <div role="status" className="space-y-2"><span className="sr-only">Carregando eventos…</span>{[0, 1, 2].map((item) => <div key={item} aria-hidden="true" className="relative flex gap-3 overflow-hidden rounded-2xl border border-border bg-card p-2"><div className="h-[72px] w-[104px] shrink-0 rounded-xl bg-muted" /><div className="flex min-w-0 flex-1 flex-col justify-center gap-3"><div className="h-2.5 w-20 rounded bg-muted" /><div className="h-3.5 w-4/5 rounded bg-muted" /><div className="h-3 w-3/5 rounded bg-muted" /></div><LoadingShimmer className="pointer-events-none absolute inset-0 h-full w-full text-muted-foreground/20" /></div>)}</div>}
              {loadError && <div role="alert" className="rounded-2xl border border-border bg-muted/40 p-5 text-sm leading-6 text-muted-foreground"><p>{events.length ? "Não foi possível atualizar. Os eventos exibidos podem estar desatualizados." : "Não foi possível carregar os eventos."}</p><button type="button" onClick={() => { setLoading(true); setRetry(count => count + 1); }} className="mt-3 min-h-11 rounded-xl border px-4 font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Tentar novamente</button></div>}
              {!loading && !loadError && filteredEvents.length === 0 && <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-8 text-center"><CalendarDays className="mx-auto mb-3 h-6 w-6 text-primary" /><p className="text-sm font-medium">Nenhum evento encontrado</p><p className="mt-1 text-xs text-muted-foreground">Experimente outra busca, cidade ou período.</p></div>}
              <div className="space-y-2">{listedEvents.map((event, index) => <button key={event.id} type="button" data-event-id={event.id} onMouseEnter={() => setHighlightedId(event.id)} onMouseLeave={() => setHighlightedId(null)} aria-pressed={selectedId === event.id} onFocus={() => setHighlightedId(event.id)} onBlur={() => setHighlightedId(null)} onClick={() => selectFromList(event.id)} className={`${styles.eventCard} group flex w-full items-center gap-3 rounded-2xl border p-2 pr-3 text-left transition-colors hover:shadow-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${selectedId === event.id ? "border-cta bg-card shadow-surface ring-2 ring-cta" : highlightedId === event.id ? "border-primary/40 bg-card shadow-surface ring-1 ring-primary/30" : "border-transparent bg-card hover:border-border"}`}>
                <div className="relative h-[72px] w-[96px] shrink-0 overflow-hidden rounded-xl bg-primary/10 lg:w-[120px]"><HomeEventImage banner={event.banner} category={event.category} index={index} sizes="120px" className="object-cover" />{event.featured && <FeaturedTag className="absolute left-1.5 top-1.5" />}</div>
                <DayMonthBlock date={event.dataInicio} />
                <div className="min-w-0 flex-1 py-0.5"><h3 className="line-clamp-2 text-sm font-semibold leading-5 tracking-tight">{event.nome}</h3><p className="mt-1 flex items-center gap-1.5 text-xs leading-4 text-muted-foreground"><MapPin aria-hidden="true" className="h-3 w-3 shrink-0" /><span className="truncate">{event.endereco || "Local a confirmar"}</span></p></div>
                <span aria-hidden="true" className="hidden h-8 w-8 shrink-0 place-items-center rounded-full border border-border text-brand transition-colors group-hover:border-primary/40 group-hover:bg-primary/5 sm:grid"><ChevronRight className="h-4 w-4" /></span>
              </button>)}</div>
            </div>
          </div>
          </div>
        </section>
        <section className={`${sheetExpanded ? styles.mapExpanded : styles.map} relative isolate overflow-hidden bg-muted md:-ml-8`} aria-label="Mapa dos eventos">
          <div role="group" aria-label="Modo de visualização" className="absolute left-3 top-3 z-40 flex rounded-full border border-border bg-card/95 p-1 shadow-surface backdrop-blur md:left-12 md:top-5">
            {([["mapa", "Mapa", MapIcon], ["lista", "Lista", List]] as const).map(([value, label, Icon]) => {
              const active = value === "lista" ? listActive : !listActive;
              return <button key={value} type="button" aria-pressed={active} onClick={() => chooseView(value)} className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/80 hover:bg-muted"}`}><Icon aria-hidden="true" className="h-4 w-4" />{label}</button>;
            })}
          </div>
          <Mapa events={filteredEvents} userOrigin={userPlace ? discovery.origin : null} selectedId={selectedId} highlightedId={highlightedId} onSelectEvent={handleMapSelect} onHighlightEvent={setHighlightedId} />
          {view === "lista" && !compact && <div className="absolute inset-0 z-30 overflow-y-auto bg-background px-6 pb-10 pt-24 md:pl-14">
            <h2 className="sr-only">Lista de eventos</h2>
            {!loading && listedEvents.length === 0 ? <div className="mx-auto max-w-sm rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-8 text-center"><CalendarDays className="mx-auto mb-3 h-6 w-6 text-primary" /><p className="text-sm font-medium">Nenhum evento encontrado</p><p className="mt-1 text-xs text-muted-foreground">Experimente outra busca, cidade ou período.</p></div>
            : <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">{listedEvents.map((event, index) => <li key={event.id}><button type="button" onClick={() => selectFromList(event.id)} className="group flex h-full w-full flex-col overflow-hidden rounded-3xl border border-border bg-card text-left shadow-surface transition hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
              <span className="relative block aspect-[16/9] w-full overflow-hidden bg-primary/10"><HomeEventImage banner={event.banner} category={event.category} index={index} sizes="(min-width: 1280px) 25vw, 40vw" className="object-cover" />{event.featured && <FeaturedTag className="absolute left-3 top-3" />}</span>
              <span className="flex flex-1 items-start gap-3 p-4"><DayMonthBlock date={event.dataInicio} /><span className="min-w-0 flex-1"><span className="line-clamp-2 text-sm font-semibold leading-5">{event.nome}</span><span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin aria-hidden="true" className="h-3 w-3 shrink-0" /><span className="truncate">{event.endereco || "Local a confirmar"}</span></span><span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand">Ver no mapa <ArrowRight aria-hidden="true" className="h-3 w-3" /></span></span></span>
            </button></li>)}</ul>}
          </div>}
        </section>
      </section>
      </div>
    </div>
  );
}
