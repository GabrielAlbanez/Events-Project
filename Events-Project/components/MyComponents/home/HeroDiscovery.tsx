"use client";

import Link from "next/link";
import { ArrowRight, Calendar, CalendarDays, ChevronLeft, ChevronRight, Drama, Gamepad2, Globe, LayoutGrid, MapPin, Music, Plus, Search, Sparkles, Star, Tag, Ticket, Users, Utensils } from "lucide-react";
import { AnimatePresence, LazyMotion, m, type PanInfo } from "framer-motion";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Evento } from "@/types";
import type { DiscoveryPeriod } from "@/lib/discoveryPeriod";
import { eventInstant } from "@/lib/eventTime";
import { loadLayoutFeatures } from "@/components/animations/config";
import { HomeEventImage } from "./HomeEventImage";
import styles from "./HeroDiscovery.module.css";

export type HeroSearchValues = { location: string; period: DiscoveryPeriod; category: string };

export function HeroSearch({ events, period, searchValue, categoryValue, onSearch }: { events: Evento[]; period: DiscoveryPeriod; searchValue: string; categoryValue: string; onSearch: (values: HeroSearchValues) => void }) {
  const fieldId = useId();
  const [location, setLocation] = useState(searchValue);
  const [selectedPeriod, setSelectedPeriod] = useState<DiscoveryPeriod>(period);
  const [category, setCategory] = useState(categoryValue);
  useEffect(() => setSelectedPeriod(period), [period]);
  useEffect(() => setLocation(searchValue), [searchValue]);
  useEffect(() => setCategory(categoryValue), [categoryValue]);
  const categories = useMemo(() => Array.from(new Set([...events.map(event => event.category), categoryValue].filter((value): value is string => typeof value === "string" && Boolean(value.trim())))).sort((a, b) => a.localeCompare(b, "pt-BR")), [events, categoryValue]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch({ location: location.trim().slice(0, 100), period: selectedPeriod, category });
  };
  return <form className={styles.search} onSubmit={submit} aria-label="Buscar eventos">
    <label className={`${styles.field} ${styles.fieldSide}`}><MapPin size={19} aria-hidden="true" className={styles.sideIcon} /><span className={styles.fieldStack}><span className={styles.fieldLabel}>Local ou cidade</span><input value={location} onChange={event => setLocation(event.target.value)} maxLength={100} placeholder="Onde você quer ir?" /></span></label>
    <div className={styles.field}><label htmlFor={`${fieldId}-period`} className={styles.fieldLabel}><Calendar size={16} aria-hidden="true" />Quando</label><Select value={selectedPeriod} onValueChange={value => setSelectedPeriod(value as DiscoveryPeriod)}><SelectTrigger id={`${fieldId}-period`} className={styles.selectTrigger}><SelectValue /></SelectTrigger><SelectContent className={styles.selectContent}><SelectItem className={styles.selectItem} value="todos">Qualquer data</SelectItem><SelectItem className={styles.selectItem} value="hoje">Hoje</SelectItem><SelectItem className={styles.selectItem} value="fim-de-semana">Fim de semana</SelectItem><SelectItem className={styles.selectItem} value="mes">Este mês</SelectItem></SelectContent></Select></div>
    <div className={styles.field}><label htmlFor={`${fieldId}-category`} className={styles.fieldLabel}><LayoutGrid size={16} aria-hidden="true" />Categoria</label><Select value={category ? `category:${category}` : "all"} onValueChange={value => setCategory(value === "all" ? "" : value.slice("category:".length))}><SelectTrigger id={`${fieldId}-category`} className={styles.selectTrigger}><SelectValue /></SelectTrigger><SelectContent className={styles.selectContent}><SelectItem className={styles.selectItem} value="all">Todas</SelectItem>{categories.map(value => <SelectItem className={styles.selectItem} key={value} value={`category:${value}`}>{value.trim()}</SelectItem>)}</SelectContent></Select></div>
    <button type="submit" className={styles.searchButton}><Search size={20} aria-hidden="true" />Buscar eventos</button>
  </form>;
}

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLocaleLowerCase("pt-BR");
}

const CATEGORY_ICONS: [RegExp, typeof Music][] = [
  [/music|show|festival|jazz|samba|rock|pagode|sertanejo|balada|\bdj\b|concert/, Music],
  [/network|negocio|empreend|carreira|tecnolog|palestra|workshop|confer|meetup|startup|educa|curso/, Users],
  [/cultur|teatro|arte|comedia|circo|danca|cinema|exposi|museu|literat|stand/, Drama],
  [/gastro|comida|culinar|food|bebida|vinho|cerveja|cafe|restaurante/, Utensils],
  [/game|jogo|esport|geek|anime|nerd/, Gamepad2],
];

function categoryIcon(category: string): typeof Music {
  const key = normalized(category);
  return CATEGORY_ICONS.find(([pattern]) => pattern.test(key))?.[1] ?? Tag;
}

const MAX_CATEGORY_CHIPS = 5;

