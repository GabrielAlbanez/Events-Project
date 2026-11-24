"use client";

import { FeaturedBadge } from "@/components/MyComponents/FeaturedBadge";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowDown, ArrowRight, BookmarkCheck, Clock, Map as MapIcon, MapPin, QrCode, Tag, Ticket } from "lucide-react";
import { LazyMotion, m, useReducedMotion, useScroll, useSpring, useTransform, type Variants } from "framer-motion";
import { loadAnimationFeatures } from "@/components/animations/config";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import type { Evento } from "@/types";
import type { DiscoveryPeriod } from "@/lib/discoveryPeriod";
import { eventInstant } from "@/lib/eventTime";
import { prioritizeFeatured } from "@/lib/promotions";
import type { HomePresentationProps } from "./HomePresentation";
import { HomeEventImage } from "./HomeEventImage";
import { HeroCarousel, HeroCategories, HeroSearch, HeroStats, type HeroSearchValues } from "./HeroDiscovery";
import { useLoggedHomeData } from "./useLoggedHomeData";
import LoggedHomeAgenda from "./LoggedHomeAgenda";
import styles from "./LuxuryHome.module.css";

function dateParts(event: Evento) {
  const date = eventInstant(event.dataInicio, event.startTime, event.timezone);
  if (!date) return { day: "—", month: "Em breve", weekday: "", full: "Data a confirmar" };
  const timeZone = event.timezone || "America/Sao_Paulo";
  return {
    day: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", timeZone }).format(date),
    month: new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone }).format(date).replace(".", ""),
    weekday: new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone }).format(date),
    full: new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone }).format(date),
  };
}

/** Price chip: "Grátis" or the ticket value; hidden when the event has no price information. */
function eventPrice(event: Evento): string | null {
  if (event.isFree) return "Grátis";
  if (typeof event.priceCents === "number" && Number.isFinite(event.priceCents) && event.priceCents > 0) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(event.priceCents / 100);
  }
  return null;
}

/** Highlighted word with the hand-drawn lime underline used across the home. */
function Highlight({ children }: { children: ReactNode }) {
  return <span className={styles.sectionHighlight}>{children}<svg viewBox="0 0 240 24" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M4 19 C 70 9, 150 4, 236 7" /></svg></span>;
}

const FEATURES = [
  { key: "map", Icon: MapIcon, tone: "lime", title: "Descubra no mapa", text: "Veja o que acontece perto de você e filtre por data, categoria e preço.", cta: "Abrir o mapa", href: "#home-discovery" },
  { key: "pix", Icon: QrCode, tone: "blue", title: "Ingresso por Pix em segundos", text: "Garanta seu lugar pagando com Pix e entre com o QR Code no celular.", cta: "Como funciona", href: "/conheca#participar" },
  { key: "saved", Icon: BookmarkCheck, tone: "lime", title: "Salve na sua agenda", text: "Guarde os eventos que interessam e receba lembretes antes de começar.", cta: "Ver eventos salvos", href: "/salvos" },
] as const;

/** Event links retain native navigation and keyboard behavior. */
function HeroParallax({ container, target, children }: { container: RefObject<HTMLDivElement>; target: RefObject<HTMLElement>; children: ReactNode }) {
  const { scrollYProgress } = useScroll({ container, target, offset: ["start start", "end start"] });
  const offset = useTransform(scrollYProgress, [0, 1], [0, 18]);
  const y = useSpring(offset, { stiffness: 120, damping: 30 });
  return <m.div style={{ y }} data-home-motion>{children}</m.div>;
}

function EventCard({ event, reason, index, count }: { event: Evento; reason?: string; index: number; count: number }) {
  const date = dateParts(event);
  const price = eventPrice(event);
  const sizes = count < 3 ? "(max-width: 639px) 84vw, 46vw" : "(max-width: 639px) 84vw, (max-width: 1099px) 46vw, 31vw";
  return <article className={styles.eventCard}>
    <Link href={`/eventos/${encodeURIComponent(event.id)}`} className={styles.cardLink}>
      <div className={styles.eventImage}>
        <HomeEventImage banner={event.banner} category={event.category} index={index} sizes={sizes} className={styles.banner} />
        {(event.category || event.featured) && <span className={styles.imagePills}>
          {event.category && <span className={styles.categoryPill}><Tag size={13} strokeWidth={2.4} aria-hidden="true" />{event.category}</span>}
          {event.featured && <FeaturedBadge className={styles.featuredPill} />}
        </span>}
      </div>
      <div className={styles.eventBody}>
        <div className={styles.eventHead}>
          <span className={styles.dateBlock} aria-hidden="true"><strong>{date.day}</strong><span>{date.month}</span></span>
          <div className={styles.eventHeadText}>
            <p className={styles.eventTime}><span className="sr-only">{date.full}, </span><Clock size={14} aria-hidden="true" /><span>{date.weekday || date.full}{event.startTime && ` • ${event.startTime}`}</span></p>
            <h3>{event.nome}</h3>
          </div>
        </div>
        {reason && <p className={styles.recommendationReason}>{reason}</p>}
        <p className={styles.eventLocation}><MapPin size={15} aria-hidden="true" /><span>{event.endereco || "Local a confirmar"}</span></p>
        <div className={styles.cardFooter}>{price && <span className={styles.priceChip} data-free={event.isFree ? "true" : undefined}>{price}</span>}<span className={styles.cardAction}>Ver detalhes <ArrowRight size={16} aria-hidden="true" /></span></div>
      </div>
    </Link>
  </article>;
}

