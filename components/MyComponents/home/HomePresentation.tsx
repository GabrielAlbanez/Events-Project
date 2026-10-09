"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type RefObject, type MouseEvent } from "react";
import { ArrowDown, ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import type { Evento } from "@/types";
import { parseEventDate } from "@/lib/discoveryPeriod";
import styles from "./HomeScroll.module.css";

const HomeScrollScene = dynamic(() => import("./HomeScrollScene"), { ssr: false });

export type HomePresentationProps = {
  events: Evento[];
  loading: boolean;
  loadError: boolean;
  scrollContainer: RefObject<HTMLDivElement>;
};

export function HomePresentation({ events, loading, loadError, scrollContainer }: HomePresentationProps) {
  const hero = useRef<HTMLElement>(null);
  const featuredSection = useRef<HTMLElement>(null);
  const featuredCards = useRef<(HTMLElement | null)[]>([]);
  const mapPlane = useRef<HTMLDivElement>(null);
  const pinPlane = useRef<HTMLDivElement>(null);
  const ticketPlane = useRef<HTMLDivElement>(null);
  const [enableDepth, setEnableDepth] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1100px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    let enableTimer: number | undefined;
    const update = () => {
      window.clearTimeout(enableTimer);
      if (!media.matches) setEnableDepth(false);
      else enableTimer = window.setTimeout(() => setEnableDepth(true), 250);
    };
    update();
    media.addEventListener("change", update);
    return () => { window.clearTimeout(enableTimer); media.removeEventListener("change", update); };
  }, []);
  const featured = events.slice(0, 3);
  const cardKey = featured.map(event => event.id).join("|");

  const navigateWithinHome = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const container = scrollContainer.current;
    const target = document.getElementById(event.currentTarget.hash.slice(1));
    if (!container || !target || !container.contains(target)) return;
    event.preventDefault();
    const top = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - (target.id === "home-discovery" ? 0 : 16);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    container.scrollTo({ top: Math.max(0, top), behavior: reducedMotion ? "auto" : "smooth" });
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${event.currentTarget.hash}`);
    target.focus({ preventScroll: true });
  };
  return (
    <div className={styles.presentation} data-depth={enableDepth || undefined}>
      {enableDepth && <HomeScrollScene container={scrollContainer} hero={hero} mapPlane={mapPlane} pinPlane={pinPlane} ticketPlane={ticketPlane} featured={featuredSection} cards={featuredCards} cardKey={cardKey} />}
      <section ref={hero} className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroCopy}>
          <h1 id="home-title">Bons momentos.<br />Mais perto.</h1>
          <p>Shows, encontros e novas experiências. Descubra o que acontece ao seu redor e encontre seu próximo evento.</p>
          <div className={styles.heroActions}>
            <a href="#home-discovery" onClick={navigateWithinHome} className={styles.primaryAction}>Explorar mapa <ArrowDown size={18} aria-hidden="true" /></a>
            <Link href="/EventsCreated" className={styles.secondaryAction}>Ver agenda <ArrowUpRight size={18} aria-hidden="true" /></Link>
          </div>
        </div>
        <div className={styles.art} aria-hidden="true">
          <div ref={mapPlane} className={styles.mapPlane}>
            <svg viewBox="0 0 500 400" fill="none" className={styles.streetGrid}>
              <path d="M-20 80L520 230M-20 185L520 335M80-20L-25 420M195-20L90 420M310-20L205 420M425-20L320 420M540-20L435 420" />
              <path d="M-10 275L280 125L520 190" className={styles.routeLine} />
            </svg>
            <span className={styles.mapDot} />
            <span className={styles.mapDotSecondary} />
          </div>
          <div ref={pinPlane} className={styles.pinPlane}>
            <svg viewBox="0 0 140 180" className={styles.heroPin}>
              <path d="M70 6C33 6 6 34 6 70C6 113 70 174 70 174S134 113 134 70C134 34 107 6 70 6Z" fill="currentColor" />
              <circle cx="70" cy="68" r="25" className={styles.pinHole} />
              <path d="M70 53V83M55 68H85" className={styles.pinSpark} />
            </svg>
          </div>
          <div ref={ticketPlane} className={styles.ticketPlane}>
            <span className={styles.ticketIcon}><CalendarDays size={24} /></span>
            <span><strong>Seu próximo momento</strong><span>Começa por aqui</span></span>
            <span className={styles.ticketPerforation} />
          </div>
        </div>
        <a href="#home-featured" onClick={navigateWithinHome} className={styles.scrollCue}><ArrowDown size={15} aria-hidden="true" /> Continue explorando</a>
      </section>

      <section ref={featuredSection} id="home-featured" tabIndex={-1} className={styles.featured} aria-labelledby="home-featured-title">
        <div className={styles.featuredInner}>
        <div className={styles.sectionHeading}>
          <div><h2 id="home-featured-title">A próxima experiência pode estar aqui.</h2><p>Conheça alguns dos eventos da agenda.</p></div>
          <Link href="/EventsCreated" className={styles.secondaryAction}>Toda a agenda <ArrowUpRight size={18} aria-hidden="true" /></Link>
        </div>
        <div className={styles.cards}>
          {loading ? [0, 1, 2].map(item => <div key={item} aria-hidden="true" className={styles.skeleton}><div className={styles.skeletonPoster} /><div className={styles.skeletonBody}><span /><span /><span /></div></div>) : featured.map((event, index) => {
            const date = parseEventDate(event.dataInicio);
            return <article ref={node => { featuredCards.current[index] = node; }} key={event.id} className={styles.eventCard}>
              <Link href={`/eventos/${event.id}`} className={styles.cardLink}>
                <div className={styles.poster}>{event.banner ? <img src={event.banner} alt="" width={800} height={500} loading="lazy" decoding="async" /> : <CalendarDays size={42} aria-hidden="true" />}</div>
                <div className={styles.cardBody}>
                  <span className={styles.date}>{date ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(date) : "Data a confirmar"}</span>
                  <h3>{event.nome}</h3>
                  <p><MapPin size={14} aria-hidden="true" /><span>{event.endereco}</span></p>
                  <span className={styles.cardAction}>Conhecer evento <ArrowUpRight size={17} aria-hidden="true" /></span>
                </div>
              </Link>
            </article>;
          })}
          {!loading && featured.length === 0 && <div className={styles.empty}><CalendarDays size={28} aria-hidden="true" /><p>{loadError ? "A agenda não carregou. Você pode tentar novamente no mapa abaixo." : "Explore o mapa para encontrar novos eventos."}</p><a href="#home-discovery" onClick={navigateWithinHome} className={styles.secondaryAction}>Explorar mapa <ArrowDown size={18} aria-hidden="true" /></a></div>}
        </div>
        {loading && <span role="status" className="sr-only">Carregando destaques da agenda…</span>}
        </div>
      </section>

      <section className={styles.discoveryIntro} aria-labelledby="home-discovery-intro">
        <MapPin size={22} aria-hidden="true" />
        <h2 id="home-discovery-intro">Escolha o seu lugar.<br />Encontre o seu evento.</h2>
        <p>Use o mapa, busque por nome ou filtre a agenda. A descoberta começa com você.</p>
        <a href="#home-discovery" onClick={navigateWithinHome} className={styles.secondaryAction}>Ir para o mapa <ArrowDown size={18} aria-hidden="true" /></a>
      </section>
    </div>
  );
}
