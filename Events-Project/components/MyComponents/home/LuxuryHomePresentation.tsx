"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowDown, ArrowUpRight, CalendarDays, MapPin, Ticket } from "lucide-react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform, type Variants } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import type { Evento } from "@/types";
import type { DiscoveryPeriod } from "@/lib/discoveryPeriod";
import { eventInstant } from "@/lib/eventTime";
import type { HomePresentationProps } from "./HomePresentation";
import { HomeEventImage } from "./HomeEventImage";
import { HeroCarousel, HeroSearch, type HeroSearchValues } from "./HeroDiscovery";
import { useLoggedHomeData } from "./useLoggedHomeData";
import LoggedHomeAgenda from "./LoggedHomeAgenda";
import styles from "./LuxuryHome.module.css";

function dateParts(event: Evento) {
  const date = eventInstant(event.dataInicio, event.startTime, event.timezone);
  if (!date) return { day: "—", month: "Em breve", full: "Data a confirmar" };
  const timeZone = event.timezone || "America/Sao_Paulo";
  return {
    day: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", timeZone }).format(date),
    month: new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone }).format(date).replace(".", ""),
    full: new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone }).format(date),
  };
}

function eventPrice(event: Evento) {
  if (event.isFree) return "Entrada gratuita";
  if (typeof event.priceCents === "number" && Number.isFinite(event.priceCents) && event.priceCents > 0) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(event.priceCents / 100);
  }
  return "Consulte ingressos";
}

/** Event links retain native navigation and keyboard behavior. */
function HeroParallax({ container, target, children }: { container: RefObject<HTMLDivElement>; target: RefObject<HTMLElement>; children: ReactNode }) {
  const { scrollYProgress } = useScroll({ container, target, offset: ["start start", "end start"] });
  const offset = useTransform(scrollYProgress, [0, 1], [0, 18]);
  const y = useSpring(offset, { stiffness: 120, damping: 30 });
  return <motion.div style={{ y }} data-home-motion>{children}</motion.div>;
}

function EventCard({ event, index, count }: { event: Evento; index: number; count: number }) {
  const reduced = useReducedMotion();
  const date = dateParts(event);
  return <motion.article className={styles.eventCard} whileHover={reduced ? undefined : { y: -4 }} whileTap={reduced ? undefined : { scale: .99 }} transition={{ duration: .2 }} data-home-motion>
    <Link href={`/eventos/${encodeURIComponent(event.id)}`} className={styles.cardLink}>
      <div className={styles.eventImage}>
        <HomeEventImage banner={event.banner} category={event.category} index={index} sizes={count === 1 ? "(max-width: 767px) calc(100vw - 40px), 46vw" : count === 2 ? "(max-width: 639px) calc(100vw - 40px), 46vw" : "(max-width: 639px) calc(100vw - 40px), (max-width: 1099px) 44vw, 30vw"} className={styles.banner} />
        <span className={styles.dateBadge} aria-label={date.full}><strong>{date.day}</strong><span>{date.month}</span></span>
        {event.category && <span className={styles.category}>{event.category}</span>}
      </div>
      <div className={styles.eventBody}>
        <p className={styles.eventTime}><CalendarDays size={14} aria-hidden="true" />{date.full}{event.startTime && `, ${event.startTime}`}</p>
        <h3>{event.nome}</h3>
        <p className={styles.eventLocation}><MapPin size={15} aria-hidden="true" /><span>{event.endereco || "Local a confirmar"}</span></p>
        <div className={styles.cardFooter}><span>{eventPrice(event)}</span><span className={styles.cardAction}>{event.isFree ? "Ver inscrição" : "Ver ingressos"} <ArrowUpRight size={17} aria-hidden="true" /></span></div>
      </div>
    </Link>
  </motion.article>;
}

/** Count only public data already received by the home, with a static accessible value. */
function Stat({ value, label, description, loading }: { value: number; label: string; description: string; loading: boolean }) {
  const node = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = node.current;
    if (!element || loading || !value || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      const start = performance.now();
      const count = (now: number) => {
        const progress = Math.min(1, (now - start) / 900);
        element.textContent = new Intl.NumberFormat("pt-BR").format(Math.round(value * (1 - (1 - progress) ** 3)));
        if (progress < 1) frame = requestAnimationFrame(count);
      };
      frame = requestAnimationFrame(count);
    }, { threshold: .3 });
    observer.observe(element);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [value, loading]);
  return <div className={styles.stat}>
    <span className={styles.statValue} aria-hidden="true" ref={node}>{loading ? "—" : new Intl.NumberFormat("pt-BR").format(value)}</span>
    <span className="sr-only">{loading ? "Carregando" : value} {label}.</span>
    <h3 aria-hidden="true">{label}</h3><p>{description}</p>
  </div>;
}

type LuxuryHomePresentationProps = HomePresentationProps & {
  period: DiscoveryPeriod;
  searchValue: string;
  categoryValue: string;
  periodLinks: { label: string; value: DiscoveryPeriod; href: string }[];
  onPeriodChange: (period: DiscoveryPeriod) => void;
  onQuickSearch: (values: HeroSearchValues) => void;
};

