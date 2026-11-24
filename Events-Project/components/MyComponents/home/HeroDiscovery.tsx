"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, MapPin, Search } from "lucide-react";
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
    <label className={styles.field}><span>Local ou cidade</span><input value={location} onChange={event => setLocation(event.target.value)} maxLength={100} placeholder="Onde você quer ir?" /></label>
    <div className={styles.field}><label htmlFor={`${fieldId}-period`}>Quando</label><Select value={selectedPeriod} onValueChange={value => setSelectedPeriod(value as DiscoveryPeriod)}><SelectTrigger id={`${fieldId}-period`} className={styles.selectTrigger}><SelectValue /></SelectTrigger><SelectContent className={styles.selectContent}><SelectItem className={styles.selectItem} value="todos">Qualquer data</SelectItem><SelectItem className={styles.selectItem} value="hoje">Hoje</SelectItem><SelectItem className={styles.selectItem} value="fim-de-semana">Fim de semana</SelectItem><SelectItem className={styles.selectItem} value="mes">Este mês</SelectItem></SelectContent></Select></div>
    <div className={styles.field}><label htmlFor={`${fieldId}-category`}>Categoria</label><Select value={category ? `category:${category}` : "all"} onValueChange={value => setCategory(value === "all" ? "" : value.slice("category:".length))}><SelectTrigger id={`${fieldId}-category`} className={styles.selectTrigger}><SelectValue /></SelectTrigger><SelectContent className={styles.selectContent}><SelectItem className={styles.selectItem} value="all">Todas</SelectItem>{categories.map(value => <SelectItem className={styles.selectItem} key={value} value={`category:${value}`}>{value.trim()}</SelectItem>)}</SelectContent></Select></div>
    <button type="submit" className={styles.searchButton}><Search size={18} aria-hidden="true" />Buscar eventos</button>
  </form>;
}

function eventDate(event: Evento): string {
  const date = eventInstant(event.dataInicio, event.startTime, event.timezone);
  if (!date) return "Data a confirmar";
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: event.timezone || "America/Sao_Paulo" }).format(date) + (event.startTime ? ` · ${event.startTime}` : "");
}

function shortAddress(address: string): string {
  const parts = address.split(",").map(part => part.trim()).filter(part => part && !/^\d{5}-?\d{3}$/.test(part));
  return parts.length > 3 ? [parts[0], ...parts.slice(-2)].join(", ") : parts.join(", ");
}

const DAY_MS = 86_400_000;

/** Calendar day (UTC midnight) from "YYYY-MM-DD", so comparisons never shift by timezone. */
function calendarDay(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const day = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(day) ? null : day;
}

function todayIn(timeZone: string): number | null {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
    const day = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
    return Number.isNaN(day) ? null : day;
  } catch { return null; }
}

function relativeDay(event: Evento): string | null {
  const day = calendarDay(event.dataInicio);
  const today = todayIn(event.timezone || "America/Sao_Paulo");
  if (day === null || today === null) return null;
  const diff = Math.round((day - today) / DAY_MS);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  const weekday = new Date(day).getUTCDay();
  return diff > 1 && diff < 7 && (weekday === 0 || weekday === 6) ? "Neste fim de semana" : null;
}

function priceLabel(event: Evento): string | null {
  if (event.isFree) return "Grátis";
  if (typeof event.priceCents !== "number" || !Number.isFinite(event.priceCents) || event.priceCents <= 0) return null;
  const digits = event.priceCents % 100 ? 2 : 0;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: digits, maximumFractionDigits: 2 }).format(event.priceCents / 100);
}

type Chip = { label: string; kind: "when" | "price" };

