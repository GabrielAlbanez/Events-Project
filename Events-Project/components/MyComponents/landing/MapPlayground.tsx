"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { AnimatePresence, LazyMotion, MotionConfig, m } from "framer-motion";
import { ArrowRight, Car, MapPin, Navigation, RotateCcw } from "lucide-react";
import { loadLayoutFeatures } from "@/components/animations/config";
import { cn } from "@/lib/utils";
import styles from "./Playground.module.css";
import {
  DISTANCE_OPTIONS,
  LANDING_CATEGORIES,
  LANDING_EVENTS,
  MAP_VIEWBOX,
  WHEN_OPTIONS,
  formatKm,
  mapRadius,
  type DistanceOption,
  type LandingCategory,
  type LandingWhen,
} from "./landingData";

type CategoryFilter = LandingCategory | "Todas";
type WhenFilter = LandingWhen | "qualquer";

const DEFAULTS = { category: "Todas" as CategoryFilter, distance: 5 as DistanceOption, when: "qualquer" as WhenFilter };
const EASE = [0.22, 1, 0.36, 1] as const;

export function MapPlayground() {
  const ids = useId();
  const [category, setCategory] = useState<CategoryFilter>(DEFAULTS.category);
  const [distance, setDistance] = useState<DistanceOption>(DEFAULTS.distance);
  const [when, setWhen] = useState<WhenFilter>(DEFAULTS.when);
  const [selectedId, setSelectedId] = useState<string>("jazz");

  const matches = useMemo(
    () => LANDING_EVENTS.filter(event => event.km <= distance && (category === "Todas" || event.category === category) && (when === "qualquer" || event.when === when)),
    [category, distance, when],
  );
  const selected = matches.find(event => event.id === selectedId) ?? matches[0] ?? null;
  const ringScale = mapRadius(distance) / MAP_VIEWBOX.maxRadius;

  const reset = () => {
    setCategory(DEFAULTS.category);
    setDistance(DEFAULTS.distance);
    setWhen(DEFAULTS.when);
  };

  const summary = matches.length === 0
    ? "Nenhum evento com esses filtros."
    : `${matches.length} ${matches.length === 1 ? "evento encontrado" : "eventos encontrados"} até ${distance} km`;

  return (
    <LazyMotion features={loadLayoutFeatures}>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.3, ease: EASE }}>
        <div className={styles.playground}>
          <div className={styles.controls} role="group" aria-label="Filtros da simulação">
            <fieldset className={styles.filterGroup}>
              <legend>O que você curte?</legend>
              <div className={styles.chips}>
                {(["Todas", ...LANDING_CATEGORIES] as CategoryFilter[]).map(option => (
                  <button key={option} type="button" className={styles.chip} aria-pressed={category === option} onClick={() => setCategory(option)}>
                    {option}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className={styles.filterRow}>
              <fieldset className={styles.filterGroup}>
                <legend>Até que distância?</legend>
                <div className={styles.segmented}>
                  {DISTANCE_OPTIONS.map(option => (
                    <button key={option} type="button" aria-pressed={distance === option} onClick={() => setDistance(option)}>
                      {option} km
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className={styles.filterGroup}>
                <legend>Quando?</legend>
                <div className={styles.segmented}>
                  {WHEN_OPTIONS.map(option => (
                    <button key={option.value} type="button" aria-pressed={when === option.value} onClick={() => setWhen(option.value)}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          </div>

          <div className={styles.mapCard}>
            <div className={styles.mapCanvas}>
              <svg viewBox={`0 0 ${MAP_VIEWBOX.width} ${MAP_VIEWBOX.height}`} className={styles.mapArt} aria-hidden="true">
                <path className={styles.water} d="M-4 62 C 18 54, 30 70, 52 60 S 86 48, 104 54 L104 84 L-4 84 Z" />
                <g className={styles.streets}>
                  <path d="M0 18 H100 M0 40 H100 M0 58 H100 M14 0 V80 M36 0 V80 M64 0 V80 M86 0 V80" />
                  <path className={styles.avenue} d="M-2 76 L 56 4 M28 84 L 104 28" />
                </g>
                <rect className={styles.park} x="70" y="22" width="12" height="10" rx="2" />
                <rect className={styles.park} x="18" y="44" width="12" height="9" rx="2" />
                <circle className={styles.ringGuide} cx={MAP_VIEWBOX.centerX} cy={MAP_VIEWBOX.centerY} r={MAP_VIEWBOX.maxRadius} />
                <circle
                  className={styles.ring}
                  cx={MAP_VIEWBOX.centerX}
                  cy={MAP_VIEWBOX.centerY}
                  r={MAP_VIEWBOX.maxRadius}
                  style={{ transform: `scale(${ringScale})` }}
                />
                {selected && (
                  <line
                    className={styles.routeLine}
                    x1={MAP_VIEWBOX.centerX}
                    y1={MAP_VIEWBOX.centerY}
                    x2={(selected.x / 100) * MAP_VIEWBOX.width}
                    y2={(selected.y / 100) * MAP_VIEWBOX.height}
                  />
                )}
              </svg>

              <span className={styles.you} style={{ left: "50%", top: "50%" }} aria-hidden="true">
                <Navigation size={12} />
              </span>

              {LANDING_EVENTS.map(event => {
                const visible = matches.includes(event);
                const active = selected?.id === event.id;
                const position = { left: `${event.x}%`, top: `${event.y}%` };
                if (!visible) return <span key={event.id} className={styles.pinMuted} style={position} aria-hidden="true" />;
                return (
                  <button
                    key={event.id}
                    type="button"
                    className={cn(styles.pin, active && styles.pinActive)}
                    style={position}
                    aria-pressed={active}
                    aria-label={`${event.name}, ${event.category}, ${formatKm(event.km)}, ${event.price}`}
                    onClick={() => setSelectedId(event.id)}
                  >
                    <MapPin size={active ? 20 : 16} aria-hidden="true" />
                  </button>
                );
              })}

              <AnimatePresence initial={false} mode="wait">
                {selected && (
                  <m.div
                    key={selected.id}
                    className={styles.mapCallout}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className={styles.calloutThumb}>
                      <Image src={selected.image} alt="" fill sizes="56px" className={styles.cover} />
                    </div>
                    <div className={styles.calloutText}>
                      <strong>{selected.name}</strong>
                      <span>{selected.time} · {formatKm(selected.km)}</span>
                      <span className={styles.calloutTravel}><Car size={13} aria-hidden="true" /> {selected.minutes} min de carro</span>
                    </div>
                    <span className={styles.calloutPrice}>{selected.price}</span>
                  </m.div>
                )}
              </AnimatePresence>
            </div>
            <p className={styles.mapLegend}>Mapa ilustrativo · eventos fictícios</p>
          </div>

          <div className={styles.results}>
            <p className={styles.resultsSummary} id={`${ids}-resumo`} aria-live="polite">{summary}</p>
            {matches.length === 0 ? (
              <div className={styles.empty}>
                <p>Tente ampliar a distância ou escolher outro dia — no mapa real, a lista acompanha cada ajuste.</p>
                <div className={styles.emptyActions}>
                  {distance < 10 && (
                    <button type="button" className={styles.smallBtn} onClick={() => setDistance(10)}>Ampliar para 10 km</button>
                  )}
                  <button type="button" className={styles.smallBtnGhost} onClick={reset}>
                    <RotateCcw size={14} aria-hidden="true" /> Limpar filtros
                  </button>
                </div>
              </div>
            ) : (
              <ul className={styles.cardList} aria-describedby={`${ids}-resumo`}>
                <AnimatePresence initial={false} mode="popLayout">
                  {matches.map(event => {
                    const active = selected?.id === event.id;
                    return (
                      <m.li
                        key={event.id}
                        layout
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                      >
                        <button type="button" className={cn(styles.eventCard, active && styles.eventCardActive)} aria-pressed={active} onClick={() => setSelectedId(event.id)}>
                          <span className={styles.eventThumb}>
                            <Image src={event.image} alt="" fill sizes="72px" className={styles.cover} />
                          </span>
                          <span className={styles.eventBody}>
                            <span className={styles.eventMeta}>{event.category} · {event.time}</span>
                            <span className={styles.eventName}>{event.name}</span>
                            <span className={styles.eventPlace}>{event.place}</span>
                          </span>
                          <span className={styles.eventSide}>
                            <span className={styles.eventDistance}>{formatKm(event.km)}</span>
                            <span className={styles.eventPrice}>{event.price}</span>
                          </span>
                        </button>
                      </m.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
            <Link href="/" className={styles.resultsLink}>
              Ver os eventos de verdade no mapa
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
