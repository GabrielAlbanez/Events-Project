"use client";

import Image from "next/image";
import {
  ArrowLeft,
  BarChart3,
  BatteryFull,
  CalendarPlus,
  Car,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Crosshair,
  Heart,
  Info,
  Lock,
  MapPin,
  Megaphone,
  MessageCircle,
  PanelLeft,
  Pause,
  Play,
  QrCode,
  RotateCw,
  Search,
  Send,
  Share2,
  Signal,
  Sparkles,
  TicketCheck,
  User,
  Users,
  Wifi,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import styles from "./ProductDemo.module.css";

/*
 * Demonstração roteirizada do EventMap. A interface simulada é decorativa (aria-hidden);
 * a legenda numerada e os botões de etapa transmitem o conteúdo para tecnologias assistivas.
 * Um único requestAnimationFrame controla a linha do tempo; o estado visual de cada cena é
 * derivado de (cena, tempo) por uma função pura, então qualquer etapa pode ser exibida estática.
 */

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(" ");

type Layout = "wide" | "mid" | "compact";
type ViewName = "discovery" | "event" | "community" | "checkin";

type DemoEvent = {
  id: string;
  name: string;
  category: string;
  price: string;
  date: string;
  place: string;
  image: string;
  x: number;
  y: number;
  minutes: number | null;
};

type CursorStep = { at: number; target: string; click?: boolean };

type Scene = {
  title: string;
  description: string;
  duration: number;
  cursor: CursorStep[];
};

type DemoState = {
  view: ViewName;
  url: string;
  typed: string;
  searchFocused: boolean;
  suggest: boolean;
  located: boolean;
  pinsVisible: number;
  mapPose: "intro" | "base" | "zoom";
  pinLabel: boolean;
  filtersOpen: boolean;
  travelSelected: boolean;
  calculating: boolean;
  near: boolean;
  highlight: boolean;
  eventAnchor: string | null;
  saved: boolean;
  toast: boolean;
  confirming: boolean;
  confirmed: boolean;
  waitlist: boolean;
  announce: boolean;
  pollProgress: number;
  voted: boolean;
  messages: number;
  typingIndex: number;
  match: boolean;
  commAnchor: string | null;
  qr: boolean;
  scanning: boolean;
  checked: boolean;
};

const EVENTS: DemoEvent[] = [
  { id: "jazz", name: "Jazz no Terraço", category: "Música", price: "R$ 60,00", date: "21 de nov. de 2026", place: "Terraço Augusta · Consolação", image: "/branding/home-jazz-v1.webp", x: 58, y: 41, minutes: 8 },
  { id: "codigo", name: "Código & Café", category: "Tecnologia", price: "Gratuito", date: "22 de nov. de 2026", place: "Rua Augusta · Consolação", image: "/branding/posters/poster-6.webp", x: 42, y: 40, minutes: 6 },
  { id: "live", name: "Noite Live Session", category: "Música", price: "R$ 45,00", date: "21 de nov. de 2026", place: "Casa Bela Vista · Bixiga", image: "/branding/home-live-v1.webp", x: 45, y: 62, minutes: 11 },
  { id: "feira", name: "Feira Criativa", category: "Feira", price: "Gratuito", date: "22 de nov. de 2026", place: "Praça Roosevelt · Centro", image: "/branding/posters/poster-1.webp", x: 63, y: 63, minutes: 13 },
  { id: "sunset", name: "Festival Pôr do Sol", category: "Música", price: "Gratuito", date: "23 de nov. de 2026", place: "Parque Villa-Lobos", image: "/branding/home-sunset-v1.webp", x: 17, y: 27, minutes: null },
  { id: "cinema", name: "Cinema na Laje", category: "Cinema", price: "R$ 20,00", date: "27 de nov. de 2026", place: "Laje Cultural · Santana", image: "/branding/posters/poster-4.webp", x: 84, y: 24, minutes: null },
  { id: "corrida", name: "Corrida Noturna 5K", category: "Esporte", price: "R$ 80,00", date: "28 de nov. de 2026", place: "Parque Ibirapuera", image: "/branding/posters/poster-3.webp", x: 79, y: 84, minutes: null },
  { id: "mesa", name: "Mesa de Origens", category: "Gastronomia", price: "R$ 120,00", date: "29 de nov. de 2026", place: "Mercado de Pinheiros", image: "/branding/posters/poster-5.webp", x: 20, y: 78, minutes: null },
];

const byId = (id: string) => EVENTS.find((event) => event.id === id) as DemoEvent;
const LIST_ALL = ["sunset", "jazz", "corrida", "live", "cinema", "codigo", "feira", "mesa"].map(byId);
const LIST_NEAR = ["jazz", "codigo", "live", "feira"].map(byId);
const JAZZ = byId("jazz");

const SEARCH_TEXT = "Perto de mim";
const MOVE = 650;
const CLICK_MS = 550;
const QUANT = 100;

const SCENES: Scene[] = [
  {
    title: "Abra o EventMap",
    description: "A busca já começa por perto: digite ou use sua localização atual.",
    duration: 6000,
    cursor: [
      { at: 200, target: "search", click: true },
      { at: 2800, target: "suggest", click: true },
      { at: 4300, target: "map-user" },
    ],
  },
  {
    title: "Explore o mapa",
    description: "Os eventos da cidade aparecem como pins no mapa, sincronizados com a lista ao lado.",
    duration: 6200,
    cursor: [
      { at: 300, target: "map-center" },
      { at: 2400, target: "zoomin", click: true },
      { at: 4100, target: "pin-sunset" },
    ],
  },
  {
    title: "Encontre o que está perto",
    description: "Filtre por tempo de deslocamento: só aparece o que fica a até 15 minutos de você.",
    duration: 6500,
    cursor: [
      { at: 200, target: "more-filters", click: true },
      { at: 1700, target: "opt-15", click: true },
      { at: 4400, target: "list-count" },
    ],
  },
  {
    title: "Veja os detalhes",
    description: "Passe pela lista, veja o pin destacado no mapa e abra a página completa do evento.",
    duration: 6500,
    cursor: [
      { at: 200, target: "card-jazz" },
      { at: 1800, target: "popup-details", click: true },
      { at: 3600, target: "before" },
    ],
  },
  {
    title: "Salve e garanta sua vaga",
    description: "Salve com lembrete e confirme presença. Lotou? Quem chega depois entra na lista de espera automática.",
    duration: 6800,
    cursor: [
      { at: 800, target: "save", click: true },
      { at: 3000, target: "confirm", click: true },
      { at: 5000, target: "waitlist" },
    ],
  },
  {
    title: "Viva o evento com a comunidade",
    description: "Comunicados oficiais em tempo real, enquetes, chat dos participantes e Conexões da festa.",
    duration: 7600,
    cursor: [
      { at: 1700, target: "poll-0", click: true },
      { at: 5300, target: "match" },
    ],
  },
  {
    title: "Check-in sem fila",
    description: "Mostre o QR Code na porta e o organizador confirma sua presença na hora.",
    duration: 6500,
    cursor: [
      { at: 200, target: "show-qr", click: true },
      { at: 4200, target: "org-result" },
    ],
  },
];

const SCENE_COUNT = SCENES.length;

const MESSAGES = [
  { at: 1500, initials: "LM", name: "Luiza M.", text: "Cheguei! Tem mesa livre perto do palco?", color: "hsl(262 70% 58%)", mine: false },
  { at: 2700, initials: "RT", name: "Rafa T.", text: "Lado esquerdo, perto do piano. Pode vir!", color: "hsl(190 75% 36%)", mine: false },
  { at: 3900, initials: "CB", name: "Carol B.", text: "A fila do bar está andando rápido mesmo.", color: "hsl(24 85% 50%)", mine: false },
  { at: 5000, initials: "VC", name: "Você", text: "Chego em 10 min, guardem um lugar!", color: "hsl(226.58 100% 57.06%)", mine: true },
];

const POLL = [
  { label: "Take Five", from: 38, to: 46 },
  { label: "Garota de Ipanema", from: 41, to: 36 },
  { label: "So What", from: 21, to: 18 },
];

const URLS: Record<ViewName, string> = {
  discovery: "eventmap.com.br",
  event: "eventmap.com.br/eventos/jazz-no-terraco",
  community: "eventmap.com.br/eventos/jazz-no-terraco/comunidade",
  checkin: "eventmap.com.br/eventos/jazz-no-terraco",
};

const DESIGN = {
  desktop: { w: 1200, h: 720 },
  compact: { w: 360, h: 760 },
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function deriveState(s: number, t: number): DemoState {
  const after = (scene: number, ms: number) => s > scene || (s === scene && t >= ms);
  const between = (scene: number, from: number, to: number) => s === scene && t >= from && t < to;
  const typedChars = s > 0 ? SEARCH_TEXT.length : t < 1100 ? 0 : clamp(Math.floor((t - 1100) / 100) + 1, 0, SEARCH_TEXT.length);
  const view: ViewName = s <= 2 || (s === 3 && t < 2500) ? "discovery" : s <= 4 ? "event" : s === 5 ? "community" : "checkin";
  return {
    view,
    url: URLS[view],
    typed: SEARCH_TEXT.slice(0, typedChars),
    searchFocused: between(0, 850, 3500),
    suggest: between(0, 2400, 3500),
    located: after(0, 3500),
    pinsVisible: s === 0 ? 0 : s === 1 ? EVENTS.filter((_, index) => t >= 200 + index * 230).length : EVENTS.length,
    mapPose: s === 0 ? "intro" : s === 1 && t < 3100 ? "base" : "zoom",
    pinLabel: s === 1 && t >= 4750,
    filtersOpen: between(2, 900, 4300),
    travelSelected: after(2, 2400),
    calculating: between(2, 2400, 3200),
    near: after(2, 3200),
    highlight: after(3, 850),
    eventAnchor: after(4, 100) ? "participate" : null,
    saved: after(4, 1500),
    toast: between(4, 1500, 3700),
    confirming: between(4, 3700, 4300),
    confirmed: after(4, 4300),
    waitlist: after(4, 4600),
    announce: after(5, 500),
    pollProgress: s < 5 ? 0 : s > 5 ? 1 : clamp((t - 1000) / 2600),
    voted: after(5, 2350),
    messages: s < 5 ? 0 : s > 5 ? MESSAGES.length : MESSAGES.filter((message) => t >= message.at).length,
    typingIndex: s === 5 ? MESSAGES.findIndex((message) => !message.mine && t >= message.at - 700 && t < message.at) : -1,
    match: after(5, 4800),
    commAnchor: after(5, 4200) ? "chat-anchor" : null,
    qr: after(6, 900),
    scanning: between(6, 1900, 3500),
    checked: after(6, 3500),
  };
}

/* Padrão decorativo de QR Code (não escaneável): três marcadores, linha de tempo e módulos pseudoaleatórios. */
const QR_SIZE = 25;
const QR_PATH = (() => {
  let seed = 20261121;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const finderOrigins = [[0, 0], [0, QR_SIZE - 7], [QR_SIZE - 7, 0]];
  let path = "";
  for (let row = 0; row < QR_SIZE; row += 1) {
    for (let col = 0; col < QR_SIZE; col += 1) {
      let dark: boolean;
      const finder = finderOrigins.find(([r, c]) => row >= r - 1 && row <= r + 7 && col >= c - 1 && col <= c + 7);
      if (finder) {
        const [r, c] = finder;
        const y = row - r;
        const x = col - c;
        const inside = y >= 0 && y <= 6 && x >= 0 && x <= 6;
        dark = inside && (y === 0 || y === 6 || x === 0 || x === 6 || (y >= 2 && y <= 4 && x >= 2 && x <= 4));
      } else if (row === 6 || col === 6) {
        dark = (row + col) % 2 === 0;
      } else {
        dark = random() > 0.5;
      }
      if (dark) path += `M${col} ${row}h1v1h-1z`;
    }
  }
  return path;
})();

function QrGraphic({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox={`-2 -2 ${QR_SIZE + 4} ${QR_SIZE + 4}`} shapeRendering="crispEdges">
      <rect x={-2} y={-2} width={QR_SIZE + 4} height={QR_SIZE + 4} fill="#fff" rx={2} />
      <path d={QR_PATH} fill="#0B0D12" />
    </svg>
  );
}

function BrandMark() {
  return (
    <svg viewBox="0 0 24 30" aria-hidden="true">
      <path d="M12 1C6 1 1.5 5.6 1.5 11.4 1.5 19.5 12 29 12 29s10.5-9.5 10.5-17.6C22.5 5.6 18 1 12 1Z" fill="#2455FF" />
      <circle cx="12" cy="11.2" r="4.6" fill="#C7F34A" />
    </svg>
  );
}

function PinGlyph({ active }: { active: boolean }) {
  const fill = active ? "#C7F34A" : "#2455FF";
  const ink = active ? "#10151F" : "#fff";
  return (
    <svg viewBox="0 0 28 36">
      <path d="M14 1C7 1 1.5 6.5 1.5 13.5 1.5 23 14 34.5 14 34.5S26.5 23 26.5 13.5C26.5 6.5 21 1 14 1Z" fill={fill} stroke={ink} strokeWidth="2" />
      <circle cx="14" cy="13" r="4.5" fill={ink} />
    </svg>
  );
}

const GRID_V = Array.from({ length: 22 }, (_, index) => -12 + index * 6);
const GRID_H = Array.from({ length: 19 }, (_, index) => -12 + index * 7);

function MapCanvas({ state, compact }: { state: DemoState; compact: boolean }) {
  const visibleCount = state.near ? 4 : state.pinsVisible;
  return (
    <div className={styles.map}>
      <div className={cx(styles.world, state.mapPose === "intro" ? styles.poseIntro : state.mapPose === "zoom" ? styles.poseZoom : styles.poseBase)}>
        <svg className={styles.mapSvg} viewBox="0 0 100 100" preserveAspectRatio="none">
          <rect width="100" height="100" fill="var(--map-land)" />
          <g transform="rotate(-7 50 50)" stroke="var(--map-road)" strokeWidth="2.5" fill="none">
            {GRID_V.map((x) => <line key={`v${x}`} x1={x} y1={-20} x2={x} y2={120} vectorEffect="non-scaling-stroke" />)}
            {GRID_H.map((y) => <line key={`h${y}`} x1={-20} y1={y} x2={120} y2={y} vectorEffect="non-scaling-stroke" />)}
          </g>
          <path d="M3 17 C 9 12, 25 11, 31 17 L 32 34 C 26 39, 11 39, 5 35 Z" fill="var(--map-park)" />
          <path d="M66 75 C 77 70, 93 72, 98 78 L 101 101 L 64 101 Z" fill="var(--map-park)" />
          <path d="M48 47 h7 v6 h-7 Z" fill="var(--map-park)" />
          <path d="M-4 9 C 18 3, 34 13, 55 9 S 86 1, 104 6" stroke="var(--map-water)" strokeWidth="16" fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <g stroke="var(--map-casing)" strokeWidth="10" fill="none" strokeLinecap="round">
            <path d="M-5 96 L 105 20" vectorEffect="non-scaling-stroke" />
            <path d="M31 -5 C 34 30, 38 62, 47 105" vectorEffect="non-scaling-stroke" />
            <path d="M-5 57 C 30 52, 62 50, 105 46" vectorEffect="non-scaling-stroke" />
          </g>
          <g stroke="var(--map-avenue)" strokeWidth="7" fill="none" strokeLinecap="round">
            <path d="M-5 96 L 105 20" vectorEffect="non-scaling-stroke" />
            <path d="M31 -5 C 34 30, 38 62, 47 105" vectorEffect="non-scaling-stroke" />
            <path d="M-5 57 C 30 52, 62 50, 105 46" vectorEffect="non-scaling-stroke" />
          </g>
        </svg>
        <span className={styles.mapLabel} style={{ left: "6%", top: "50%" }}>Pinheiros</span>
        <span className={styles.mapLabel} style={{ left: "67%", top: "40%" }}>Consolação</span>
        <span className={styles.mapLabel} style={{ left: "51%", top: "73%" }}>Bela Vista</span>
        {!compact && <span className={styles.mapLabel} style={{ left: "58%", top: "16%" }}>Santana</span>}
        <span className={cx(styles.mapLabel, styles.mapLabelPark)} style={{ left: "84%", top: "92%" }}>Ibirapuera</span>
        <span className={cx(styles.reach, state.near && styles.reachOn)}>
          <span className={styles.reachTag}>até 15 min</span>
        </span>
        <span className={cx(styles.user, state.located && styles.userOn)} style={{ left: "52%", top: "52%" }} data-demo-target="map-user">
          <span className={styles.userPulse} />
          <span className={styles.userDot} />
          <span className={styles.userTag}>Você</span>
        </span>
        {EVENTS.map((event, index) => {
          const visible = index < state.pinsVisible;
          const dim = state.near && event.minutes === null;
          const active = state.highlight && event.id === "jazz" && state.view === "discovery";
          return (
            <span key={event.id} className={cx(styles.pin, visible && styles.pinOn, dim && styles.pinDim, active && styles.pinActive)} style={{ left: `${event.x}%`, top: `${event.y}%` }} data-demo-target={`pin-${event.id}`}>
              <PinGlyph active={active} />
              {event.id === "sunset" && state.pinLabel && !state.near && <span className={styles.pinLabel}>{event.name} · {event.price}</span>}
            </span>
          );
        })}
      </div>
      <span className={styles.mapCenter} data-demo-target="map-center" />
      <div className={styles.mapControls}>
        <div className={styles.ctrlGroup}>
          <span className={styles.ctrlBtn} data-demo-target="zoomin"><ZoomIn /></span>
          <span className={styles.ctrlDivider} />
          <span className={styles.ctrlBtn}><ZoomOut /></span>
        </div>
        <span className={cx(styles.ctrlBtn, styles.ctrlSolo)}><Crosshair /></span>
      </div>
      {visibleCount > 0 && (
        <span className={styles.mapPill}><span className={styles.pillDot} />{visibleCount} {visibleCount === 1 ? "evento" : "eventos"} no mapa</span>
      )}
      {state.highlight && state.view === "discovery" && (
        <div className={styles.popup}>
          <span className={styles.popupThumb}><Image src={JAZZ.image} alt="" fill sizes="72px" /></span>
          <span className={styles.popupBody}>
            <span className={styles.popupName}>{JAZZ.name}</span>
            <span className={styles.popupPlace}>{JAZZ.place}</span>
            <span className={styles.popupLink} data-demo-target="popup-details">Ver detalhes</span>
          </span>
          <span className={styles.popupClose}>×</span>
        </div>
      )}
    </div>
  );
}

function DiscoveryView({ state, compact }: { state: DemoState; compact: boolean }) {
  const loading = !state.near && state.pinsVisible === 0;
  const list = state.near ? LIST_NEAR : LIST_ALL.slice(0, state.pinsVisible);
  const count = state.near ? LIST_NEAR.length : state.pinsVisible;
  return (
    <div className={styles.discovery}>
      <aside className={styles.panel}>
        {compact && <span className={styles.grabber} />}
        {!compact && (
          <div className={styles.panelIntro}>
            <span className={styles.introDeco} />
            <p className={styles.eyebrow}><Sparkles /> Descubra por perto</p>
            <h2 className={styles.panelTitle}>Escolha como viver a cidade</h2>
            <p className={styles.panelLead}>Explore a agenda e escolha o que combina com você.</p>
          </div>
        )}
        <div className={styles.panelBlock}>
          <div className={styles.searchWrap}>
            <div className={cx(styles.search, state.searchFocused && styles.searchFocused)} data-demo-target="search">
              <Search />
              <span className={styles.searchText}>
                {state.typed ? state.typed : <span className={styles.placeholder}>Buscar evento ou lugar</span>}
                {state.searchFocused && <span className={styles.caret} />}
              </span>
              {state.located && <span className={styles.locChip}><Crosshair /> Consolação</span>}
            </div>
            {state.suggest && (
              <div className={styles.suggest}>
                <div className={cx(styles.suggestItem, styles.suggestFirst)} data-demo-target="suggest">
                  <span className={styles.suggestIcon}><Crosshair /></span>
                  <span><strong>Usar minha localização atual</strong><small>Consolação, São Paulo</small></span>
                </div>
                <div className={styles.suggestItem}>
                  <span className={cx(styles.suggestIcon, styles.suggestIconMuted)}><MapPin /></span>
                  <span><strong>Av. Paulista</strong><small>Bela Vista, São Paulo</small></span>
                </div>
              </div>
            )}
          </div>
          <div className={styles.chips}>
            {["Todos", "Hoje", "Fim de semana", "Este mês"].map((label, index) => (
              <span key={label} className={cx(styles.chip, index === 0 && styles.chipActive)}>{label}</span>
            ))}
          </div>
        </div>
        <div className={cx(styles.filters, state.filtersOpen && styles.filtersOpen)}>
          <div className={styles.filtersHead} data-demo-target="more-filters">
            <span className={styles.filtersCaret}>▸</span>
            <strong>Mais filtros</strong>
            <span className={cx(styles.filtersHint, state.near && styles.filtersHintOn)}>{state.near ? "Até 15 min de carro" : "Categoria, preço e localização"}</span>
          </div>
          {state.filtersOpen && (
            <div className={styles.filtersBody}>
              {!compact && (
                <div>
                  <span className={styles.fieldLabel}>Distância</span>
                  <span className={styles.select}>Qualquer distância <ChevronRight /></span>
                </div>
              )}
              <div>
                <span className={styles.fieldLabel}>Tempo de deslocamento</span>
                <div className={styles.options}>
                  {["Sem filtro de tempo", "Até 15 minutos", "Até 30 minutos", "Até 1 hora"].map((label, index) => (
                    <span key={label} className={cx(styles.option, (state.travelSelected ? index === 1 : index === 0) && styles.optionOn)} data-demo-target={index === 1 ? "opt-15" : undefined}>{label}</span>
                  ))}
                </div>
              </div>
              <p className={styles.filtersStatus}>
                {state.calculating ? <><span className={styles.spinner} /> Calculando trajetos...</> : state.travelSelected ? <><Check /> Localização aplicada ao filtro.</> : "Calculamos a viagem somente quando você pedir."}
              </p>
            </div>
          )}
        </div>
        <div className={styles.listHead}>
          <h3>Eventos próximos</h3>
          <span className={cx(styles.listCount, state.near && styles.listCountOn)} data-demo-target="list-count">{count} {count === 1 ? "encontrado" : "encontrados"}</span>
        </div>
        <div className={styles.list}>
          {loading
            ? [0, 1, 2].map((item) => (
              <div key={item} className={styles.skeleton}>
                <span className={styles.skeletonThumb} />
                <span className={styles.skeletonLines}><span /><span /><span /></span>
              </div>
            ))
            : list.map((event) => (
              <div key={`${state.near ? "n" : "a"}-${event.id}`} className={cx(styles.card, state.highlight && event.id === "jazz" && styles.cardActive)} data-demo-target={`card-${event.id}`}>
                <span className={styles.thumb}><Image src={event.image} alt="" fill sizes="64px" /></span>
                <span className={styles.cardBody}>
                  <span className={styles.cardDate}>{event.date}</span>
                  <span className={styles.cardName}>{event.name}</span>
                  <span className={styles.cardPlace}><MapPin />{event.place}</span>
                </span>
                {state.near && event.minutes !== null && <span className={styles.travel}><Car />{event.minutes} min</span>}
              </div>
            ))}
        </div>
      </aside>
      <section className={styles.mapArea}>
        <MapCanvas state={state} compact={compact} />
      </section>
    </div>
  );
}

/* Rolagem simulada: desloca o conteúdo até a âncora, limitado à altura disponível. */
function useMockScroll(anchor: string | null) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  useIsoLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    if (!anchor) {
      setOffset(0);
      return;
    }
    const target = content.querySelector<HTMLElement>(`[data-demo-anchor="${anchor}"]`);
    if (!target) return;
    let top = 0;
    let node: HTMLElement | null = target;
    while (node && node !== content) {
      top += node.offsetTop;
      node = node.offsetParent as HTMLElement | null;
    }
    const max = Math.max(0, content.offsetHeight - viewport.clientHeight);
    setOffset(Math.round(clamp(top - 16, 0, max)));
  }, [anchor]);
  return { viewportRef, contentRef, offset };
}