type LuxuryHomePresentationProps = HomePresentationProps & {
  period: DiscoveryPeriod;
  searchValue: string;
  categoryValue: string;
  periodLinks: { label: string; value: DiscoveryPeriod; href: string }[];
  onPeriodChange: (period: DiscoveryPeriod) => void;
  onQuickSearch: (values: HeroSearchValues) => void;
};

export function LuxuryHomePresentation({ events, loading, loadError, scrollContainer, period, onPeriodChange, onQuickSearch, searchValue, categoryValue }: LuxuryHomePresentationProps) {
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
  const suggestions = data.suggestions.slice(0, 6);
  const heroSuggestions = suggestions.slice(0, suggestions.length > 1 ? Math.min(3, suggestions.length - 1) : 1);
  const heroEventIds = new Set(heroSuggestions.map(({ event }) => event.id));
  const remainingSuggestions = suggestions.filter(({ event }) => !heroEventIds.has(event.id));
  // Paid highlights lead "Mais eventos" (up to 3, by date) even when the recommender did not pick them; the list size stays the same.
  const shownIds = new Set([...heroSuggestions, ...remainingSuggestions].map(({ event }) => event.id));
  const featuredExtras = publicUpcoming.filter(event => event.featured && !shownIds.has(event.id)).map(event => ({ event, reason: undefined as string | undefined }));
  const rankedGallery = prioritizeFeatured([...remainingSuggestions, ...featuredExtras].map(item => ({ ...item, featured: item.event.featured })));
  const gallerySuggestions = rankedGallery.slice(0, Math.max(remainingSuggestions.length, Math.min(3, rankedGallery.length)));
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
  // LazyMotion + m: animation features load on demand instead of the full motion bundle (FE-06).
  return <LazyMotion features={loadAnimationFeatures}><div ref={sectionRef} className={styles.presentation} data-luxury-home>
    <section ref={heroRef} className={styles.hero} aria-labelledby="luxury-home-title" data-scroll-hero>
      <span className={styles.heroRing} aria-hidden="true" />
      <div className={styles.heroPin} data-scroll-hero-pin>
      <m.div className={styles.heroCopy} data-scroll-copy initial="rest" animate="visible" variants={stagger}>
        <m.p variants={reveal} data-home-motion className={styles.greeting}>{authenticated && data.sessionName && <><span className={styles.greetingName}>{data.sessionName.split(" ")[0]}</span>, </>}{greeting}.</m.p>
        <m.h1 variants={reveal} data-home-motion id="luxury-home-title" className={styles.heroTitle}><span>Descubra o que</span>{" "}<span>acontece <span className={styles.heroHighlight}>perto<svg viewBox="0 0 240 24" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M4 19 C 70 9, 150 4, 236 7" /></svg></span></span>{" "}<span>de você.</span></m.h1>
        <m.p variants={reveal} data-home-motion className={styles.heroDescription}>Encontre eventos, conheça novos lugares e escolha como aproveitar a cidade.</m.p>
        <m.div variants={reveal} data-home-motion><HeroSearch events={publicUpcoming} period={period} searchValue={searchValue} categoryValue={categoryValue} onSearch={onQuickSearch} /></m.div>
        <m.div variants={reveal} data-home-motion><HeroCategories events={publicUpcoming} loading={loading} onSelect={category => onQuickSearch({ location: searchValue, period, category })} onExplore={navigate} /></m.div>
      </m.div>
      <m.div className={styles.heroShowcase} aria-busy={loading} initial="rest" animate="visible" variants={reveal} data-home-motion>
        {parallax && !reduced ? <HeroParallax container={scrollContainer} target={heroRef}><HeroCarousel events={heroSuggestions.map(({ event }) => event)} loading={loading} loadError={loadError} onExplore={navigate} /></HeroParallax> : <HeroCarousel events={heroSuggestions.map(({ event }) => event)} loading={loading} loadError={loadError} onExplore={navigate} />}
      </m.div>
      <m.div className={styles.heroStats} initial="rest" animate="visible" variants={reveal} data-home-motion><HeroStats events={publicUpcoming} loading={loading} loadError={loadError} /></m.div>
      </div>
    </section>

    <section id="luxury-events" tabIndex={-1} className={styles.events} aria-labelledby="luxury-events-title" data-scroll-gallery data-compact={!loading && suggestions.length === 1}>
      <div className={styles.galleryPin} data-scroll-gallery-pin>
      <m.div className={styles.sectionHeader} initial="rest" whileInView="visible" viewport={viewport} variants={reveal} data-home-motion><div><p className={styles.sectionContext}>{authenticated ? "Escolhidos para você" : "O que vem por aí"}</p><h2 id="luxury-events-title" data-scroll-heading>{!loading && suggestions.length === 1 ? <>Sua próxima <Highlight>descoberta</Highlight></> : <>Mais eventos para <Highlight>descobrir</Highlight></>}</h2><p>{!loading && suggestions.length === 1 ? "O evento disponível está em destaque acima. Consulte os detalhes ou encontre sua localização no mapa." : authenticated ? "Sugestões por eventos salvos, organizadores seguidos e proximidade dos seus eventos. O motivo aparece em cada cartão." : "Continue explorando os próximos eventos publicados na agenda."}</p></div><Link href="/EventsCreated" className={styles.sectionLink}>Explorar toda a agenda <ArrowRight size={16} aria-hidden="true" /></Link></m.div>
      {(loadError || (authenticated && data.recommendationsError)) && <div className={styles.notice} role="status"><p>{suggestions.length ? "Não foi possível atualizar todas as sugestões. Você ainda pode explorar os eventos disponíveis." : "Não foi possível carregar as sugestões agora."}</p>{authenticated && data.recommendationsError ? <button type="button" onClick={data.retryRecommendations}>Tentar novamente</button> : <a href="#home-discovery" onClick={navigate}>Tentar novamente no mapa <ArrowDown size={15} aria-hidden="true" /></a>}</div>}
      <div className={styles.galleryStage} data-scroll-viewport>
      <m.div className={styles.eventGrid} data-count={loading ? 3 : gallerySuggestions.length} aria-busy={loading} data-scroll-track initial="rest" whileInView="visible" viewport={viewport} variants={stagger}>
        {loading ? [0,1,2].map(index => <div key={index} className={styles.skeleton} aria-hidden="true"><div /><span /><span /><span /></div>) : gallerySuggestions.map(({ event, reason }, index) => <m.div key={event.id} className={styles.scrollCard} data-scroll-card variants={reveal} data-home-motion><EventCard event={event} reason={authenticated ? reason : undefined} index={index} count={gallerySuggestions.length} /></m.div>)}
        {!loading && suggestions.length === 0 && <div className={styles.empty}><Ticket size={30} aria-hidden="true" /><h3>Novos encontros estão por vir.</h3><p>Os novos eventos publicados aparecerão aqui. Explore o mapa para consultar a agenda disponível.</p><a href="#home-discovery" onClick={navigate} className={styles.secondaryAction}>Abrir mapa <ArrowDown size={16} aria-hidden="true" /></a></div>}
      </m.div>
      </div>
      {loading && <span className="sr-only" role="status">Carregando eventos…</span>}
      </div>
    </section>

    <m.section className={styles.features} aria-labelledby="luxury-highlights-title" initial="rest" whileInView="visible" viewport={viewport} variants={reveal} data-home-motion>
      <div className={styles.sectionHeader}><div><p className={styles.sectionContext}>Tudo em um só lugar</p><h2 id="luxury-highlights-title">Uma cidade. Muitas <Highlight>possibilidades</Highlight>.</h2><p>Do mapa ao ingresso, o EventMap acompanha cada passo do seu programa.</p></div></div>
      <ul className={styles.featureGrid}>
        {FEATURES.map(({ key, Icon, tone, title, text, cta, href }) => <li key={key} className={styles.featureCard}>
          <span className={styles.featureIcon} data-tone={tone} aria-hidden="true"><Icon size={24} strokeWidth={2} /></span>
          <h3>{title}</h3>
          <p>{text}</p>
          {href.startsWith("#") ? <a href={href} onClick={navigate} className={styles.featureLink}>{cta} <ArrowRight size={16} aria-hidden="true" /></a> : <Link href={href} className={styles.featureLink}>{cta} <ArrowRight size={16} aria-hidden="true" /></Link>}
        </li>)}
      </ul>
    </m.section>

    {authenticated && <LoggedHomeAgenda events={data.saved} loading={data.agendaLoading} error={data.agendaError} onRetry={data.retryAgenda} stackRef={ticketStack} />}

    <m.section className={styles.mapIntro} aria-labelledby="luxury-map-title" initial="rest" whileInView="visible" viewport={viewport} variants={reveal} data-home-motion>
      <div className={styles.mapBanner}>
        <span className={styles.mapRing} aria-hidden="true" />
        <span className={styles.mapBlob} aria-hidden="true" />
        <div className={styles.mapCopy}><h2 id="luxury-map-title">Encontre seu <Highlight>lugar</Highlight> na cidade.</h2><p>Veja os locais e filtre a programação no mapa.</p></div>
        <a href="#home-discovery" onClick={navigate} className={styles.primaryAction}>Explorar no mapa <ArrowDown size={18} aria-hidden="true" /></a>
      </div>
    </m.section>
  </div></LazyMotion>;
}
