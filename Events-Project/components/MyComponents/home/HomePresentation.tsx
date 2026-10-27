"use client";

import Link from "next/link";
import { HomeEventImage } from "./HomeEventImage";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type RefObject, type MouseEvent } from "react";
import { ArrowDown, ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import type { Evento } from "@/types";
import { parseEventDate } from "@/lib/discoveryPeriod";
import { InteractiveSurface } from "@/components/animations/InteractiveSurface";
import styles from "./HomeScroll.module.css";

const dateLabel = (value: string) => {
  const date = parseEventDate(value);
  return date ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date) : "Data a confirmar";
};
const eventPrice = (event: Evento) => event.isFree === true ? "Gratuito" : typeof event.priceCents === "number" && Number.isFinite(event.priceCents) && event.priceCents > 0 ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(event.priceCents / 100) : "Consulte ingressos";

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
  const heroPosters = useRef<(HTMLDivElement | null)[]>([]);
  const discovery = useRef<HTMLElement>(null);
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
      {enableDepth && <HomeScrollScene container={scrollContainer} hero={hero} mapPlane={mapPlane} pinPlane={pinPlane} ticketPlane={ticketPlane} heroPosters={heroPosters} featured={featuredSection} cards={featuredCards} cardKey={cardKey} discovery={discovery} />}
      <div className={styles.sceneContinuity} aria-hidden="true"><svg viewBox="0 0 1200 2200" preserveAspectRatio="none"><path d="M980 -100C310 200 1120 540 600 880S40 1300 680 1590S1180 1910 580 2300" /></svg></div>
      <section ref={hero} className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroCopy} data-home-copy>
          <h1 id="home-title"><span className={styles.headingMask}><span data-home-heading-line>Bons momentos.</span></span><span className={styles.headingMask}><span data-home-heading-line>Mais perto.</span></span></h1>
          <p>Shows, encontros e novas experiências. Descubra o que acontece ao seu redor e encontre seu próximo evento.</p>
          <div className={styles.heroActions}>
            <a href="#home-discovery" onClick={navigateWithinHome} className={styles.primaryAction}>Explorar mapa <ArrowDown size={18} aria-hidden="true" /></a>
            <Link href="/EventsCreated" className={styles.secondaryAction}>Ver agenda <ArrowUpRight size={18} aria-hidden="true" /></Link>
          </div>
        </div>
        <div className={styles.art} aria-label="Eventos em destaque">
          <div ref={mapPlane} className={styles.mapPlane} aria-hidden="true">
            <svg viewBox="0 0 500 400" fill="none" className={styles.streetGrid}>
              <path d="M-20 80L520 230M-20 185L520 335M80-20L-25 420M195-20L90 420M310-20L205 420M425-20L320 420M540-20L435 420" />
              <defs><clipPath id="visitor-home-route"><rect data-home-route-reveal width="500" height="400" /></clipPath></defs>
              <path d="M-10 275L280 125L520 190" clipPath="url(#visitor-home-route)" className={styles.routeLine} />
            </svg>
            <span className={styles.mapDot} />
            <span className={styles.mapDotSecondary} />
          </div>
          <div ref={pinPlane} className={styles.heroGlow} aria-hidden="true" />
          <div ref={ticketPlane} className={styles.heroHalo} aria-hidden="true" />
          {loading ? [0, 1, 2].map(index => <div key={index} className={`${styles.heroPoster} ${styles.heroPosterSkeleton}`} data-home-photo-plane={index} aria-hidden="true" />) : featured.map((event, index) => <div key={event.id} ref={node => { heroPosters.current[index] = node; }} className={styles.heroPoster} data-home-photo-plane={index}>
            <Link href={`/eventos/${event.id}`} className={styles.heroPosterInner}>
              <HomeEventImage banner={event.banner} index={index} sizes="(max-width: 767px) 44vw, (max-width: 1099px) 230px, 280px" priority={index === 0} className={styles.heroPhoto} />
              <div className={styles.photoShine} aria-hidden="true" />
              <div className={styles.heroPosterCaption}><span>{dateLabel(event.dataInicio)}</span><strong>{event.nome}</strong></div>
            </Link>
          </div>)}
          {!loading && featured.length === 0 && <div className={styles.heroArtEmpty}><CalendarDays size={28} aria-hidden="true" /><p>{loadError ? "Não foi possível carregar os eventos." : "Os próximos eventos aparecerão aqui."}</p></div>}
        </div>
        <a href="#home-featured" onClick={navigateWithinHome} className={styles.scrollCue}><ArrowDown size={15} aria-hidden="true" /> Continue explorando</a>
      </section>

      <section ref={featuredSection} id="home-featured" tabIndex={-1} className={styles.featured} aria-labelledby="home-featured-title">
        <div className={styles.featuredInner}>
        <div className={styles.sectionHeading}>
          <div><h2 id="home-featured-title"><span className={styles.headingMask}><span data-home-heading-line>A próxima experiência</span></span><span className={styles.headingMask}><span data-home-heading-line>pode estar aqui.</span></span></h2><p>Conheça alguns dos eventos da agenda.</p></div>
          <Link href="/EventsCreated" className={styles.secondaryAction}>Toda a agenda <ArrowUpRight size={18} aria-hidden="true" /></Link>
        </div>
        <div className={styles.galleryStage} data-home-gallery-stage><div className={styles.galleryFloor} data-home-gallery-floor aria-hidden="true" /><div className={styles.cards}>
          {loading ? [0, 1, 2].map(item => <div key={item} aria-hidden="true" className={styles.skeleton}><div className={styles.skeletonPoster} /><div className={styles.skeletonBody}><span /><span /><span /></div></div>) : featured.map((event, index) => {
            return <article ref={node => { featuredCards.current[index] = node; }} key={event.id} className={styles.eventCard}>
              <InteractiveSurface className={styles.cardSurface}><Link href={`/eventos/${event.id}`} className={styles.cardLink}>
                <div className={styles.poster}>
                  <HomeEventImage banner={event.banner} index={index} sizes="(max-width: 767px) calc(100vw - 48px), (max-width: 1099px) 30vw, 32vw" className={styles.eventPhoto} />
                  <span className={styles.dateBadge}>{dateLabel(event.dataInicio)}</span>
                </div>
                <div className={styles.cardBody}>
                  {(event.category || event.startTime) && <div className={styles.eventMeta}>{event.category && <span>{event.category}</span>}{event.startTime && <span>{event.startTime}</span>}</div>}
                  <h3>{event.nome}</h3>
                  <p><MapPin size={14} aria-hidden="true" /><span>{event.endereco || "Local a confirmar"}</span></p>
                  <span className={styles.eventPrice}>{eventPrice(event)}</span>
                  <span className={styles.cardAction}>Conhecer evento <ArrowUpRight size={17} aria-hidden="true" /></span>
                </div>
              </Link></InteractiveSurface>
            </article>;
          })}
          {!loading && featured.length === 0 && <div className={styles.empty}><CalendarDays size={28} aria-hidden="true" /><p>{loadError ? "A agenda não carregou. Você pode tentar novamente no mapa abaixo." : "Explore o mapa para encontrar novos eventos."}</p><a href="#home-discovery" onClick={navigateWithinHome} className={styles.secondaryAction}>Explorar mapa <ArrowDown size={18} aria-hidden="true" /></a></div>}
        </div>
        </div>
        {loading && <span role="status" className="sr-only">Carregando destaques da agenda…</span>}
        </div>
      </section>

      <section ref={discovery} className={styles.discoveryIntro} aria-labelledby="home-discovery-intro">
        <div className={styles.discoveryBackdrop} data-home-discovery-backdrop aria-hidden="true" />
        <div className={styles.cityStage} aria-hidden="true"><div className={styles.cityPlane} data-home-city-plane>
          <svg viewBox="0 0 800 480" fill="none" preserveAspectRatio="none">
            <path className={styles.cityRiver} d="M-20 350C130 230 230 420 420 330S650 220 830 270V500H-20Z" />
            <g className={styles.cityBlocks}><rect x="90" y="80" width="110" height="80" rx="12" /><rect x="300" y="70" width="125" height="90" rx="12" /><rect x="520" y="70" width="150" height="85" rx="12" /><rect x="90" y="230" width="110" height="85" rx="12" /><rect x="290" y="230" width="120" height="65" rx="12" /><rect x="525" y="230" width="145" height="60" rx="12" /></g>
            <g className={styles.cityStreets}><path d="M0 190H800M240 0V480M470 0V480M720 0V480" /><path d="M0 55H800M45 0V480" /></g>
            <path className={styles.cityRoute} d="M150 275H240V190H470V120H600" />
            <g className={styles.cityMarker}><circle cx="150" cy="275" r="11" /><circle cx="370" cy="190" r="11" /><circle cx="600" cy="120" r="11" /></g>
          </svg>
          <span className={styles.cityRaisedPin} data-home-city-marker><MapPin size={34} /></span>
        </div></div>
        <div className={styles.discoveryCopy} data-home-discovery-copy>
        <span className={styles.discoveryPin} data-home-discovery-pin><MapPin size={22} aria-hidden="true" /></span>
        <h2 id="home-discovery-intro"><span className={styles.headingMask}><span data-home-heading-line>Escolha o seu lugar.</span></span><span className={styles.headingMask}><span data-home-heading-line>Encontre o seu evento.</span></span></h2>
        <p>Use o mapa, busque por nome ou filtre a agenda. A descoberta começa com você.</p>
        <a href="#home-discovery" onClick={navigateWithinHome} className={styles.secondaryAction}>Ir para o mapa <ArrowDown size={18} aria-hidden="true" /></a>
        </div>
      </section>
    </div>
  );
}
