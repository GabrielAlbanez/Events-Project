"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, useId } from "react";
import { ArrowDown, ArrowUpRight, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import type { HomePresentationProps } from "./HomePresentation";
import { LoggedHomePoster } from "./LoggedHomePoster";
import LoggedHomeAgenda from "./LoggedHomeAgenda";
import { useLoggedHomeData } from "./useLoggedHomeData";
import styles from "./LoggedHomeScroll.module.css";

const LoggedHomeScrollScene = dynamic(() => import("./LoggedHomeScrollScene"), { ssr: false });
function eventDate(date: string, time?: string | null) {
  const parsed = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return "Data a confirmar";
  return `${new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "UTC" }).format(parsed)}${time ? ` · ${time}` : ""}`;
}
export function LoggedHomePresentation({ events, loading, loadError, scrollContainer }: HomePresentationProps) {
  const data = useLoggedHomeData(events, loading, loadError);
  const routeClip = useId().replace(/:/g, "");
  const hero = useRef<HTMLElement>(null), ringSection = useRef<HTMLElement>(null), mapSection = useRef<HTMLElement>(null), closing = useRef<HTMLElement>(null);
  const heroPosters = useRef<(HTMLElement | null)[]>([]);
  const ring = useRef<HTMLDivElement>(null), mapPlane = useRef<HTMLDivElement>(null), ticketStack = useRef<HTMLDivElement>(null), progressBar = useRef<HTMLDivElement>(null);
  const [depth, setDepth] = useState(false), [active, setActive] = useState(0);
  const [greeting, setGreeting] = useState("Olá"), [today, setToday] = useState("");
  useEffect(() => {
    const now = new Date(), hour = now.getHours();
    setGreeting(hour < 5 ? "Boa madrugada" : hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite");
    setToday(new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(now));
    const media = window.matchMedia("(min-width: 1100px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    let timer: number | undefined;
    const update = () => { window.clearTimeout(timer); if (!media.matches) setDepth(false); else timer = window.setTimeout(() => setDepth(true), 250); };
    update(); media.addEventListener("change", update);
    return () => { window.clearTimeout(timer); media.removeEventListener("change", update); };
  }, []);
  const suggestions = data.suggestions.slice(0, 6);
  const selected = suggestions[Math.min(active, Math.max(0, suggestions.length - 1))];
  const cardKey = suggestions.map(item => item.event.id).join("|");
  const navigate = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const container = scrollContainer.current, target = document.getElementById(event.currentTarget.hash.slice(1));
    if (!container || !target || !container.contains(target)) return;
    event.preventDefault();
    const top = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    container.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${event.currentTarget.hash}`);
    target.focus({ preventScroll: true });
  };
  const choose = (index: number) => {
    setActive(index);
    if (ring.current) {
      ring.current.dataset.focusedIndex = String(index);
      if (depth) ring.current.style.transform = `translateZ(calc(-1 * var(--ring-radius))) rotateY(${-index * 360 / Math.max(1, suggestions.length)}deg)`;
      ring.current.dispatchEvent(new Event("home-ring-focus"));
      if (!depth) ring.current.children[index]?.scrollIntoView({ behavior: "auto", block: "nearest", inline: "center" });
    }
  };
  return <div className={styles.presentation} data-depth={depth || undefined}>
    <div ref={progressBar} className={styles.progress} aria-hidden="true" />
    {depth && <LoggedHomeScrollScene container={scrollContainer} hero={hero} heroPosters={heroPosters} ringSection={ringSection} ring={ring} mapSection={mapSection} mapPlane={mapPlane} ticketStack={ticketStack} closing={closing} progressBar={progressBar} eventKey={`${cardKey}:${data.saved.map(event => event.id).join("|")}`} count={suggestions.length} onActive={setActive} />}
    <section ref={hero} className={styles.hero} aria-labelledby="logged-home-title">
      <div className={styles.beams} aria-hidden="true"><span /><span /></div>
      <div className={styles.sparks} aria-hidden="true">{[0,1,2,3,4,5,6,7].map(index => <i key={index} style={{ left: `${12 + index * 11}%`, top: `${18 + index % 3 * 22}%`, animationDelay: `${-index * .7}s` }} />)}</div>
      <div className={styles.heroGrid}><div className={styles.heroCopy}><p className={styles.greeting}>{greeting}{data.sessionName ? `, ${data.sessionName.split(" ")[0]}` : ""}</p><p className={styles.today}>{today || "Seu próximo momento começa aqui"}</p><h1 id="logged-home-title">Sua próxima<br />boa história.</h1><p className={styles.description}>Um show, um encontro, um lugar novo. Encontre o que combina com você e transforme planos em bons momentos.</p><div className={styles.actions}><a className={styles.primaryAction} href="#home-for-you" onClick={navigate}>Encontrar meu evento <ArrowDown size={18} aria-hidden="true" /></a><a className={styles.secondaryAction} href="#home-discovery" onClick={navigate}>Abrir mapa <MapPin size={18} aria-hidden="true" /></a></div></div>
      <div className={styles.stage} aria-hidden="true"><div className={styles.floor} /><span className={styles.orb} /><span className={styles.orbSecondary} />{[1,2,0].map((eventIndex, position) => <div key={position} ref={node => { heroPosters.current[position] = node; }} className={`${styles.float} ${styles[`float${position}`]}`}><div className={styles.bob}>{suggestions[eventIndex] ? <LoggedHomePoster event={suggestions[eventIndex].event} decorative priority={position === 2} /> : <div className={styles.posterPlaceholder} />}</div></div>)}</div></div>
      <a href="#home-for-you" onClick={navigate} className={styles.cue}><ArrowDown size={16} aria-hidden="true" /> Continue explorando</a>
    </section>
    <section id="home-for-you" ref={ringSection} tabIndex={-1} className={styles.ringSection} data-count={suggestions.length} data-loading={data.recommendationsLoading || undefined} aria-labelledby="logged-recommendations-title">
      <div className={styles.pin}><div className={styles.sectionHeading}><span className={styles.sectionLabel}>Escolhas para você</span><h2 id="logged-recommendations-title">O próximo plano<br />tem a sua cara.</h2><p>Eventos da agenda, escolhidos a partir das suas descobertas.</p></div>
      {data.recommendationsError && suggestions.length > 0 && <div role="status" className={styles.fallbackNotice}><p>Suas recomendações estão indisponíveis. Exibimos próximos eventos da agenda.</p><button type="button" className={styles.secondaryAction} onClick={data.retryRecommendations}>Tentar novamente</button></div>}
      {data.recommendationsLoading ? <div className={styles.loadingCards} role="status" aria-label="Carregando recomendações">{[0,1,2].map(index => <div className={styles.posterPlaceholder} key={index} />)}</div> : suggestions.length ? <><div className={styles.ringStage}><div ref={ring} className={styles.ring} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { delete event.currentTarget.dataset.focusedIndex; event.currentTarget.dispatchEvent(new Event("home-ring-focus")); } }} style={{ "--ring-radius": `${suggestions.length > 2 ? Math.max(170, 120 / Math.tan(Math.PI / suggestions.length)) : 160}px` } as CSSProperties}>{suggestions.map(({ event }, index) => <article key={event.id} className={styles.ringCard} style={{ "--card-angle": `${index * 360 / suggestions.length}deg` } as CSSProperties} data-active={index === Math.min(active, suggestions.length - 1) || undefined}><Link href={`/eventos/${event.id}`} className={styles.posterLink} onFocus={() => choose(index)} aria-label={`Conhecer ${event.nome}`}><LoggedHomePoster event={event} /></Link></article>)}</div></div><div className={styles.ringPanel}><div aria-live="polite" aria-atomic="true"><h3>{selected?.event.nome}</h3><p>{selected && eventDate(selected.event.dataInicio, selected.event.startTime)}</p><p className={styles.location}><MapPin size={14} aria-hidden="true" />{selected?.event.endereco}</p><p className={styles.reason}>{selected?.reason}</p></div><div className={styles.panelActions}><div className={styles.ringControls}><button type="button" onClick={() => choose((active - 1 + suggestions.length) % suggestions.length)} aria-label="Evento anterior"><ChevronLeft size={18} /></button>{suggestions.map(({event},index) => <button key={event.id} type="button" className={styles.dot} onClick={() => choose(index)} aria-label={`Mostrar ${event.nome}`} aria-pressed={index === active}><span /></button>)}<button type="button" onClick={() => choose((active + 1) % suggestions.length)} aria-label="Próximo evento"><ChevronRight size={18} /></button></div>{selected && <Link href={`/eventos/${selected.event.id}`} className={styles.primaryAction}>Conhecer evento <ArrowUpRight size={18} aria-hidden="true" /></Link>}</div></div></> : <div className={styles.empty}><p>{data.recommendationsError ? "Não foi possível carregar suas recomendações." : "Novos planos estão a caminho. Explore a agenda no mapa."}</p>{data.recommendationsError ? <button className={styles.secondaryAction} onClick={data.retryRecommendations}>Tentar novamente</button> : <a className={styles.secondaryAction} href="#home-discovery" onClick={navigate}>Explorar mapa</a>}</div>}
      </div>
    </section>
    <section ref={mapSection} className={styles.mapSection} aria-labelledby="logged-map-title"><div className={styles.mapPin}><div className={styles.sectionHeading}><span className={styles.sectionLabel}>Encontre seu lugar</span><h2 id="logged-map-title">A cidade é o<br />seu próximo cenário.</h2><p>Veja onde os eventos acontecem. No mapa interativo, você pode buscar, filtrar e traçar sua rota.</p></div><div className={styles.mapStage}><div ref={mapPlane} className={styles.mapPlane}><svg viewBox="0 0 800 520" aria-hidden="true" preserveAspectRatio="none"><g className={styles.blocks}>{[[80,70],[245,65],[470,40],[615,120],[120,300],[410,330],[605,360]].map(([x,y],index) => <rect key={index} x={x} y={y} width={index%2 ? 100:120} height={70} rx={12} />)}</g><g className={styles.streets}><path d="M0 150L800 220M0 320L800 350M180 0L110 520M380 0L320 520M600 0L560 520" /></g><path className={styles.river} d="M0 420C200 360 300 470 470 435S700 390 800 455"/><defs><clipPath id={routeClip}><rect data-map-route-reveal x="0" y="0" width="800" height="520" /></clipPath></defs><path clipPath={`url(#${routeClip})`} className={styles.route} pathLength="1" d="M180 355C240 280 315 290 380 245S475 170 570 140" /></svg>{suggestions.slice(0,3).map(({event},index) => <div className={styles.mapMarker} key={event.id} style={{ left: `${[28,62,78][index]}%`,top:`${[64,32,66][index]}%` }}><span data-map-pin className={styles.mapMarkerPin}><MapPin size={20} aria-hidden="true" /></span><span data-map-note className={styles.mapChip}>{event.nome}</span></div>)}<span className={styles.mapCaption}>Ilustração da experiência de descoberta</span></div></div><div className={styles.mapFooter}><p>Os locais e as rotas reais estão no mapa interativo.</p><a href="#home-discovery" onClick={navigate} className={styles.secondaryAction}>Explorar mapa real <ArrowDown size={18} aria-hidden="true" /></a></div></div></section>
    <LoggedHomeAgenda events={data.saved} loading={data.agendaLoading} error={data.agendaError} onRetry={data.retryAgenda} stackRef={ticketStack} />
    <section ref={closing} className={styles.closing} aria-labelledby="logged-closing-title"><span className={styles.sectionLabel}>Mais perto do que você imagina</span><h2 id="logged-closing-title">Seu próximo momento<br />começa com uma escolha.</h2><div className={styles.actions}><a className={styles.primaryAction} href="#home-for-you" onClick={navigate}>Escolher meu evento <ArrowUpRight size={18} aria-hidden="true" /></a><a className={styles.secondaryAction} href="#home-discovery" onClick={navigate}>Ver no mapa <MapPin size={18} aria-hidden="true" /></a></div></section>
  </div>;
}
