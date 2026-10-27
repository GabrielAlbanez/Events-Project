"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowDown, ArrowUpRight, CalendarDays, MapPin, Ticket } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { Evento } from "@/types";
import type { DiscoveryPeriod } from "@/lib/discoveryPeriod";
import { eventInstant } from "@/lib/eventTime";
import type { HomePresentationProps } from "./HomePresentation";
import { HomeEventImage } from "./HomeEventImage";
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
function EventCard({ event, index, count }: { event: Evento; index: number; count: number }) {
  const date = dateParts(event);
  return <article className={styles.eventCard}>
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
  </article>;
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
  periodLinks: { label: string; value: DiscoveryPeriod; href: string }[];
  onPeriodChange: (period: DiscoveryPeriod) => void;
};

export function LuxuryHomePresentation({ events, loading, loadError, scrollContainer, period, periodLinks, onPeriodChange }: LuxuryHomePresentationProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const ticketStack = useRef<HTMLDivElement>(null);
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
  const heroSuggestions = suggestions.slice(0, 3);
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
    <section className={styles.hero} aria-labelledby="luxury-home-title" data-scroll-hero>
      <div className={styles.heroPin} data-scroll-hero-pin>
      <div className={styles.heroCopy} data-scroll-copy>
        <p className={styles.greeting}>{authenticated && data.sessionName && <><span className={styles.greetingName}>{data.sessionName.split(" ")[0]}</span>, </>}{greeting.charAt(0).toLocaleLowerCase("pt-BR") + greeting.slice(1)}.</p>
        <h1 id="luxury-home-title">Descubra o que acontece<br />perto de você.</h1>
        <p className={styles.heroDescription}>Encontre eventos, conheça novos lugares e escolha como aproveitar a cidade.</p>
        <div className={styles.actions}><a href="#luxury-events" onClick={navigate} className={styles.primaryAction}>Encontrar um evento <ArrowUpRight size={18} aria-hidden="true" /></a><a href="#home-discovery" onClick={navigate} className={styles.secondaryAction}>Explorar no mapa <MapPin size={17} aria-hidden="true" /></a></div>
        <nav className={styles.quickPeriods} aria-label="Buscar eventos por período">{periodLinks.map(link => <a key={link.value} href={link.href} onClick={navigate} aria-current={period === link.value ? "true" : undefined}>{link.label}</a>)}</nav>
      </div>
      <div className={styles.heroShowcase} data-count={loading ? 1 : heroSuggestions.length} aria-busy={loading}>
        {loading ? <div className={styles.heroPlaceholder} role="status"><span className="sr-only">Carregando eventos em destaque…</span></div> : heroSuggestions.map(({ event }, index) => {
          const date = dateParts(event);
          return <div key={event.id} className={styles.heroPosterWrap} data-scroll-poster><Link href={`/eventos/${encodeURIComponent(event.id)}`} className={styles.heroPoster} aria-label={`Conhecer ${event.nome}, ${date.full}`}>
            <div className={styles.heroPosterImage}>
              <HomeEventImage banner={event.banner} category={event.category} index={index} priority={index === 0} sizes="(max-width: 639px) 82vw, (max-width: 1099px) 370px, 30vw" className={styles.banner} />
              <span className={styles.dateBadge} aria-label={date.full}><strong>{date.day}</strong><span>{date.month}</span></span>
              {index > 0 && <span className={styles.heroPosterTitle} aria-hidden="true">{event.nome}</span>}
            </div>
            <div className={styles.heroPosterBody}>
              <p>{date.full}{event.startTime && `, ${event.startTime}`}</p>
              <h2>{event.nome}</h2>
              <span className={styles.heroPosterLocation}><MapPin size={14} aria-hidden="true" />{event.endereco || "Local a confirmar"}</span>
              <span className={styles.heroPosterAction}>Conhecer o evento <ArrowUpRight size={17} aria-hidden="true" /></span>
            </div>
          </Link></div>;
        })}
        {!loading && !suggestions.length && <div className={styles.heroPlaceholder}><Ticket size={36} aria-hidden="true" /><p>{loadError ? "Consulte os eventos disponíveis no mapa." : "Os destaques da agenda aparecem aqui."}</p><a href="#home-discovery" onClick={navigate} className={styles.secondaryAction}>Explorar agenda <ArrowUpRight size={17} aria-hidden="true" /></a></div>}
      </div>
      <div className={styles.heroBottom}><a href="#luxury-events" onClick={navigate} className={styles.scrollCue}><ArrowDown size={16} aria-hidden="true" />Descubra o que vem a seguir</a></div>
      </div>
    </section>

    <section id="luxury-events" tabIndex={-1} className={styles.events} aria-labelledby="luxury-events-title" data-scroll-gallery>
      <div className={styles.galleryPin} data-scroll-gallery-pin>
      <div className={styles.sectionHeader}><div><p className={styles.sectionContext}>{authenticated ? "Escolhidos para você" : "O que vem por aí"}</p><h2 id="luxury-events-title" data-scroll-heading>Eventos para descobrir</h2><p>Uma seleção de eventos publicados para você explorar.</p></div><Link href="/EventsCreated" className={styles.secondaryAction}>Explorar toda a agenda <ArrowUpRight size={17} aria-hidden="true" /></Link></div>
      {(loadError || (authenticated && data.recommendationsError)) && <div className={styles.notice} role="status"><p>{suggestions.length ? "Não foi possível atualizar todas as sugestões. Você ainda pode explorar os eventos disponíveis." : "Não foi possível carregar as sugestões agora."}</p>{authenticated && data.recommendationsError ? <button type="button" onClick={data.retryRecommendations}>Tentar novamente</button> : <a href="#home-discovery" onClick={navigate}>Tentar novamente no mapa <ArrowDown size={15} aria-hidden="true" /></a>}</div>}
      <div className={styles.galleryStage} data-scroll-viewport>
      <div className={styles.eventGrid} data-count={loading ? 3 : gallerySuggestions.length} aria-busy={loading} data-scroll-track>
        {loading ? [0,1,2].map(index => <div key={index} className={styles.skeleton} aria-hidden="true"><div /><span /><span /><span /></div>) : gallerySuggestions.map(({ event }, index) => <div key={event.id} className={styles.scrollCard} data-scroll-card><EventCard event={event} index={index} count={gallerySuggestions.length} /></div>)}
        {!loading && gallerySuggestions.length === 0 && <div className={styles.empty}><Ticket size={30} aria-hidden="true" /><h3>Novos encontros estão por vir.</h3><p>Os novos eventos publicados aparecerão aqui. Explore o mapa para consultar a agenda disponível.</p><a href="#home-discovery" onClick={navigate} className={styles.secondaryAction}>Abrir mapa <ArrowDown size={16} aria-hidden="true" /></a></div>}
      </div>
      </div>
      {loading && <span className="sr-only" role="status">Carregando eventos…</span>}
      </div>
    </section>

    {stats.events >= 3 && <section className={styles.highlights} aria-labelledby="luxury-highlights-title"><div className={styles.highlightHeading}><h2 id="luxury-highlights-title">Uma cidade.<br />Muitas possibilidades.</h2><p>Explore o que está publicado na agenda agora.</p></div><div className={styles.stats} aria-busy={loading}>{loadError ? <p className={styles.statsUnavailable}>Os destaques serão atualizados quando a agenda estiver disponível.</p> : <><Stat value={stats.events} label={stats.events === 1 ? "evento por vir" : "eventos por vir"} description="Publicados na agenda" loading={loading} /><Stat value={stats.places} label={stats.places === 1 ? "lugar para descobrir" : "lugares para descobrir"} description="Endereços da programação" loading={loading} /><Stat value={stats.categories} label={stats.categories === 1 ? "jeito de viver a cidade" : "jeitos de viver a cidade"} description="Categorias na programação" loading={loading} /></>}</div></section>}

    {authenticated && <LoggedHomeAgenda events={data.saved} loading={data.agendaLoading} error={data.agendaError} onRetry={data.retryAgenda} stackRef={ticketStack} />}

    <section className={styles.mapIntro} aria-labelledby="luxury-map-title">
      <div><h2 id="luxury-map-title">Encontre seu lugar na cidade.</h2><p>Veja os locais e filtre a programação no mapa.</p><a href="#home-discovery" onClick={navigate} className={styles.primaryAction}>Explorar no mapa <ArrowDown size={18} aria-hidden="true" /></a></div>
    </section>
  </div>;
}
