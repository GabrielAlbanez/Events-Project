"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, LazyMotion, MotionConfig, m, type PanInfo } from "framer-motion";
import { ArrowDown, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, MapPin, Pause, Play } from "lucide-react";
import { loadLayoutFeatures } from "@/components/animations/config";
import { cn } from "@/lib/utils";
import styles from "./Landing.module.css";
import { LandingEventImage } from "./LandingEventImage";
import type { LandingEvent } from "./landingData";
import { useMediaQuery, useMotionAllowed, useScrollProgress } from "./useLandingMotion";

const CHAPTERS = [
  { href: "#descobrir", label: "Descobrir" },
  { href: "#participar", label: "Participar" },
  { href: "#por-dentro", label: "Por dentro" },
  { href: "#organizar", label: "Organizar" },
] as const;

const ROTATE_MS = 5200;
const SWIPE_PX = 60;
const SPRING = { type: "spring", stiffness: 260, damping: 28 } as const;

const depthStyle = (depth: number) => ({ "--depth": depth }) as CSSProperties;

function PosterBody({ event, priority }: { event: LandingEvent; priority: boolean }) {
  return (
    <>
      <span className={styles.posterArt}>
        <LandingEventImage src={event.image} category={event.category} sizes="(max-width: 960px) 44vw, 260px" priority={priority} />
      </span>
      <span className={styles.posterCaption}>
        <strong>{event.name}</strong>
        <span>{event.dateLabel || event.category}</span>
      </span>
    </>
  );
}

