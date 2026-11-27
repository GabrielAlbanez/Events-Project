"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { AnimatePresence, LazyMotion, MotionConfig, m } from "framer-motion";
import { ArrowRight, ArrowUpRight, MapPin, Navigation, RotateCcw } from "lucide-react";
import { loadLayoutFeatures } from "@/components/animations/config";
import { cn } from "@/lib/utils";
import { LandingEventImage } from "./LandingEventImage";
import styles from "./Playground.module.css";
import {
  DISTANCE_OPTIONS,
  MAP_VIEWBOX,
  PRICE_OPTIONS,
  categoriesOf,
  formatKm,
  mapRadius,
  type DistanceOption,
  type LandingEvent,
  type PriceFilter,
} from "./landingData";

const ALL = "Todas";
const EASE = [0.22, 1, 0.36, 1] as const;
const DEFAULT_DISTANCE: DistanceOption = 5;

export function MapPlayground({ events, real }: { events: LandingEvent[]; real: boolean }) {
  const ids = useId();
  const pins = useMemo(() => events.slice(0, 8), [events]);
  const categories = useMemo(() => categoriesOf(pins), [pins]);
  const [category, setCategory] = useState<string>(ALL);
  const [distance, setDistance] = useState<DistanceOption>(DEFAULT_DISTANCE);
  const [price, setPrice] = useState<PriceFilter>("qualquer");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const matches = useMemo(
    () => pins.filter(event =>
      event.km <= distance
      && (category === ALL || event.category === category)
      && (price === "qualquer" || (price === "gratuito" ? event.isFree : !event.isFree))),
    [pins, category, distance, price],
  );
  const selected = matches.find(event => event.id === selectedId) ?? matches[0] ?? null;
  const ringScale = mapRadius(distance) / MAP_VIEWBOX.maxRadius;

  const reset = () => {
    setCategory(ALL);
    setDistance(10);
    setPrice("qualquer");
  };

  const summary = matches.length === 0
    ? "Nenhum evento com esses filtros."
    : `${matches.length} ${matches.length === 1 ? "evento" : "eventos"} no raio de ${distance} km`;

  return (
    <LazyMotion features={loadLayoutFeatures}>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.3, ease: EASE }}>
        <div className={styles.playground}>
          <div className={styles.controls} role="group" aria-label="Filtros da simulação">
            <fieldset className={styles.filterGroup}>
              <legend>{real ? "Categorias na agenda agora" : "O que você curte?"}</legend>
              <div className={styles.chips}>
                {[ALL, ...categories].map(option => (
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
                <legend>Preço</legend>
                <div className={styles.segmented}>
                  {PRICE_OPTIONS.map(option => (
                    <button key={option.value} type="button" aria-pressed={price === option.value} onClick={() => setPrice(option.value)}>
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

              {pins.map(event => {
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
                    aria-label={`${event.name}, ${event.category}, ${event.priceLabel}`}
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
                    <span className={styles.calloutThumb}>
                      <LandingEventImage src={selected.image} category={selected.category} sizes="56px" />
                    </span>
                    <span className={styles.calloutText}>
                      <strong>{selected.name}</strong>
                      <span>{selected.dateLabel}</span>
                      <span>{selected.priceLabel}</span>
                    </span>
                    {selected.href && (
                      <Link href={selected.href} className={styles.calloutLink}>
                        Ver evento <ArrowUpRight size={14} aria-hidden="true" />
                      </Link>
                    )}
                  </m.div>
                )}
              </AnimatePresence>
            </div>
            <p className={styles.mapLegend}>
              {real ? "Mapa e distâncias ilustrativos · eventos reais da agenda" : "Mapa ilustrativo · eventos de exemplo"}
            </p>
          </div>

          <div className={styles.results}>
            <p className={styles.resultsSummary} id={`${ids}-resumo`} aria-live="polite">{summary}</p>
            {matches.length === 0 ? (
              <div className={styles.empty}>
                <p>Tente ampliar a distância ou mudar o preço — no mapa de verdade, a lista acompanha cada ajuste.</p>
                <div className={styles.emptyActions}>
                  <button type="button" className={styles.smallBtn} onClick={reset}>
                    <RotateCcw size={14} aria-hidden="true" /> Mostrar todos
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
                        className={styles.cardItem}
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                      >
                        <button type="button" className={cn(styles.eventCard, active && styles.eventCardActive)} aria-pressed={active} onClick={() => setSelectedId(event.id)}>
                          <span className={styles.eventThumb}>
                            <LandingEventImage src={event.image} category={event.category} sizes="72px" />
                          </span>
                          <span className={styles.eventBody}>
                            <span className={styles.eventMeta}>{event.category}{event.dateLabel ? ` · ${event.dateLabel}` : ""}</span>
                            <span className={styles.eventName}>{event.name}</span>
                            <span className={styles.eventPlace}>{event.place}</span>
                          </span>
                          <span className={styles.eventSide}>
                            <span className={styles.eventDistance}>{formatKm(event.km)}</span>
                            <span className={styles.eventPrice}>{event.priceLabel}</span>
                          </span>
                        </button>
                        {event.href && (
                          <Link href={event.href} className={styles.cardOpen} aria-label={`Abrir a página de ${event.name}`}>
                            <ArrowUpRight size={18} aria-hidden="true" />
                          </Link>
                        )}
                      </m.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
            <Link href="/" className={styles.resultsLink}>
              Ver todos os eventos no mapa
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
