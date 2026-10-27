"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, MapPin, Search } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react";
import type { Evento } from "@/types";
import type { DiscoveryPeriod } from "@/lib/discoveryPeriod";
import { eventInstant } from "@/lib/eventTime";
import { HomeEventImage } from "./HomeEventImage";
import styles from "./HeroDiscovery.module.css";

export type HeroSearchValues = { location: string; period: DiscoveryPeriod; category: string };

export function HeroSearch({ events, period, searchValue, categoryValue, onSearch }: { events: Evento[]; period: DiscoveryPeriod; searchValue: string; categoryValue: string; onSearch: (values: HeroSearchValues) => void }) {
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
    <label className={styles.field}><span>Quando</span><select value={selectedPeriod} onChange={event => setSelectedPeriod(event.target.value as DiscoveryPeriod)}><option value="todos">Qualquer data</option><option value="hoje">Hoje</option><option value="fim-de-semana">Fim de semana</option><option value="mes">Este mês</option></select></label>
    <label className={styles.field}><span>Categoria</span><select value={category} onChange={event => setCategory(event.target.value)}><option value="">Todas</option>{categories.map(value => <option key={value} value={value}>{value.trim()}</option>)}</select></label>
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

export function HeroCarousel({ events, loading, loadError, onExplore }: { events: Evento[]; loading: boolean; loadError: boolean; onExplore: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(true);
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
  useEffect(() => {
    if (count < 2 || hovered || focused || reduced || !visible) return;
    const timer = window.setInterval(() => setIndex(current => (current + 1) % count), 6500);
    return () => window.clearInterval(timer);
  }, [count, hovered, focused, reduced, visible]);
  const active = events[Math.min(index, Math.max(0, count - 1))];
  const move = (delta: number) => setIndex(current => (current + delta + count) % count);
  return <div className={styles.carousel} role="region" aria-label="Eventos em destaque" aria-roledescription="carrossel" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }} onKeyDown={event => { if (count > 1 && (event.key === "ArrowLeft" || event.key === "ArrowRight")) { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); } }}>
    {loading ? <div className={styles.placeholder} role="status"><span>Carregando eventos em destaque…</span></div> : active ? <article className={styles.card} aria-label={`${index + 1} de ${count}: ${active.nome}`}>
      <Link href={`/eventos/${encodeURIComponent(active.id)}`} className={styles.cardLink}>
        <div key={active.id} className={styles.artwork}><HomeEventImage banner={active.banner} category={active.category} index={index} priority={index === 0} sizes="(max-width: 767px) calc(100vw - 40px), (max-width: 1100px) 500px, 440px" className={styles.image} />{active.category && <span className={styles.badge}>{active.category}</span>}</div>
        <div className={styles.cardBody}><p className={styles.date}>{eventDate(active)}</p><h2>{active.nome}</h2><p className={styles.location}><MapPin size={16} aria-hidden="true" /><span>{shortAddress(active.endereco || "Local a confirmar")}</span></p><span className={styles.cardAction}>Conhecer o evento <span aria-hidden="true">↗</span></span></div>
      </Link>
    </article> : <div className={styles.placeholder}><p>{loadError ? "Não foi possível carregar os destaques agora." : "Os eventos em destaque aparecem aqui."}</p><a href="#home-discovery" onClick={onExplore}>Explorar no mapa</a></div>}
    {count > 1 && !loading && <div className={styles.controls} aria-label="Navegar entre eventos em destaque"><button type="button" onClick={() => move(-1)} aria-label="Evento anterior"><ChevronLeft size={18} aria-hidden="true" /></button><div className={styles.dots}>{events.map((event, item) => <button key={event.id} type="button" aria-label={`Mostrar evento ${item + 1}: ${event.nome}`} aria-current={item === index ? "true" : undefined} onClick={() => setIndex(item)}><span /></button>)}</div><button type="button" onClick={() => move(1)} aria-label="Próximo evento"><ChevronRight size={18} aria-hidden="true" /></button></div>}
  </div>;
}