export function LandingHero({ events, real }: { events: LandingEvent[]; real: boolean }) {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);
  const motionAllowed = useMotionAllowed();
  const finePointer = useMediaQuery("(hover: hover) and (pointer: fine) and (min-width: 960px)");
  const slides = events.slice(0, 6);
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [userPaused, setUserPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const autoplay = motionAllowed && !userPaused && !held && count > 1;

  const go = useCallback((step: number) => {
    if (count < 2) return;
    setDirection(step);
    setIndex(current => (current + step + count) % count);
  }, [count]);

  // Troca automática: só com movimento permitido, sem pausa do visitante, fora de hover/foco e com a aba visível.
  useEffect(() => {
    if (!autoplay) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") go(1);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [autoplay, go]);

  // Profundidade ao rolar: o palco recebe --p (0 → 1) enquanto o hero sai da tela.
  useScrollProgress(sectionRef, progress => stageRef.current?.style.setProperty("--p", progress.toFixed(3)), {
    enabled: motionAllowed,
    mode: "leave",
  });

  // Profundidade pelo ponteiro, só em desktop com mouse e sem movimento reduzido.
  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage || !motionAllowed || !finePointer) return;
    let frame = 0;
    let next = { x: 0, y: 0 };
    const paint = () => {
      frame = 0;
      stage.style.setProperty("--mx", next.x.toFixed(3));
      stage.style.setProperty("--my", next.y.toFixed(3));
    };
    const onMove = (event: PointerEvent) => {
      const rect = section.getBoundingClientRect();
      next = { x: ((event.clientX - rect.left) / rect.width) * 2 - 1, y: ((event.clientY - rect.top) / rect.height) * 2 - 1 };
      if (!frame) frame = window.requestAnimationFrame(paint);
    };
    const onLeave = () => {
      next = { x: 0, y: 0 };
      if (!frame) frame = window.requestAnimationFrame(paint);
    };
    section.addEventListener("pointermove", onMove, { passive: true });
    section.addEventListener("pointerleave", onLeave);
    return () => {
      window.cancelAnimationFrame(frame);
      section.removeEventListener("pointermove", onMove);
      section.removeEventListener("pointerleave", onLeave);
      stage.style.removeProperty("--mx");
      stage.style.removeProperty("--my");
    };
  }, [motionAllowed, finePointer]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x <= -SWIPE_PX) go(1);
    else if (info.offset.x >= SWIPE_PX) go(-1);
    // O clique sintético que segue o arraste não deve abrir o evento.
    window.setTimeout(() => {
      dragged.current = false;
    }, 0);
  };

  const main = slides[index];
  const left = count > 1 ? slides[(index + 1) % count] : null;
  const right = count > 2 ? slides[(index + 2) % count] : null;

  return (
    <section ref={sectionRef} className={styles.hero} aria-labelledby="conheca-titulo">
      <div className={cn(styles.container, styles.heroGrid)}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrowStage}>Como funciona o EventMap</p>
          <h1 id="conheca-titulo" className={styles.h1}>
            A sua cidade em um mapa.
            <span className={styles.h1Soft}> Do primeiro clique até a porta do evento.</span>
          </h1>
          <p className={styles.leadStage}>
            Descubra o que acontece perto de você, salve, garanta seu lugar, pague por Pix e entre com QR Code. Experimente cada etapa aqui mesmo, rolando a página.
          </p>
          <div className={styles.actions}>
            <Link href="/" className={cn(styles.btn, styles.btnPrimary)}>
              Explorar eventos
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link href="/para-organizadores" className={cn(styles.btn, styles.btnStage)}>
              Sou organizador
            </Link>
          </div>
          <nav className={styles.chapterNav} aria-label="Capítulos desta página">
            <ol>
              {CHAPTERS.map((chapter, chapterIndex) => (
                <li key={chapter.href}>
                  <a href={chapter.href} className={styles.chapterLink}>
                    <span aria-hidden="true">{String(chapterIndex + 1).padStart(2, "0")}</span>
                    {chapter.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </div>

        <div className={styles.stageColumn}>
          <div ref={stageRef} className={styles.stage}>
            {/* Mapa decorativo: o conteúdo equivalente está no capítulo 01. */}
            <div className={styles.layer} style={depthStyle(0.2)} aria-hidden="true">
              <div className={cn(styles.layerScroll, styles.mapPlane)}>
                <svg viewBox="0 0 400 320" className={styles.mapSvg} preserveAspectRatio="xMidYMid slice">
                  <path className={styles.mapRiver} d="M-20 250 C 80 210, 140 280, 230 236 S 360 180, 430 214" />
                  <g className={styles.mapStreets}>
                    <path d="M0 80 H400 M0 160 H400 M0 236 H400 M60 0 V320 M150 0 V320 M250 0 V320 M340 0 V320" />
                    <path d="M-10 300 L 210 40 M120 330 L 420 120" />
                  </g>
                  <rect className={styles.mapPark} x="262" y="92" width="64" height="52" rx="10" />
                  <rect className={styles.mapPark} x="70" y="176" width="58" height="44" rx="10" />
                  <path className={styles.mapRoute} d="M196 176 C 210 150, 232 140, 246 118 S 270 96, 286 86" pathLength={1} />
                  <circle className={styles.mapRing} cx="196" cy="176" r="64" />
                  <circle className={styles.mapRing} cx="196" cy="176" r="120" />
                  <circle className={styles.mapUser} cx="196" cy="176" r="7" />
                </svg>
                <span className={cn(styles.heroPin, styles.heroPinActive)} style={{ left: "71.5%", top: "26.9%" }}>
                  <MapPin size={18} />
                </span>
                <span className={styles.heroPin} style={{ left: "31%", top: "38%" }}><MapPin size={14} /></span>
                <span className={styles.heroPin} style={{ left: "62%", top: "70%" }}><MapPin size={14} /></span>
                <span className={styles.heroPin} style={{ left: "18%", top: "64%" }}><MapPin size={14} /></span>
              </div>
            </div>

            <LazyMotion features={loadLayoutFeatures}>
              <MotionConfig reducedMotion="user">
                {left && (
                  <div className={cn(styles.layer, styles.posterLeft)} style={depthStyle(0.6)} aria-hidden="true">
                    <div className={cn(styles.layerScroll, styles.posterSlot)}>
                      <AnimatePresence initial={false} mode="popLayout">
                        <m.div key={left.id} className={styles.poster} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
                          <PosterBody event={left} priority={false} />
                        </m.div>
                      </AnimatePresence>
                    </div>
                  </div>
                )}
                {right && (
                  <div className={cn(styles.layer, styles.posterRight)} style={depthStyle(0.35)} aria-hidden="true">
                    <div className={cn(styles.layerScroll, styles.posterSlot)}>
                      <AnimatePresence initial={false} mode="popLayout">
                        <m.div key={right.id} className={styles.poster} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
                          <PosterBody event={right} priority={false} />
                        </m.div>
                      </AnimatePresence>
                    </div>
                  </div>
                )}

                {main && (
                  <div className={cn(styles.layer, styles.posterMain)} style={depthStyle(1)}>
                    <div
                      className={cn(styles.layerScroll, styles.posterSlot)}
                      role="group"
                      aria-roledescription="carrossel"
                      aria-label={real ? "Eventos reais da agenda" : "Eventos de exemplo"}
                      onPointerEnter={() => setHeld(true)}
                      onPointerLeave={() => setHeld(false)}
                      onFocus={() => setHeld(true)}
                      onBlur={() => setHeld(false)}
                    >
                      <AnimatePresence initial={false} mode="popLayout">
                        <m.div
                          key={main.id}
                          className={cn(styles.poster, styles.posterLead)}
                          initial={{ opacity: 0, x: direction * 48, rotate: direction * 3 }}
                          animate={{ opacity: 1, x: 0, rotate: 0 }}
                          exit={{ opacity: 0, x: direction * -48, rotate: direction * -3 }}
                          transition={SPRING}
                          drag={count > 1 ? "x" : false}
                          dragConstraints={{ left: 0, right: 0 }}
                          dragElastic={0.45}
                          onDragStart={() => {
                            dragged.current = true;
                          }}
                          onDragEnd={onDragEnd}
                        >
                          {main.href ? (
                            <Link
                              href={main.href}
                              className={styles.posterLink}
                              draggable={false}
                              onClickCapture={event => {
                                if (dragged.current) event.preventDefault();
                              }}
                            >
                              <PosterBody event={main} priority={index === 0} />
                              <span className="sr-only">: ver evento</span>
                            </Link>
                          ) : (
                            <span className={styles.posterLink}><PosterBody event={main} priority={index === 0} /></span>
                          )}
                        </m.div>
                      </AnimatePresence>
                    </div>
                  </div>
                )}
              </MotionConfig>
            </LazyMotion>

            <div className={cn(styles.layer, styles.ticketChipWrap)} style={depthStyle(1.3)} aria-hidden="true">
              <div className={cn(styles.layerScroll, styles.ticketChip)}>
                <CheckCircle2 size={18} />
                <span>
                  <strong>Presença confirmada</strong>
                  <small>QR Code de entrada pronto</small>
                </span>
              </div>
            </div>
          </div>

          {count > 1 && (
            <div className={styles.heroControls}>
              <button type="button" onClick={() => go(-1)} aria-label="Evento anterior"><ChevronLeft size={18} aria-hidden="true" /></button>
              {motionAllowed && (
                <button
                  type="button"
                  onClick={() => setUserPaused(value => !value)}
                  aria-pressed={userPaused}
                  aria-label={userPaused ? "Retomar troca automática" : "Pausar troca automática"}
                >
                  {userPaused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
                </button>
              )}
              <button type="button" onClick={() => go(1)} aria-label="Próximo evento"><ChevronRight size={18} aria-hidden="true" /></button>
              <span className={styles.heroCount} aria-live={autoplay ? "off" : "polite"}>
                <span className="sr-only">Evento </span>{index + 1} de {count}<span className="sr-only">: {main?.name}</span>
              </span>
              <span className={styles.heroSource}>{real ? "Eventos reais da agenda" : "Eventos de exemplo"}</span>
            </div>
          )}
        </div>
      </div>

      <a href="#descobrir" className={styles.scrollCue}>
        <ArrowDown size={16} aria-hidden="true" />
        Role para experimentar
      </a>
    </section>
  );
}