/** Categories present in the loaded agenda (most frequent first); a chip runs the quick search with that category. */
export function HeroCategories({ events, loading, onSelect, onExplore }: { events: Evento[]; loading: boolean; onSelect: (category: string) => void; onExplore: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  const headingId = useId();
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of events) {
      const name = typeof event.category === "string" ? event.category.trim() : "";
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR")).map(([name]) => name);
  }, [events]);
  if (!loading && categories.length === 0) return null;
  return <nav className={styles.explore} aria-labelledby={headingId}>
    <div className={styles.exploreHead}>
      <h2 id={headingId}><Sparkles size={20} aria-hidden="true" />Explore por categoria</h2>
      <a href="#home-discovery" onClick={onExplore} className={styles.exploreAll}>Ver todas <ArrowRight size={16} aria-hidden="true" /></a>
    </div>
    {loading ? <div className={styles.chips} aria-hidden="true">{[0, 1, 2, 3, 4].map(item => <span key={item} className={styles.chipSkeleton} />)}</div> : <ul className={styles.chips}>
      {categories.slice(0, MAX_CATEGORY_CHIPS).map(category => {
        const Icon = categoryIcon(category);
        return <li key={category}><button type="button" className={styles.categoryChip} onClick={() => onSelect(category)}><Icon size={18} aria-hidden="true" />{category}</button></li>;
      })}
      <li><a href="#home-discovery" onClick={onExplore} className={styles.categoryChip} aria-label="Mais categorias no mapa"><Plus size={17} aria-hidden="true" />Mais</a></li>
    </ul>}
  </nav>;
}

const WEEK_MS = 7 * 86_400_000;

/** Real figures from the published agenda already loaded by the home; empty values are hidden instead of showing zero. */
export function HeroStats({ events, loading, loadError }: { events: Evento[]; loading: boolean; loadError: boolean }) {
  const figures = useMemo(() => {
    const limit = Date.now() + WEEK_MS;
    return {
      events: events.length,
      week: events.filter(event => { const start = eventInstant(event.dataInicio, event.startTime, event.timezone); return Boolean(start && start.getTime() <= limit); }).length,
      categories: new Set(events.map(event => (typeof event.category === "string" ? event.category.trim() : "")).filter(Boolean)).size,
    };
  }, [events]);
  const format = (value: number) => new Intl.NumberFormat("pt-BR").format(value);
  const cells = [
    { key: "events", Icon: Ticket, value: figures.events, label: figures.events === 1 ? "evento disponível" : "eventos disponíveis" },
    { key: "week", Icon: CalendarDays, value: figures.week, label: figures.week === 1 ? "acontece nos próximos 7 dias" : "acontecem nos próximos 7 dias" },
    { key: "categories", Icon: Globe, value: figures.categories, label: figures.categories === 1 ? "categoria para explorar" : "categorias para explorar" },
  ].filter(cell => loading || (!loadError && cell.value > 0));
  return <ul className={styles.stats} aria-label="A agenda em números" aria-busy={loading}>
    {cells.map(({ key, Icon, value, label }) => <li key={key} className={styles.stat}>
      <Icon size={34} strokeWidth={1.8} aria-hidden="true" className={styles.statIcon} />
      <span className={styles.statText}>{loading ? <><span className={styles.statSkeleton} aria-hidden="true" /><span className={styles.statLabelSkeleton} aria-hidden="true" /></> : <><strong>{format(value)}</strong><span>{label}</span></>}</span>
    </li>)}
    <li className={styles.stat}><span className={styles.statText}><strong className={styles.statBrand}>EventMap</strong><span>A sua plataforma de eventos.</span></span></li>
    {loading && <li className="sr-only" role="status">Carregando números da agenda…</li>}
  </ul>;
}

function eventDate(event: Evento): string {
  const date = eventInstant(event.dataInicio, event.startTime, event.timezone);
  if (!date) return "Data a confirmar";
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: event.timezone || "America/Sao_Paulo" }).format(date) + (event.startTime ? ` • ${event.startTime}` : "");
}

/** Short "City, UF" from a full address, e.g. "R. A, 10 - Centro, Campinas - SP, 13010-000, Brasil" → "Campinas, SP". */
function shortCity(address: string): string {
  const parts = address.split(",").map(part => part.trim()).filter(part => part && !/^\d{5}-?\d{3}$/.test(part) && !/^(brasil|brazil)$/i.test(part));
  for (let index = parts.length - 1; index >= 0; index--) {
    const match = /^(.+?)\s+-\s+([A-Z]{2})$/.exec(parts[index]);
    if (match) return `${match[1].split(" - ").pop()?.trim() || match[1]}, ${match[2]}`;
  }
  return parts.length > 1 ? parts.slice(-2).join(", ") : parts[0] || "Local a confirmar";
}

function priceLabel(event: Evento): string | null {
  if (event.isFree) return "Grátis";
  if (typeof event.priceCents !== "number" || !Number.isFinite(event.priceCents) || event.priceCents <= 0) return null;
  const digits = event.priceCents % 100 ? 2 : 0;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: digits, maximumFractionDigits: 2 }).format(event.priceCents / 100);
}