export function LuxuryHomePresentation({ events, loading, loadError, scrollContainer, period, periodLinks, onPeriodChange, onQuickSearch, searchValue, categoryValue }: LuxuryHomePresentationProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const ticketStack = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [parallax, setParallax] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1100px) and (hover: hover) and (prefers-reduced-motion: no-preference)");
    const sync = () => setParallax(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const reveal: Variants = {
    rest: { opacity: reduced ? 1 : .85, y: reduced ? 0 : 12 },
    visible: { opacity: 1, y: 0, transition: { duration: reduced ? 0 : .45, ease: "easeOut" } },
  };
  const stagger: Variants = { visible: { transition: { staggerChildren: reduced ? 0 : .065 } } };
  const viewport = { root: scrollContainer, once: true, amount: .12 };
  const { status } = useSession();
  const data = useLoggedHomeData(events, loading, loadError);
  const [greeting, setGreeting] = useState("Encontre novas histórias na cidade");
  const authenticated = status === "authenticated";
  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 5 ? "A noite ainda reserva encontros" : hour < 12 ? "Um novo dia, novas possibilidades" : hour < 18 ? "A tarde convida a novos encontros" : "A noite está só começando");
  }, []);
  const publicUpcoming = useMemo(() => {
    const now = new Date();
    return Array.from(new Map(events.filter(event => {
      const end = eventInstant(event.dataFim, event.endTime, event.timezone, "23:59");
      return event.status === "PUBLISHED" && end && end >= now;
    }).map(event => [event.id, event])).values());
  }, [events]);
  const stats = useMemo(() => ({
    events: publicUpcoming.length,
    places: new Set(publicUpcoming.map(event => event.endereco?.trim()).filter(Boolean)).size,
    categories: new Set(publicUpcoming.map(event => event.category?.trim()).filter(Boolean)).size,
  }), [publicUpcoming]);
  const suggestions = data.suggestions.slice(0, 6);
  const heroSuggestions = suggestions.slice(0, 5);
  const heroEventIds = new Set(heroSuggestions.map(({ event }) => event.id));
  const remainingSuggestions = suggestions.filter(({ event }) => !heroEventIds.has(event.id));
  const gallerySuggestions = remainingSuggestions.length >= 2 ? remainingSuggestions : suggestions;
  const navigate = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const container = scrollContainer.current, target = document.getElementById(event.currentTarget.hash.slice(1));
    if (!container || !target || !container.contains(target)) return;
    event.preventDefault();
    const requestedPeriod = new URL(event.currentTarget.href).searchParams.get("periodo");
    const url = new URL(window.location.href);
    if (requestedPeriod === "hoje" || requestedPeriod === "fim-de-semana" || requestedPeriod === "mes") {
      onPeriodChange(requestedPeriod);
      url.searchParams.set("periodo", requestedPeriod);
    }
    const top = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 16;
    container.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${event.currentTarget.hash}`);
    target.focus({ preventScroll: true });
  };
  return <div ref={sectionRef} className={styles.presentation} data-luxury-home>
    <section ref={heroRef} className={styles.hero} aria-labelledby="luxury-home-title" data-scroll-hero>
      <div className={styles.heroPin} data-scroll-hero-pin>
      <motion.div className={styles.heroCopy} data-scroll-copy initial="rest" animate="visible" variants={stagger}>
        <motion.p variants={reveal} data-home-motion className={styles.greeting}>{authenticated && data.sessionName && <><span className={styles.greetingName}>{data.sessionName.split(" ")[0]}</span>, </>}{greeting}.</motion.p>
        <motion.h1 variants={reveal} data-home-motion id="luxury-home-title">Descubra o que acontece<br />perto de você.</motion.h1>
        <motion.p variants={reveal} data-home-motion className={styles.heroDescription}>Encontre eventos, conheça novos lugares e escolha como aproveitar a cidade.</motion.p>
        <motion.div variants={reveal} data-home-motion><HeroSearch events={publicUpcoming} period={period} searchValue={searchValue} categoryValue={categoryValue} onSearch={onQuickSearch} /></motion.div>
        <motion.div variants={reveal} data-home-motion className={styles.actions}><a href="#luxury-events" onClick={navigate} className={styles.primaryAction}>Encontrar um evento <ArrowUpRight size={18} aria-hidden="true" /></a><a href="#home-discovery" onClick={navigate} className={styles.secondaryAction}>Explorar no mapa <MapPin size={17} aria-hidden="true" /></a></motion.div>
        <motion.nav variants={reveal} data-home-motion className={styles.quickPeriods} aria-label="Buscar eventos por período">{periodLinks.map(link => <a key={link.value} href={link.href} onClick={navigate} aria-current={period === link.value ? "true" : undefined}>{link.label}</a>)}</motion.nav>
      </motion.div>
      <motion.div className={styles.heroShowcase} aria-busy={loading} initial="rest" animate="visible" variants={reveal} data-home-motion>
        {parallax && !reduced ? <HeroParallax container={scrollContainer} target={heroRef}><HeroCarousel events={heroSuggestions.map(({ event }) => event)} loading={loading} loadError={loadError} onExplore={navigate} /></HeroParallax> : <HeroCarousel events={heroSuggestions.map(({ event }) => event)} loading={loading} loadError={loadError} onExplore={navigate} />}
      </motion.div>
      <div className={styles.heroBottom}><a href="#luxury-events" onClick={navigate} className={styles.scrollCue}><ArrowDown size={16} aria-hidden="true" />Descubra o que vem a seguir</a></div>
      </div>
    </section>

    <section id="luxury-events" tabIndex={-1} className={styles.events} aria-labelledby="luxury-events-title" data-scroll-gallery>
      <div className={styles.galleryPin} data-scroll-gallery-pin>
      <motion.div className={styles.sectionHeader} initial="rest" whileInView="visible" viewport={viewport} variants={reveal} data-home-motion><div><p className={styles.sectionContext}>{authenticated ? "Escolhidos para você" : "O que vem por aí"}</p><h2 id="luxury-events-title" data-scroll-heading>Eventos para descobrir</h2><p>Uma seleção de eventos publicados para você explorar.</p></div><Link href="/EventsCreated" className={styles.secondaryAction}>Explorar toda a agenda <ArrowUpRight size={17} aria-hidden="true" /></Link></motion.div>
      {(loadError || (authenticated && data.recommendationsError)) && <div className={styles.notice} role="status"><p>{suggestions.length ? "Não foi possível atualizar todas as sugestões. Você ainda pode explorar os eventos disponíveis." : "Não foi possível carregar as sugestões agora."}</p>{authenticated && data.recommendationsError ? <button type="button" onClick={data.retryRecommendations}>Tentar novamente</button> : <a href="#home-discovery" onClick={navigate}>Tentar novamente no mapa <ArrowDown size={15} aria-hidden="true" /></a>}</div>}
      <div className={styles.galleryStage} data-scroll-viewport>
      <motion.div className={styles.eventGrid} data-count={loading ? 3 : gallerySuggestions.length} aria-busy={loading} data-scroll-track initial="rest" whileInView="visible" viewport={viewport} variants={stagger}>
        {loading ? [0,1,2].map(index => <div key={index} className={styles.skeleton} aria-hidden="true"><div /><span /><span /><span /></div>) : gallerySuggestions.map(({ event }, index) => <motion.div key={event.id} className={styles.scrollCard} data-scroll-card variants={reveal} data-home-motion><EventCard event={event} index={index} count={gallerySuggestions.length} /></motion.div>)}
        {!loading && gallerySuggestions.length === 0 && <div className={styles.empty}><Ticket size={30} aria-hidden="true" /><h3>Novos encontros estão por vir.</h3><p>Os novos eventos publicados aparecerão aqui. Explore o mapa para consultar a agenda disponível.</p><a href="#home-discovery" onClick={navigate} className={styles.secondaryAction}>Abrir mapa <ArrowDown size={16} aria-hidden="true" /></a></div>}
      </motion.div>
      </div>
      {loading && <span className="sr-only" role="status">Carregando eventos…</span>}
      </div>
    </section>

    {stats.events >= 3 && <motion.section className={styles.highlights} aria-labelledby="luxury-highlights-title" initial="rest" whileInView="visible" viewport={viewport} variants={reveal} data-home-motion><div className={styles.highlightHeading}><h2 id="luxury-highlights-title">Uma cidade.<br />Muitas possibilidades.</h2><p>Explore o que está publicado na agenda agora.</p></div><div className={styles.stats} aria-busy={loading}>{loadError ? <p className={styles.statsUnavailable}>Os destaques serão atualizados quando a agenda estiver disponível.</p> : <><Stat value={stats.events} label={stats.events === 1 ? "evento por vir" : "eventos por vir"} description="Publicados na agenda" loading={loading} /><Stat value={stats.places} label={stats.places === 1 ? "lugar para descobrir" : "lugares para descobrir"} description="Endereços da programação" loading={loading} /><Stat value={stats.categories} label={stats.categories === 1 ? "jeito de viver a cidade" : "jeitos de viver a cidade"} description="Categorias na programação" loading={loading} /></>}</div></motion.section>}

    {authenticated && <LoggedHomeAgenda events={data.saved} loading={data.agendaLoading} error={data.agendaError} onRetry={data.retryAgenda} stackRef={ticketStack} />}

    <motion.section className={styles.mapIntro} aria-labelledby="luxury-map-title" initial="rest" whileInView="visible" viewport={viewport} variants={reveal} data-home-motion>
      <div><h2 id="luxury-map-title">Encontre seu lugar na cidade.</h2><p>Veja os locais e filtre a programação no mapa.</p><a href="#home-discovery" onClick={navigate} className={styles.primaryAction}>Explorar no mapa <ArrowDown size={18} aria-hidden="true" /></a></div>
    </motion.section>
  </div>;
}
