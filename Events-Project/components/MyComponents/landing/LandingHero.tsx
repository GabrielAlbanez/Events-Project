"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, type CSSProperties } from "react";
import { ArrowDown, ArrowRight, CheckCircle2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./Landing.module.css";
import { useMediaQuery, useMotionAllowed, useScrollProgress } from "./useLandingMotion";

const CHAPTERS = [
  { href: "#descobrir", label: "Descobrir" },
  { href: "#participar", label: "Participar" },
  { href: "#por-dentro", label: "Por dentro" },
  { href: "#organizar", label: "Organizar" },
] as const;

type Poster = { src: string; name: string; meta: string; depth: number; className: string };

const POSTERS: Poster[] = [
  { src: "/branding/home-jazz-v1.webp", name: "Jazz no Terraço", meta: "1,2 km · Hoje 21h", depth: 1, className: styles.posterMain },
  { src: "/branding/home-live-v1.webp", name: "Noite Live Session", meta: "2,6 km · Sáb 22h", depth: 0.6, className: styles.posterLeft },
  { src: "/branding/home-sunset-v1.webp", name: "Festival Pôr do Sol", meta: "8,5 km · Dom 16h", depth: 0.35, className: styles.posterRight },
];

const depthStyle = (depth: number) => ({ "--depth": depth }) as CSSProperties;

export function LandingHero() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const motionAllowed = useMotionAllowed();
  const finePointer = useMediaQuery("(hover: hover) and (pointer: fine) and (min-width: 960px)");

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

  return (
    <section ref={sectionRef} className={styles.hero} aria-labelledby="conheca-titulo">
      <div className={cn(styles.container, styles.heroGrid)}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrowNight}>Como funciona o EventMap</p>
          <h1 id="conheca-titulo" className={styles.h1}>
            A sua cidade em um mapa.
            <span className={styles.h1Soft}> Do primeiro clique até a porta do evento.</span>
          </h1>
          <p className={styles.leadNight}>
            Descubra o que acontece perto de você, salve, garanta seu lugar, pague por Pix e entre com QR Code. Experimente cada etapa aqui mesmo, rolando a página.
          </p>
          <div className={styles.actions}>
            <Link href="/" className={cn(styles.btn, styles.btnPrimary)}>
              Explorar eventos
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link href="/para-organizadores" className={cn(styles.btn, styles.btnNight)}>
              Sou organizador
            </Link>
          </div>
          <nav className={styles.chapterNav} aria-label="Capítulos desta página">
            <ol>
              {CHAPTERS.map((chapter, index) => (
                <li key={chapter.href}>
                  <a href={chapter.href} className={styles.chapterLink}>
                    <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                    {chapter.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </div>

        {/* Composição ilustrativa: o conteúdo equivalente está no texto e nas seções seguintes. */}
        <div ref={stageRef} className={styles.stage} aria-hidden="true">
          <div className={styles.layer} style={depthStyle(0.2)}>
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

          {POSTERS.map((poster, index) => (
            <div key={poster.src} className={cn(styles.layer, poster.className)} style={depthStyle(poster.depth)}>
              <figure className={cn(styles.layerScroll, styles.poster)}>
                <div className={styles.posterArt}>
                  <Image
                    src={poster.src}
                    alt=""
                    fill
                    sizes="(max-width: 960px) 44vw, 240px"
                    priority={index === 0}
                    className={styles.cover}
                  />
                </div>
                <figcaption>
                  <strong>{poster.name}</strong>
                  <span>{poster.meta}</span>
                </figcaption>
              </figure>
            </div>
          ))}

          <div className={cn(styles.layer, styles.ticketChipWrap)} style={depthStyle(1.3)}>
            <div className={cn(styles.layerScroll, styles.ticketChip)}>
              <CheckCircle2 size={18} />
              <span>
                <strong>Presença confirmada</strong>
                <small>QR Code de entrada pronto</small>
              </span>
            </div>
          </div>
        </div>
      </div>

      <a href="#descobrir" className={styles.scrollCue}>
        <ArrowDown size={16} aria-hidden="true" />
        Role para experimentar
      </a>
    </section>
  );
}