const CARD_SIZES = "(max-width: 1023px) calc(100vw - 40px), 600px";
const SWIPE_DISTANCE = 60;
const SWIPE_VELOCITY = 500;

export function HeroCarousel({ events, loading, loadError, onExplore }: { events: Evento[]; loading: boolean; loadError: boolean; onExplore: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(true);
  const dragged = useRef(false);
  const count = events.length;
  useEffect(() => { setIndex(current => count ? Math.min(current, count - 1) : 0); }, [count]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    const syncVisibility = () => setVisible(!document.hidden);
    sync(); syncVisibility();
    media.addEventListener("change", sync);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => { media.removeEventListener("change", sync); document.removeEventListener("visibilitychange", syncVisibility); };
  }, []);
  // Autoplay (6.5s) is driven by an invisible timer's CSS animation, so pausing on hover/focus keeps the elapsed time.
  const playing = count > 1 && !hovered && !focused && !reduced && visible;
  const safeIndex = Math.min(index, Math.max(0, count - 1));
  const active = events[safeIndex];
  const move = (delta: number) => { if (count < 2) return; setDirection(delta < 0 ? -1 : 1); setIndex(current => (current + delta + count) % count); };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x <= -SWIPE_DISTANCE || info.velocity.x <= -SWIPE_VELOCITY) move(1);
    else if (info.offset.x >= SWIPE_DISTANCE || info.velocity.x >= SWIPE_VELOCITY) move(-1);
  };
  const slide = reduced ? 0 : 28;
  const subtitle = active ? [active.category?.trim(), priceLabel(active)].filter(Boolean).join(" • ") : "";
  // Nested LazyMotion loads domMax so drag works on top of the page-level domAnimation features.
  return <LazyMotion features={loadLayoutFeatures}><div className={styles.carousel} role="region" aria-label="Eventos em destaque" aria-roledescription="carrossel" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }} onKeyDown={event => { if (count > 1 && (event.key === "ArrowLeft" || event.key === "ArrowRight")) { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); } }}>
    <span className={styles.blob} aria-hidden="true" />
    <div className={styles.tilt}>
      {loading ? <div className={styles.cardSkeleton} role="status"><span className="sr-only">Carregando eventos em destaque…</span><span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" /></div> : active ? <m.article className={styles.card} aria-label={`${safeIndex + 1} de ${count}: ${active.nome}`} drag={count > 1 ? "x" : false} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.16} dragMomentum={false} onDragStart={() => { dragged.current = true; }} onDragEnd={onDragEnd} onPointerDown={() => { dragged.current = false; }}>
        <AnimatePresence initial={false} mode="popLayout">
          <m.div key={active.id} className={styles.slide} initial={{ opacity: 0, x: direction * slide }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -direction * slide }} transition={{ duration: reduced ? 0 : .32, ease: [0.22, 1, 0.36, 1] }}>
            <HomeEventImage banner={active.banner} category={active.category} index={safeIndex} priority={safeIndex === 0} sizes={CARD_SIZES} className={styles.image} />
            <span className={styles.shade} aria-hidden="true" />
            <div className={styles.cardBody}>
              <p className={styles.meta}><span><Calendar size={17} aria-hidden="true" />{eventDate(active)}</span><span className={styles.city}><MapPin size={17} aria-hidden="true" /><span>{shortCity(active.endereco || "")}</span></span></p>
              <h2 className={styles.title}>{active.nome}</h2>
              {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
              <Link href={`/eventos/${encodeURIComponent(active.id)}`} className={styles.detailsButton} draggable={false} onClickCapture={event => { if (!dragged.current || event.detail === 0) return; event.preventDefault(); event.stopPropagation(); dragged.current = false; }}>Ver detalhes <ArrowRight size={17} aria-hidden="true" /></Link>
            </div>
          </m.div>
        </AnimatePresence>
        <span className={styles.featuredPill}><Star size={15} strokeWidth={2.4} aria-hidden="true" />Em destaque</span>
        {count > 1 && <div className={styles.pager}>
          <button type="button" onClick={() => move(-1)} aria-label="Evento anterior"><ChevronLeft size={18} aria-hidden="true" /></button>
          <span aria-live="polite" aria-atomic="true"><span className="sr-only">Evento </span>{safeIndex + 1}/{count}</span>
          <button type="button" onClick={() => move(1)} aria-label="Próximo evento"><ChevronRight size={18} aria-hidden="true" /></button>
        </div>}
        {count > 1 && !reduced && <span key={`timer-${safeIndex}`} className={styles.timer} data-mode={playing ? "playing" : "paused"} aria-hidden="true" onAnimationEnd={animation => { if (animation.target === animation.currentTarget && playing) move(1); }} />}
      </m.article> : <div className={styles.placeholder}><p>{loadError ? "Não foi possível carregar os destaques agora." : "Os eventos em destaque aparecem aqui."}</p><a href="#home-discovery" onClick={onExplore}>Explorar no mapa</a></div>}
    </div>
  </div></LazyMotion>;
}