function EventView({ state, compact }: { state: DemoState; compact: boolean }) {
  const { viewportRef, contentRef, offset } = useMockScroll(state.eventAnchor);
  return (
    <div ref={viewportRef} className={styles.pageViewport}>
      <div ref={contentRef} className={styles.pageContent} style={{ transform: `translate3d(0, ${-offset}px, 0)` }}>
        <span className={styles.backLink}><ArrowLeft /> Voltar à agenda</span>
        <article className={styles.eventCard}>
          <div className={styles.banner}>
            <Image src={JAZZ.image} alt="" fill sizes={compact ? "340px" : "(max-width: 1200px) 92vw, 1100px"} />
          </div>
          <div className={styles.eventBody}>
            <div className={styles.eventMain}>
              <p className={styles.eventMeta}>{JAZZ.category} · {JAZZ.price}</p>
              <h2 className={styles.eventTitle}>{JAZZ.name}</h2>
              <h3 className={styles.sectionTitle}>Sobre o evento</h3>
              <p className={styles.bodyText}>Quarteto ao vivo no terraço, com standards e bossa nova sob as luzes da cidade. Evento fictício criado para esta demonstração.</p>
              <div className={styles.beforeBox} data-demo-target="before">
                <h3>Antes de participar</h3>
                <p>Confirme a programação e as condições de participação na fonte oficial antes de ir.</p>
                <span className={styles.textLink}>Conferir página oficial ↗</span>
              </div>
            </div>
            <aside className={styles.eventSide}>
              <div className={styles.infoCard}>
                <div className={styles.infoBlock}>
                  <span>Quando</span>
                  <strong>21 de novembro de 2026 21:00 · até 23:30</strong>
                  <small>Fuso: America/Sao_Paulo</small>
                </div>
                <div className={styles.infoBlock}>
                  <span>Onde</span>
                  <strong>Terraço Augusta, Consolação, São Paulo</strong>
                  <span className={styles.textLink}>Abrir no Google Maps ↗</span>
                </div>
              </div>
              <section className={styles.participate} data-demo-anchor="participate">
                <div className={styles.participateHead}>
                  <Users />
                  <div>
                    <h3>Participar deste evento</h3>
                    <p>Confirme sua presença e acompanhe sua inscrição aqui.</p>
                  </div>
                </div>
                <p className={styles.countLine}>{state.confirmed ? 39 : 38} presenças confirmadas de 40 vagas</p>
                {state.confirmed && <p className={styles.confirmedPill}><TicketCheck /> Presença confirmada</p>}
                <span className={state.confirmed ? styles.btnOutline : styles.btnPrimary} data-demo-target="confirm">
                  {state.confirming ? <><span className={cx(styles.spinner, styles.spinnerLight)} /> Confirmando...</> : state.confirmed ? "Cancelar inscrição" : "Confirmar presença"}
                </span>
                {state.waitlist && (
                  <p className={styles.waitNote} data-demo-target="waitlist"><Info /> Quando as vagas acabam, novos interessados entram na lista de espera automática e são avisados se abrir uma vaga.</p>
                )}
              </section>
              <div className={styles.actions}>
                <span className={cx(styles.actionBtn, state.saved && styles.actionSaved)} data-demo-target="save">
                  <Heart className={cx(styles.heart, state.saved && styles.heartOn)} />
                  {state.saved ? "Salvo na minha agenda" : "Salvar evento"}
                </span>
                <span className={styles.actionBtn}><Share2 /> Compartilhar</span>
                <span className={styles.actionBtn}><CalendarPlus /> Adicionar ao calendário</span>
              </div>
            </aside>
          </div>
        </article>
      </div>
      {state.toast && (
        <div className={styles.toast}>
          <CheckCircle2 />
          <span><strong>Evento salvo · lembrete ativado</strong><span>Vamos te avisar 1 dia antes.</span></span>
        </div>
      )}
    </div>
  );
}

