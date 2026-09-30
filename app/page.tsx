"use client";

import Mapa from "@/components/MyComponents/Map";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Evento } from "@/types";
import { CalendarDays, Compass, MapPin, Search, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Period = "todos" | "hoje" | "fim-de-semana" | "mes";

function parseEventDate(value: string) {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = day
    ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]))
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function matchesPeriod(event: Evento, period: Period) {
  if (period === "todos") return true;
  const date = parseEventDate(event.dataInicio);
  if (!date) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "hoje") return date >= today && date < new Date(today.getTime() + 86400000);
  if (period === "mes") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  const saturday = new Date(today);
  saturday.setDate(today.getDate() + ((6 - today.getDay() + 7) % 7));
  const monday = new Date(saturday);
  monday.setDate(saturday.getDate() + 2);
  return date >= saturday && date < monday;
}

const filters: { label: string; value: Period }[] = [
  { label: "Todos", value: "todos" },
  { label: "Hoje", value: "hoje" },
  { label: "Fim de semana", value: "fim-de-semana" },
  { label: "Este mês", value: "mes" },
];

export default function Home() {
  const [events, setEvents] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<Period>("todos");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const touchStart = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/AllEvents", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Falha ao carregar eventos");
        return response.json();
      })
      .then((data: Evento[]) => setEvents(Array.isArray(data) ? data.filter((event) => event.validate) : []))
      .catch(() => { if (!controller.signal.aborted) setLoadError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return events.filter((event) => matchesPeriod(event, period) &&
      (!query || `${event.nome} ${event.descricao} ${event.endereco}`.toLocaleLowerCase("pt-BR").includes(query)));
  }, [events, period, search]);

  return (
    <div className="flex min-h-screen flex-col bg-[#faf9ff] text-zinc-950 dark:bg-zinc-950 dark:text-white">
      <header className="z-30 flex h-[72px] shrink-0 items-center justify-between border-b border-zinc-200/70 bg-white/90 px-4 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/90 md:px-7">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="h-10 w-10 rounded-xl border border-zinc-200 dark:border-white/10" />
          <Link href="/" className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-700 text-white shadow-md shadow-violet-600/25"><Sparkles className="h-5 w-5" /></span>
            EventMap
          </Link>
        </div>
        <nav aria-label="Navegação principal" className="hidden items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 p-1 text-sm md:flex dark:border-white/10 dark:bg-white/5">
          <Link href="/" aria-current="page" className="rounded-full bg-white px-4 py-2 font-semibold text-violet-700 shadow-sm dark:bg-zinc-800 dark:text-violet-300">Descobrir</Link>
          <Link href="/EventsCreated" className="rounded-full px-4 py-2 text-zinc-600 transition hover:text-violet-700 dark:text-zinc-300">Agenda</Link>
          <Link href="/myEvents" className="rounded-full px-4 py-2 text-zinc-600 transition hover:text-violet-700 dark:text-zinc-300">Meus eventos</Link>
        </nav>
        <Link href="/EventsCreated" className="flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700"><Compass className="h-4 w-4" /><span className="hidden sm:inline">Explorar agenda</span><span className="sm:hidden">Agenda</span></Link>
      </header>

      <main className="relative h-[calc(100vh-72px)] min-h-[520px] flex-1 md:grid md:grid-cols-[minmax(340px,410px)_minmax(0,1fr)]">
        <section className={`absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-[1.75rem] border-t border-zinc-200 bg-white shadow-[0_-12px_36px_-24px_rgba(0,0,0,.35)] transition-[height] duration-300 dark:border-white/10 dark:bg-zinc-950 md:relative md:inset-auto md:h-[calc(100vh-72px)] md:rounded-none md:border-r md:border-t-0 md:shadow-none ${sheetExpanded ? "h-[72%]" : "h-[320px]"}`}>
          <button type="button" aria-label={sheetExpanded ? "Recolher lista" : "Expandir lista"} onClick={() => setSheetExpanded((value) => !value)} onTouchStart={(event) => { touchStart.current = event.touches[0].clientY; }} onTouchEnd={(event) => { if (touchStart.current !== null) { const delta = event.changedTouches[0].clientY - touchStart.current; if (Math.abs(delta) > 55) setSheetExpanded(delta < 0); touchStart.current = null; } }} className="flex h-7 shrink-0 touch-none items-center justify-center md:hidden"><span className="h-1 w-12 rounded-full bg-zinc-300 dark:bg-zinc-700" /></button>
          <div className="px-5 pb-4 pt-2 md:px-7 md:pt-8">
            <div className="mb-3 hidden items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-violet-600 md:flex"><Sparkles className="h-4 w-4" /> Descubra por perto</div>
            <h1 className="text-2xl font-bold tracking-tight md:text-[2rem]">Encontre seu próximo evento</h1>
            <p className="mt-1 hidden text-sm leading-6 text-zinc-500 md:block">Explore a agenda e escolha o que combina com você.</p>
            <label className="mt-4 flex h-12 items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-500/10 dark:border-white/10 dark:bg-white/5">
              <Search className="h-4 w-4 shrink-0 text-zinc-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar evento ou lugar" aria-label="Buscar evento ou lugar" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400" />
              {search && <button type="button" onClick={() => setSearch("")} aria-label="Limpar busca"><X className="h-4 w-4 text-zinc-400" /></button>}
            </label>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
              {filters.map((filter) => <button key={filter.value} type="button" onClick={() => setPeriod(filter.value)} aria-pressed={period === filter.value} className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition ${period === filter.value ? "bg-violet-600 text-white shadow-md shadow-violet-600/20" : "border border-zinc-200 bg-white text-zinc-600 hover:border-violet-300 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300"}`}>{filter.label}</button>)}
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col border-t border-zinc-100 dark:border-white/10">
            <div className="flex items-center justify-between px-5 py-3 md:px-7"><h2 className="text-sm font-semibold">Eventos próximos</h2><span className="text-xs text-zinc-400">{filteredEvents.length} encontrados</span></div>
            <div className="flex-1 space-y-2 overflow-y-auto px-4 pb-6 md:px-5">
              {loading && <p className="rounded-2xl bg-zinc-50 p-5 text-sm text-zinc-500 dark:bg-white/5">Carregando eventos…</p>}
              {loadError && <p className="rounded-2xl bg-zinc-50 p-5 text-sm text-zinc-500 dark:bg-white/5">Não foi possível carregar os eventos. Tente atualizar a página.</p>}
              {!loading && !loadError && filteredEvents.length === 0 && <div className="rounded-2xl border border-dashed border-zinc-200 p-6 text-center dark:border-white/10"><CalendarDays className="mx-auto mb-3 h-6 w-6 text-violet-500" /><p className="text-sm font-medium">Nenhum evento encontrado</p><p className="mt-1 text-xs text-zinc-500">Experimente outra busca ou período.</p></div>}
              {filteredEvents.map((event) => <button key={event.id} type="button" onMouseEnter={() => setHighlightedId(event.id)} onMouseLeave={() => setHighlightedId(null)} onFocus={() => setHighlightedId(event.id)} onBlur={() => setHighlightedId(null)} onClick={() => { setSelectedId(event.id); setSheetExpanded(false); }} className={`group flex w-full gap-3 rounded-2xl border p-2 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${selectedId === event.id ? "border-violet-400 bg-violet-50/70 dark:bg-violet-400/10" : "border-zinc-200 bg-white hover:border-violet-200 dark:border-white/10 dark:bg-white/5"}`}>
                <div className="relative h-[84px] w-[84px] shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-violet-500 to-indigo-700">{event.banner && <img src={event.banner} alt="" className="h-full w-full object-cover" />}</div>
                <div className="min-w-0 flex-1 py-1"><span className="text-[11px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-300">{parseEventDate(event.dataInicio) ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(parseEventDate(event.dataInicio)!) : "Data a confirmar"}</span><h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-5">{event.nome}</h3><p className="mt-1 flex items-center gap-1 truncate text-xs text-zinc-500"><MapPin className="h-3 w-3 shrink-0" />{event.endereco}</p></div>
              </button>)}
            </div>
          </div>
        </section>
        <section className={`relative overflow-hidden bg-zinc-100 transition-[height] duration-300 dark:bg-zinc-900 md:h-full md:min-h-[520px] ${sheetExpanded ? "h-[28%]" : "h-[calc(100%-320px)]"}`} aria-label="Mapa dos eventos">
          <Mapa events={filteredEvents} selectedId={selectedId} highlightedId={highlightedId} onSelectEvent={setSelectedId} />
        </section>
      </main>
    </div>
  );
}
