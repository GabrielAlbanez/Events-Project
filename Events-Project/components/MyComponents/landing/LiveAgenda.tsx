"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { LandingEventImage } from "./LandingEventImage";
import styles from "./Playground.module.css";
import type { LandingCatalog, LandingEvent, LandingFigures } from "./landingData";
import { useMotionAllowed } from "./useLandingMotion";

/** `min`: só aparece a partir desse valor (nunca zero; "1 categoria" não diz nada). */
type Figure = { key: keyof LandingFigures; one: string; many: string; min: number };

/** Abaixo disso a faixa fica parada: com poucos eventos, o laço mostraria repetições demais. */
const MIN_LOOP = 6;

const FIGURES: Figure[] = [
  { key: "today", one: "evento acontecendo hoje", many: "eventos acontecendo hoje", min: 1 },
  { key: "nextWeek", one: "evento nos próximos 7 dias", many: "eventos nos próximos 7 dias", min: 1 },
  { key: "categories", one: "categoria na agenda", many: "categorias na agenda", min: 2 },
  { key: "free", one: "evento gratuito pela frente", many: "eventos gratuitos pela frente", min: 1 },
];

const COUNT_MS = 1000;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/** Número real renderizado já no servidor; ao entrar na tela, conta de 0 até ele (só sem movimento reduzido). */
function Counter({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionAllowed = useMotionAllowed();
  useEffect(() => {
    const node = ref.current;
    if (!node || !motionAllowed) return;
    // Um único requestAnimationFrame escreve o texto (sem re-render e sem carregar o motor de animação inteiro).
    let frame = 0;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      const started = performance.now();
      const tick = (time: number) => {
        const progress = Math.min(1, (time - started) / COUNT_MS);
        node.textContent = Math.round(value * easeOutCubic(progress)).toLocaleString("pt-BR");
        if (progress < 1) frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
    }, { threshold: 0.6 });
    observer.observe(node);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      node.textContent = value.toLocaleString("pt-BR");
    };
  }, [value, motionAllowed]);
  return <span ref={ref} aria-hidden="true">{value.toLocaleString("pt-BR")}</span>;
}

function AgendaCard({ event, hidden }: { event: LandingEvent; hidden?: boolean }) {
  const content = (
    <>
      <span className={styles.agendaThumb}>
        <LandingEventImage src={event.image} category={event.category} sizes="240px" />
      </span>
      <span className={styles.agendaMeta}>{event.dateLabel}</span>
      <span className={styles.agendaName}>{event.name}</span>
      <span className={styles.agendaSub}>{event.category} · {event.priceLabel}</span>
    </>
  );
  if (!event.href) return <span className={styles.agendaCard}>{content}</span>;
  return (
    <Link href={event.href} className={styles.agendaCard} tabIndex={hidden ? -1 : undefined}>
      {content}
    </Link>
  );
}

/** Números reais do catálogo e uma faixa em movimento com os próximos eventos. Some por completo sem agenda real. */
export function LiveAgenda({ catalog }: { catalog: LandingCatalog }) {
  const [userPaused, setUserPaused] = useState(false);
  const [hidden, setHidden] = useState(false);

  // Animação infinita: para quando a aba fica em segundo plano.
  useEffect(() => {
    const update = () => setHidden(document.visibilityState === "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  if (!catalog.real) return null;
  const figures = FIGURES.filter(figure => catalog.figures[figure.key] >= figure.min);
  const events = catalog.events.filter(event => event.href);
  if (events.length === 0) return null;
  const paused = userPaused || hidden;
  const loop = events.length >= MIN_LOOP;

  return (
    <section className={styles.live} aria-labelledby="agora-titulo">
      <div className={styles.liveHead}>
        <div>
          <p className={styles.liveEyebrow}><span className={styles.liveDot} aria-hidden="true" />Agora na agenda</p>
          <h2 id="agora-titulo" className={styles.liveTitle}>Eventos reais, publicados no EventMap.</h2>
        </div>
        {figures.length > 0 && (
          <ul className={styles.figures}>
            {figures.map(figure => {
              const value = catalog.figures[figure.key];
              const label = value === 1 ? figure.one : figure.many;
              return (
                <li key={figure.key}>
                  <strong><Counter value={value} /></strong>
                  <span aria-hidden="true">{label}</span>
                  <span className="sr-only">{value} {label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className={cn(styles.marquee, !loop && styles.marqueeStatic)} data-paused={paused ? "true" : "false"} style={{ "--marquee-duration": `${Math.max(30, events.length * 6)}s` } as CSSProperties}>
        <div className={styles.marqueeTrack}>
          <ul className={styles.marqueeList} aria-label="Próximos eventos da agenda">
            {events.map(event => <li key={event.id}><AgendaCard event={event} /></li>)}
          </ul>
          {/* Cópia só visual para o laço contínuo: fora da árvore de acessibilidade e do Tab. */}
          {loop && <ul className={cn(styles.marqueeList, styles.marqueeClone)} aria-hidden="true">
            {events.map(event => <li key={event.id}><AgendaCard event={event} hidden /></li>)}
          </ul>}
        </div>
      </div>
      <div className={styles.liveFoot}>
        {loop && <button type="button" className={styles.marqueeToggle} aria-pressed={userPaused} onClick={() => setUserPaused(value => !value)}>
          {userPaused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
          {userPaused ? "Retomar faixa" : "Pausar faixa"}
        </button>}
        <Link href="/" className={styles.resultsLink}>Ver a agenda completa no mapa</Link>
      </div>
    </section>
  );
}