function CommunityView({ state, compact }: { state: DemoState; compact: boolean }) {
  const { viewportRef, contentRef, offset } = useMockScroll(compact ? state.commAnchor : null);
  const progress = state.pollProgress;
  const votes = Math.round(96 + 32 * progress);
  const visibleMessages = MESSAGES.slice(0, state.messages);
  const typing = state.typingIndex >= 0 ? MESSAGES[state.typingIndex] : null;
  return (
    <div ref={viewportRef} className={styles.pageViewport}>
      <div ref={contentRef} className={styles.pageContent} style={{ transform: `translate3d(0, ${-offset}px, 0)` }}>
        <span className={styles.backLink}><ArrowLeft /> Detalhes do evento</span>
        <div className={styles.commTitleRow}>
          <div>
            <p className={styles.eyebrowBrand}>Comunidade do evento</p>
            <h2 className={styles.commTitle}>Tudo para aproveitar seu evento</h2>
            <p className={styles.commSub}>Jazz no Terraço · hoje, 21:00 · Terraço Augusta</p>
          </div>
          <span className={styles.liveChip}><span className={styles.liveDot} />Ao vivo</span>
        </div>
        <div className={styles.tabs}>
          {["Avisos", "Perguntas", "Enquetes", "Programação", "Filas", "Achados"].map((tab, index) => (
            <span key={tab} className={cx(styles.tab, index === 0 && styles.tabOn)}>{tab}</span>
          ))}
        </div>
        <div className={styles.commGrid}>
          <div className={styles.commCol}>
            <article className={cx(styles.surface, styles.announce, state.announce && styles.announceOn)}>
              <div className={styles.announceTop}>
                <span className={styles.officialBadge}><Megaphone /> Comunicado oficial</span>
                <span className={styles.time}>agora</span>
              </div>
              <p className={styles.announceText}>Portões abertos! A primeira banda sobe ao palco às 21h15. O bar do terraço está com fila menor agora.</p>
              <span className={styles.announceBy}>Organização · Jazz no Terraço</span>
            </article>
            <article className={styles.surface}>
              <div className={styles.pollHead}><BarChart3 /><h3>Qual clássico fecha a noite?</h3></div>
              <span className={styles.pollMeta}>{votes} votos · enquete aberta</span>
              <div className={styles.pollOpts}>
                {POLL.map((option, index) => {
                  const pct = Math.round(option.from + (option.to - option.from) * progress);
                  const mine = state.voted && index === 0;
                  return (
                    <div key={option.label} className={cx(styles.pollOpt, mine && styles.pollMine)} data-demo-target={`poll-${index}`}>
                      <span className={styles.pollBar} style={{ transform: `scaleX(${pct / 100})` }} />
                      <span className={styles.pollLabel}>{mine && <Check />}{option.label}</span>
                      <span className={styles.pollPct}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </article>
          </div>
          <div className={styles.commCol} data-demo-anchor="chat-anchor">
            <article className={styles.surface}>
              <div className={styles.chatHead}>
                <MessageCircle />
                <h3>Chat dos participantes</h3>
                <span className={styles.online}><span />Conectado ao chat</span>
              </div>
              <div className={styles.chatBody}>
                {visibleMessages.map((message) => (
                  <div key={message.at} className={cx(styles.msg, message.mine && styles.msgMine)}>
                    <span className={styles.msgAvatar} style={{ background: message.color }}>{message.initials}</span>
                    <span className={styles.bubble}>{!message.mine && <strong>{message.name}</strong>}{message.text}</span>
                  </div>
                ))}
              </div>
              <div className={styles.typing}>
                {typing && <><span className={styles.typingDots}><i /><i /><i /></span>{typing.name} está digitando…</>}
              </div>
              <div className={styles.chatInput}>Escreva uma mensagem… <Send /></div>
            </article>
            <article className={cx(styles.surface, styles.match, state.match && styles.matchOn)} data-demo-target="match">
              <span className={styles.matchAvatars}>
                <span style={{ background: "linear-gradient(135deg, hsl(226 100% 62%), hsl(262 80% 62%))" }}>VC</span>
                <span style={{ background: "linear-gradient(135deg, hsl(330 80% 60%), hsl(24 90% 58%))" }}>JS</span>
                <i><Heart /></i>
              </span>
              <span className={styles.matchText}>
                <span className={styles.matchEyebrow}>Conexões da festa</span>
                <strong>É um match! Você e Júlia S. querem se conhecer.</strong>
                <span>Perfil opt-in · conversa só com interesse mútuo.</span>
              </span>
              <span className={styles.matchBtn}>Dizer oi</span>
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckinView({ state }: { state: DemoState }) {
  return (
    <div className={styles.checkinContent}>
      <span className={styles.backLink}><ArrowLeft /> Detalhes do evento</span>
      <div className={styles.checkHead}>
        <p className={styles.eyebrowBrand}>Check-in</p>
        <h2 className={styles.commTitle}>Entrada sem fila</h2>
        <p className={styles.commSub}>Jazz no Terraço · hoje, 21:00 · Terraço Augusta</p>
      </div>
      <div className={styles.checkGrid}>
        <section className={cx(styles.surface, styles.passCard)}>
          <div className={styles.passTop}>
            <span className={styles.passLabel}>Sua entrada</span>
            <span className={cx(styles.statusPill, !state.checked && state.scanning && styles.statusWait)}>
              {state.checked ? "Entrada registrada" : state.scanning ? "Lendo QR Code…" : "Presença confirmada"}
            </span>
          </div>
          <h3 className={styles.passName}>Jazz no Terraço</h3>
          <p className={styles.passMeta}>Sáb., 21 de nov. · 21:00 · Terraço Augusta</p>
          {state.qr ? (
            <div className={styles.qrWrap}>
              <span className={styles.qrFrame}>
                <QrGraphic className={styles.qr} />
                {state.checked && <span className={styles.qrDone}><CheckCircle2 /></span>}
              </span>
              <p className={styles.qrHint}>Mostre este QR Code ao organizador. Ele expira em cinco minutos.</p>
              <span className={styles.timer}><Clock /> Expira em 4:52</span>
            </div>
          ) : (
            <span className={cx(styles.btnPrimary, styles.qrButton)} data-demo-target="show-qr"><QrCode /> Mostrar QR Code para entrada</span>
          )}
        </section>
        <section className={cx(styles.surface, styles.orgCard, state.checked && styles.orgOn)}>
          <div className={styles.orgTop}>
            <span className={styles.eyebrowBrand}>Visão do organizador</span>
            <span className={styles.orgCount}>{state.checked ? 39 : 38} de 40 entradas</span>
          </div>
          <h3 className={styles.orgTitle}>Check-in na porta</h3>
          <div className={styles.scanner}>
            <span className={cx(styles.corner, styles.cornerTL)} />
            <span className={cx(styles.corner, styles.cornerTR)} />
            <span className={cx(styles.corner, styles.cornerBL)} />
            <span className={cx(styles.corner, styles.cornerBR)} />
            {state.qr && <QrGraphic className={styles.scanQr} />}
            {state.scanning && <span className={styles.scanLine} />}
            {state.checked && <span className={styles.scanOk}><CheckCircle2 /></span>}
          </div>
          {state.checked ? (
            <div className={styles.resultOk} data-demo-target="org-result">
              <CheckCircle2 />
              <span><strong>Presença confirmada ✓</strong><span>Participante · ingresso válido · 21:12</span></span>
            </div>
          ) : (
            <p className={styles.scanHint} data-demo-target="org-result">{state.scanning ? "Lendo QR Code…" : "Aponte a câmera para o QR Code do participante."}</p>
          )}
          <ul className={styles.recent}>
            {[{ initials: "LM", name: "Luiza M.", time: "21:08", color: "hsl(262 70% 58%)" }, { initials: "RT", name: "Rafa T.", time: "21:05", color: "hsl(190 75% 36%)" }].map((person) => (
              <li key={person.initials}>
                <span className={styles.msgAvatar} style={{ background: person.color }}>{person.initials}</span>
                {person.name}
                <span className={styles.recentTime}><Check /> {person.time}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function MockApp({ state, compact }: { state: DemoState; compact: boolean }) {
  return (
    <div className={styles.app}>
      {compact && (
        <div className={styles.statusBar}>
          <span>21:12</span>
          <span className={styles.statusIcons}><Signal /><Wifi /><BatteryFull /></span>
        </div>
      )}
      <header className={styles.appHeader}>
        <PanelLeft className={styles.headerIcon} />
        <span className={styles.logo}><BrandMark />Event<span className={styles.logoMap}>Map</span></span>
        {!compact && (
          <nav className={styles.nav}>
            <span className={cx(styles.navItem, state.view === "discovery" && styles.navActive)}>Descobrir</span>
            <span className={cx(styles.navItem, state.view !== "discovery" && styles.navActive)}>Agenda</span>
            <span className={styles.navItem}>Mapa</span>
          </nav>
        )}
        <span className={styles.headerIcons}>
          <Search className={styles.headerIcon} />
          {compact ? <User className={styles.headerIcon} /> : <span className={styles.avatar}>VC</span>}
        </span>
      </header>
      <div className={styles.appBody}>
        <div key={state.view} className={styles.view}>
          {state.view === "discovery" && <DiscoveryView state={state} compact={compact} />}
          {state.view === "event" && <EventView state={state} compact={compact} />}
          {state.view === "community" && <CommunityView state={state} compact={compact} />}
          {state.view === "checkin" && <CheckinView state={state} />}
        </div>
      </div>
    </div>
  );
}

export default function ProductDemo() {
  const rootRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const chaptersRef = useRef<HTMLOListElement>(null);
  const barRef = useRef<HTMLSpanElement | null>(null);
  const elapsedRef = useRef(0);
  const sceneRef = useRef(0);
  const lastQuantRef = useRef(0);

  const [scene, setScene] = useState(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [layout, setLayout] = useState<Layout>("wide");
  const [scale, setScale] = useState(1);
  const [cursor, setCursor] = useState({ x: 0, y: 0, ready: false });

  const compact = layout === "compact";
  const design = compact ? DESIGN.compact : DESIGN.desktop;
  const running = playing && inView && pageVisible && !reduced;
  const state = deriveState(scene, t);
  const current = SCENES[scene];

  const paintBar = () => {
    const bar = barRef.current;
    if (!bar) return;
    bar.style.transform = `scaleX(${clamp(elapsedRef.current / SCENES[sceneRef.current].duration)})`;
  };

  const syncTime = (ms: number) => {
    elapsedRef.current = ms;
    const quantized = Math.floor(ms / QUANT) * QUANT;
    lastQuantRef.current = quantized;
    setT(quantized);
    paintBar();
  };

  const goTo = (index: number, staticView = reduced || !playing) => {
    const next = (index + SCENE_COUNT) % SCENE_COUNT;
    sceneRef.current = next;
    setScene(next);
    syncTime(staticView ? SCENES[next].duration : 0);
  };

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (elapsedRef.current >= SCENES[sceneRef.current].duration) syncTime(0);
    setPlaying(true);
  };

  // Layout (moldura de navegador ou celular) e escala do palco de design fixo.
  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    const screen = screenRef.current;
    if (!root || !screen) return;
    const measure = () => {
      const width = root.clientWidth;
      const nextLayout: Layout = width < 720 ? "compact" : width < 960 ? "mid" : "wide";
      setLayout(nextLayout);
      const designWidth = nextLayout === "compact" ? DESIGN.compact.w : DESIGN.desktop.w;
      if (screen.clientWidth > 0) setScale(screen.clientWidth / designWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(screen);
    return () => observer.disconnect();
  }, []);

  // Autoplay somente quando a demonstração está visível.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio >= 0.3), { threshold: [0, 0.3, 0.6] });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  // Pausa quando a aba fica oculta.
  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  // prefers-reduced-motion: sem autoplay e cenas exibidas no estado final.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReduced(query.matches);
      if (query.matches) {
        setPlaying(false);
        elapsedRef.current = SCENES[sceneRef.current].duration;
        lastQuantRef.current = elapsedRef.current;
        setT(elapsedRef.current);
      }
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // Linha do tempo: um único requestAnimationFrame.
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const delta = Math.min(now - last, 100);
      last = now;
      elapsedRef.current += delta;
      if (elapsedRef.current >= SCENES[sceneRef.current].duration) {
        elapsedRef.current = 0;
        sceneRef.current = (sceneRef.current + 1) % SCENE_COUNT;
        lastQuantRef.current = -1;
        setScene(sceneRef.current);
      }
      const quantized = Math.floor(elapsedRef.current / QUANT) * QUANT;
      if (quantized !== lastQuantRef.current) {
        lastQuantRef.current = quantized;
        setT(quantized);
      }
      paintBar();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [running]);

  // Cursor: posiciona sobre o alvo atual medindo o elemento real dentro do palco.
  let stepIndex = -1;
  current.cursor.forEach((step, index) => {
    if (step.at <= t) stepIndex = index;
  });
  const previousScene = SCENES[(scene - 1 + SCENE_COUNT) % SCENE_COUNT];
  const step = stepIndex >= 0 ? current.cursor[stepIndex] : null;
  const cursorTarget = step?.target ?? previousScene.cursor[previousScene.cursor.length - 1]?.target ?? null;
  const clickAt = step?.click ? step.at + MOVE : null;
  const clicking = clickAt !== null && t >= clickAt && t < clickAt + CLICK_MS;
  const arrived = step ? t >= step.at + MOVE - 200 : false;
  const touchVisible = Boolean(step?.click) && arrived && clickAt !== null && t < clickAt + 700;

  useIsoLayoutEffect(() => {
    if (reduced || !cursorTarget) return;
    const screen = screenRef.current;
    const stage = stageRef.current;
    if (!screen || !stage) return;
    const target = stage.querySelector<HTMLElement>(`[data-demo-target="${cursorTarget}"]`);
    if (!target) return;
    const screenBox = screen.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    const x = box.left - screenBox.left + Math.min(box.width / 2, 120);
    const y = box.top - screenBox.top + box.height * 0.55;
    setCursor((prev) => (prev.ready && Math.abs(prev.x - x) < 0.5 && Math.abs(prev.y - y) < 0.5 ? prev : { x, y, ready: true }));
  }, [cursorTarget, scale, layout, reduced, state.view]);

  const setBar = (element: HTMLSpanElement | null) => {
    barRef.current = element;
    paintBar();
  };

  const onChaptersKey = (event: ReactKeyboardEvent<HTMLOListElement>) => {
    const buttons = Array.from(chaptersRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const focused = buttons.findIndex((button) => button === document.activeElement);
    const from = focused >= 0 ? focused : scene;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = from + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = from - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = SCENE_COUNT - 1;
    if (next === null) return;
    event.preventDefault();
    const index = (next + SCENE_COUNT) % SCENE_COUNT;
    goTo(index);
    buttons[index]?.focus();
  };

  return (
    <section ref={rootRef} className={cx(styles.root, styles[layout], reduced && styles.reduced)} aria-label="Demonstração interativa do EventMap">
      <div className={styles.meta}>
        <span className={styles.badge}><span className={styles.badgeDot} aria-hidden="true" />Simulação · dados fictícios</span>
        <span className={styles.metaText}>Interface baseada no EventMap real</span>
      </div>

      <div ref={frameRef} className={styles.frameWrap}>
        <div className={compact ? styles.phone : styles.browser} aria-hidden="true">
          {!compact && (
            <div className={styles.browserBar}>
              <span className={styles.dots}><span /><span /><span /></span>
              <span className={styles.url}><Lock /><span key={state.url} className={styles.urlText}>{state.url}</span></span>
              <span className={styles.barIcons}><RotateCw /></span>
            </div>
          )}
          {compact && <span className={styles.island} />}
          <div ref={screenRef} className={styles.screen}>
            <div ref={stageRef} className={styles.stage} style={{ width: design.w, height: design.h, transform: `scale(${scale})` }}>
              <MockApp state={state} compact={compact} />
            </div>
            {!reduced && (
              <div className={cx(styles.cursor, !cursor.ready && styles.cursorHidden, compact && styles.touch, compact && touchVisible && styles.touchOn)} style={{ transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)` }}>
                {clicking && <span key={`${scene}-${stepIndex}`} className={styles.ripple} />}
                {compact ? <span className={styles.touchDot} /> : (
                  <svg className={styles.cursorArrow} viewBox="0 0 20 24">
                    <path d="M2 1.5v18.2l4.9-4.6 3.3 7.3 3.2-1.4-3.3-7.2 6.7-.3z" fill="#0B0D12" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.controlsPanel}>
        <div className={styles.controls}>
          {!reduced && (
            <button type="button" className={cx(styles.ctrl, styles.ctrlMain)} onClick={togglePlay} aria-label={playing ? "Pausar demonstração" : "Reproduzir demonstração"}>
              {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            </button>
          )}
          <button type="button" className={styles.ctrl} onClick={() => goTo(scene - 1)} aria-label="Etapa anterior">
            <ChevronLeft aria-hidden="true" />
          </button>
          <button type="button" className={styles.ctrl} onClick={() => goTo(scene + 1)} aria-label="Próxima etapa">
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
        <div className={styles.caption} aria-live="polite" aria-atomic="true">
          <p className={styles.captionStep}>Etapa {scene + 1} de {SCENE_COUNT}</p>
          <p className={styles.captionTitle}>{current.title}</p>
          <p className={styles.captionText}>{current.description}</p>
          {reduced && <p className={styles.reducedNote}>Animação desativada pela preferência de movimento reduzido. Use as etapas para navegar.</p>}
        </div>
        <ol ref={chaptersRef} className={styles.chapters} aria-label="Etapas da demonstração" onKeyDown={onChaptersKey}>
          {SCENES.map((item, index) => (
            <li key={item.title}>
              <button
                type="button"
                className={cx(styles.chapter, index === scene && styles.chapterOn)}
                aria-current={index === scene ? "step" : undefined}
                aria-label={`Etapa ${index + 1} de ${SCENE_COUNT}: ${item.title}`}
                onClick={() => goTo(index)}
              >
                <span className={styles.chapterNum} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <span className={styles.chapterTitle} aria-hidden="true">{item.title}</span>
                <span className={styles.track} aria-hidden="true">
                  {index === scene
                    ? <span key="active" ref={setBar} className={styles.fill} />
                    : <span key="static" className={cx(styles.fill, index < scene && styles.fillDone)} />}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
