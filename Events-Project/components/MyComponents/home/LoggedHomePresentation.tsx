"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, useId } from "react";
import { ArrowDown, ArrowUpRight, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import type { HomePresentationProps } from "./HomePresentation";
import { LoggedHomePoster } from "./LoggedHomePoster";

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
    {false && <LoggedHomeScrollScene container={scrollContainer} hero={hero} heroPosters={heroPosters} ringSection={ringSection} ring={ring} mapSection={mapSection} mapPlane={mapPlane} ticketStack={ticketStack} closing={closing} progressBar={progressBar} eventKey={`${cardKey}:${data.saved.map(event => event.id).join("|")}`} count={suggestions.length} onActive={setActive} />}
    <section ref={hero} className={styles.hero} aria-labelledby="logged-home-title">
      <div className={styles.beams} aria-hidden="true"><span /><span /></div>
      <div className={styles.sparks} aria-hidden="true">{[0,1,2,3,4,5,6,7].map(index => <i key={index} style={{ left: `${12 + index * 11}%`, top: `${18 + index % 3 * 22}%`, animationDelay: `${-index * .7}s` }} />)}</div>
      <div className={styles.heroGrid}><div className={styles.heroCopy}><p className={styles.greeting}>{greeting}{data.sessionName ? `, ${data.sessionName.split(" ")[0]}` : ""}</p><p className={styles.today}>{today || "Seu próximo momento começa aqui"}</p><h1 id="logged-home-title">Sua próxima<br />boa história.</h1><p className={styles.description}>Um show, um encontro, um lugar novo. Encontre o que combina com você e transforme planos em bons momentos.</p><div className={styles.actions}><a className={styles.primaryAction} href="#home-for-you" onClick={navigate}>Encontrar meu evento <ArrowDown size={18} aria-hidden="true" /></a><a className={styles.secondaryAction} href="#home-discovery" onClick={navigate}>Abrir mapa <MapPin size={18} aria-hidden="true" /></a></div></div>
      <div className={styles.stage} aria-hidden="true"><div className={styles.floor} /><span className={styles.orb} /><span className={styles.orbSecondary} />{[1,2,0].map((eventIndex, position) => <div key={position} ref={node => { heroPosters.current[position] = node; }} className={`${styles.float} ${styles[`float${position}`]}`}><div className={styles.bob}>{suggestions[eventIndex] ? <LoggedHomePoster event={suggestions[eventIndex].event} decorative priority={position === 2} /> : <div className={styles.posterPlaceholder} />}</div></div>)}</div></div>
      <a href="#home-for-you" onClick={navigate} className={styles.cue}><ArrowDown size={16} aria-hidden="true" /> Continue explorando</a>
    </section>
<section id="home-for-you" ref={ringSection} /><section ref={mapSection} /><section ref={closing} /></div>;
}