const CARD_SIZES = "(max-width: 767px) calc(100vw - 40px), (max-width: 1100px) 500px, 440px";
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
  // Autoplay (6.5s) is driven by the active progress segment's CSS animation, so bar and slide change stay in sync, including while paused.
  const playing = count > 1 && !hovered && !focused && !reduced && visible;
  const safeIndex = Math.min(index, Math.max(0, count - 1));
  const active = events[safeIndex];
  const move = (delta: number) => { if (count < 2) return; setDirection(delta < 0 ? -1 : 1); setIndex(current => (current + delta + count) % count); };
  const go = (target: number) => { if (target === safeIndex) return; setDirection(target > safeIndex ? 1 : -1); setIndex(target); };
  const stack = Array.from({ length: Math.min(2, Math.max(0, count - 1)) }, (_, step) => ({ target: (safeIndex + step + 1) % count, depth: step + 1 }));
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x <= -SWIPE_DISTANCE || info.velocity.x <= -SWIPE_VELOCITY) move(1);
    else if (info.offset.x >= SWIPE_DISTANCE || info.velocity.x >= SWIPE_VELOCITY) move(-1);
  };
  const slide = reduced ? 0 : 28;
  const when = active ? relativeDay(active) : null;
  const price = active ? priceLabel(active) : null;
  const chips: Chip[] = [...(when ? [{ label: when, kind: "when" as const }] : []), ...(price ? [{ label: price, kind: "price" as const }] : [])];
  // Nested LazyMotion loads domMax so drag works on top of the page-level domAnimation features.
  return <LazyMotion features={loadLayoutFeatures}><div className={styles.carousel} role="region" aria-label="Eventos em destaque" aria-roledescription="carrossel" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }} onKeyDown={event => { if (count > 1 && (event.key === "ArrowLeft" || event.key === "ArrowRight")) { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); } }}>
    {loading ? <div className={styles.placeholder} role="status"><span>Carregando eventos em destaque…</span></div> : active ? <div className={styles.stage} data-depth={stack.length}>
      {/* Deck preview of the next events; decorative for assistive tech since the progress segments already navigate. */}
      {stack.slice().reverse().map(({ target, depth }) => <button key={`back-${depth}`} type="button" tabIndex={-1} aria-hidden="true" className={styles.backCard} data-depth={depth} onClick={() => go(target)}><HomeEventImage banner={events[target].banner} category={events[target].category} index={target} sizes={CARD_SIZES} className={styles.backImage} /></button>)}
      <m.article className={styles.card} aria-label={`${safeIndex + 1} de ${count}: ${active.nome}`} drag={count > 1 ? "x" : false} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.16} dragMomentum={false} onDragStart={() => { dragged.current = true; }} onDragEnd={onDragEnd} whileHover={reduced ? undefined : { y: -4 }} whileTap={reduced ? undefined : { scale: .99 }} transition={{ duration: .2 }}>
        <Link href={`/eventos/${encodeURIComponent(active.id)}`} className={styles.cardLink} draggable={false} onPointerDown={() => { dragged.current = false; }} onClickCapture={event => { if (!dragged.current || event.detail === 0) return; event.preventDefault(); event.stopPropagation(); dragged.current = false; }}>
          <AnimatePresence initial={false} mode="popLayout">
            <m.div key={active.id} className={styles.slide} initial={{ opacity: 0, x: direction * slide }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -direction * slide }} transition={{ duration: reduced ? 0 : .32, ease: [0.22, 1, 0.36, 1] }}>
              <div className={styles.artwork}>
                <HomeEventImage banner={active.banner} category={active.category} index={safeIndex} sizes={CARD_SIZES} className={styles.backdrop} />
                <HomeEventImage banner={active.banner} category={active.category} index={safeIndex} priority={safeIndex === 0} sizes={CARD_SIZES} className={styles.image} />
                {active.category && <span className={styles.badge}>{active.category}</span>}
              </div>
              <div className={styles.cardBody}>
                <div className={styles.meta}><p className={styles.date}>{eventDate(active)}</p>{chips.length > 0 && <ul className={styles.chips} aria-label="Resumo do evento">{chips.map(chip => <li key={chip.kind} className={styles.chip} data-kind={chip.kind} suppressHydrationWarning>{chip.label}</li>)}</ul>}</div>
                <h2>{active.nome}</h2>
                <p className={styles.location}><MapPin size={16} aria-hidden="true" /><span>{shortAddress(active.endereco || "Local a confirmar")}</span></p>
                <span className={styles.cardAction}>Conhecer o evento <span aria-hidden="true">↗</span></span>
              </div>
            </m.div>
          </AnimatePresence>
        </Link>
      </m.article>
    </div> : <div className={styles.placeholder}><p>{loadError ? "Não foi possível carregar os destaques agora." : "Os eventos em destaque aparecem aqui."}</p><a href="#home-discovery" onClick={onExplore}>Explorar no mapa</a></div>}
    {count > 1 && !loading && <div className={styles.controls} aria-label="Navegar entre eventos em destaque"><button type="button" onClick={() => move(-1)} aria-label="Evento anterior"><ChevronLeft size={18} aria-hidden="true" /></button><div className={styles.progress}>{events.map((event, item) => <button key={event.id} type="button" aria-label={`Mostrar evento ${item + 1}: ${event.nome}`} aria-current={item === safeIndex ? "true" : undefined} onClick={() => go(item)}><span className={styles.track}>{item === safeIndex ? <span key={`fill-${safeIndex}`} className={styles.fill} data-mode={reduced ? "static" : playing ? "playing" : "paused"} onAnimationEnd={animation => { if (animation.target === animation.currentTarget && playing) move(1); }} /> : item < safeIndex ? <span className={styles.fill} data-mode="static" /> : null}</span></button>)}</div><button type="button" onClick={() => move(1)} aria-label="Próximo evento"><ChevronRight size={18} aria-hidden="true" /></button></div>}
  </div></LazyMotion>;
}
