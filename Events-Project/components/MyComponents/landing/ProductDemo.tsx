"use client";

import Image from "next/image";
import {
  ArrowLeft,
  BarChart3,
  BatteryFull,
  Bookmark,
  CalendarDays,
  CalendarPlus,
  Car,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Clock3,
  Copy,
  Crosshair,
  Heart,
  Loader2,
  Lock,
  MapPin,
  Megaphone,
  MessageCircle,
  PanelLeft,
  Pause,
  Play,
  QrCode,
  RotateCcw,
  RotateCw,
  Search,
  Send,
  Share2,
  Signal,
  Sparkles,
  Ticket,
  TicketCheck,
  User,
  Wifi,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import styles from "./ProductDemo.module.css";

/*
 * Demonstração roteirizada do EventMap, apresentada como um vídeo de produto.
 * - A interface simulada é decorativa (aria-hidden); legenda, capítulos e controles transmitem o conteúdo.
 * - Um único requestAnimationFrame avança a linha do tempo e pinta, sem re-render, a barra de progresso e o cursor.
 * - O estado visual é derivado de (cena, tempo) por funções puras, então qualquer instante pode ser exibido estático.
 * - Uma "câmera" (transform no palco interno) enquadra a região de ação de cada momento.
 */

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(" ");

type Layout = "wide" | "mid" | "compact";
type ViewName = "discovery" | "event" | "community" | "checkin";
type TicketPhase = "idle" | "generating" | "pending" | "paid";
type Point = { x: number; y: number };
type Camera = { x: number; y: number; s: number };

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
/** focus: valor de data-demo-focus (null = tela inteira). zoom fixo ou, sem ele, enquadra a região até `max`. */
type CameraKey = { at: number; focus: string | null; zoom?: number; max?: number };
type Line = { at: number; text: string };

type Scene = {
  title: string;
  description: string;
  duration: number;
  cursor: CursorStep[];
  camera: CameraKey[];
  lines: Line[];
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
  ticketFocus: boolean;
  saved: boolean;
  ticket: TicketPhase;
  pixRemaining: number;
  toast: string | null;
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
const PIX_CODE = "00020126580014BR.GOV.BCB.PIX0136demo-eventmap-ficticio-0000-000052040000530398654056.005802BR5913EVENTMAP DEMO6009SAO PAULO62070503***6304D3M0";
const ORDER_CODE = "7F3A9C21";
const MOVE = 720;
const CLICK_MS = 500;
const QUANT = 100;
const CROSSFADE = 500;
const POSTER_SCENE = 1;

const SCENES: Scene[] = [
  {
    title: "Abra o EventMap",
    description: "A busca já começa por perto: digite ou use sua localização atual.",
    duration: 6000,
    cursor: [
      { at: 200, target: "search", click: true },
      { at: 2700, target: "suggest", click: true },
      { at: 4300, target: "map-user" },
    ],
    camera: [
      { at: 0, focus: null },
      { at: 450, focus: "search", zoom: 1.5 },
      { at: 3700, focus: null },
    ],
    lines: [
      { at: 0, text: "Abra o EventMap e comece pela busca." },
      { at: 2400, text: "Use sua localização atual com um toque." },
      { at: 3700, text: "Pronto: a agenda já começa perto de você." },
    ],
  },
  {
    title: "Explore o mapa",
    description: "Os eventos da cidade aparecem como pins no mapa, sincronizados com a lista ao lado.",
    duration: 6000,
    cursor: [
      { at: 300, target: "map-center" },
      { at: 2300, target: "zoomin", click: true },
      { at: 4100, target: "pin-sunset" },
    ],
    camera: [
      { at: 0, focus: null },
      { at: 3000, focus: "map", zoom: 1.18 },
    ],
    lines: [
      { at: 0, text: "Os eventos da cidade aparecem como pins no mapa." },
      { at: 3000, text: "Mapa e lista andam juntos: aproxime para ver mais." },
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
    camera: [
      { at: 0, focus: "filters", zoom: 1.45 },
      { at: 4200, focus: null },
    ],
    lines: [
      { at: 0, text: "Abra os filtros e escolha o tempo de deslocamento." },
      { at: 2400, text: "Os trajetos são calculados a partir de onde você está." },
      { at: 4200, text: "Só fica o que está a até 15 minutos." },
    ],
  },
  {
    title: "Veja os detalhes",
    description: "Passe pela lista, veja o pin destacado no mapa e abra a página completa do evento.",
    duration: 6500,
    cursor: [
      { at: 200, target: "card-jazz" },
      { at: 1700, target: "popup-details", click: true },
      { at: 3800, target: "fact-price" },
    ],
    camera: [{ at: 0, focus: null }],
    lines: [
      { at: 0, text: "Passe pela lista: o pin do evento acende no mapa." },
      { at: 2500, text: "A página do evento reúne data, local e valor." },
    ],
  },
  {
    title: "Salve e garanta seu ingresso",
    description: "Salve o evento e compre o ingresso por Pix pelo próprio EventMap. Pagamento confirmado, ingresso pronto.",
    duration: 10000,
    cursor: [
      { at: 700, target: "save", click: true },
      { at: 2500, target: "buy", click: true },
      { at: 4900, target: "copy", click: true },
      { at: 8000, target: "ticket-ok" },
    ],
    camera: [
      { at: 0, focus: "aside", max: 1.3 },
      { at: 3900, focus: "pix", max: 1.5 },
      { at: 7600, focus: "ticket", max: 1.45 },
      { at: 9200, focus: null },
    ],
    lines: [
      { at: 0, text: "Salve o evento na sua agenda." },
      { at: 2300, text: "Compre o ingresso pelo próprio EventMap, com Pix." },
      { at: 4800, text: "Leia o QR Code ou cole o código no app do banco." },
      { at: 7600, text: "Pagamento confirmado: o ingresso vira seu QR de entrada." },
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
    camera: [
      { at: 0, focus: null },
      { at: 800, focus: "comm-left", max: 1.22 },
      { at: 4100, focus: "comm-right", max: 1.22 },
      { at: 6800, focus: null },
    ],
    lines: [
      { at: 0, text: "Comunicados oficiais chegam em tempo real." },
      { at: 1600, text: "Vote nas enquetes da noite." },
      { at: 3600, text: "Combine tudo no chat com quem também vai." },
      { at: 5000, text: "E, se quiser, faça Conexões da festa." },
    ],
  },
  {
    title: "Check-in sem fila",
    description: "Mostre o QR Code do ingresso na porta e o organizador confirma sua entrada na hora.",
    duration: 6500,
    cursor: [
      { at: 200, target: "show-qr", click: true },
      { at: 4200, target: "org-result" },
    ],
    camera: [
      { at: 0, focus: "pass", max: 1.3 },
      { at: 2100, focus: "org", max: 1.3 },
      { at: 5300, focus: null },
    ],
    lines: [
      { at: 0, text: "Na porta, mostre o QR Code do seu ingresso." },
      { at: 1900, text: "O organizador lê o código e confirma na hora." },
      { at: 3600, text: "Entrada registrada. Bom evento!" },
    ],
  },
];

const SCENE_COUNT = SCENES.length;
const OFFSETS = SCENES.reduce<number[]>((acc, scene, index) => [...acc, index === 0 ? 0 : acc[index - 1] + SCENES[index - 1].duration], []);
const TOTAL = OFFSETS[SCENE_COUNT - 1] + SCENES[SCENE_COUNT - 1].duration;
const TOTAL_SECONDS = Math.round(TOTAL / 1000);

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
  discovery: "seu-eventmap.app",
  event: "seu-eventmap.app/eventos/jazz-no-terraco",
  community: "seu-eventmap.app/eventos/jazz-no-terraco/comunidade",
  checkin: "seu-eventmap.app/eventos/jazz-no-terraco",
};

const DESIGN = {
  desktop: { w: 1200, h: 720 },
  compact: { w: 360, h: 760 },
};

const IDENTITY: Camera = { x: 0, y: 0, s: 1 };

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
/* Curva de "jerk mínimo": acelera e desacelera como um movimento de mão. */
const easeHand = (p: number) => p * p * p * (p * (p * 6 - 15) + 10);
const formatClock = (ms: number) => {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};
const formatRemaining = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

function deriveState(s: number, t: number): DemoState {
  const after = (scene: number, ms: number) => s > scene || (s === scene && t >= ms);
  const between = (scene: number, from: number, to: number) => s === scene && t >= from && t < to;
  const typedChars = s > 0 ? SEARCH_TEXT.length : t < 1100 ? 0 : clamp(Math.floor((t - 1100) / 100) + 1, 0, SEARCH_TEXT.length);
  const view: ViewName = s <= 2 || (s === 3 && t < 2500) ? "discovery" : s <= 4 ? "event" : s === 5 ? "community" : "checkin";
  const ticket: TicketPhase = after(4, 7600) ? "paid" : after(4, 4000) ? "pending" : after(4, 3200) ? "generating" : "idle";
  const toast = between(4, 1400, 3200) ? "Evento salvo." : between(4, 5600, 7300) ? "Código Pix copiado. Cole no app do seu banco." : between(4, 7600, 9600) ? "Pagamento confirmado! Seu ingresso está pronto." : null;
  return {
    view,
    url: URLS[view],
    typed: SEARCH_TEXT.slice(0, typedChars),
    searchFocused: between(0, 850, 3400),
    suggest: between(0, 2300, 3400),
    located: after(0, 3400),
    pinsVisible: s === 0 ? 0 : s === 1 ? EVENTS.filter((_, index) => t >= 200 + index * 230).length : EVENTS.length,
    mapPose: s === 0 ? "intro" : s === 1 && t < 3000 ? "base" : "zoom",
    pinLabel: s === 1 && t >= 4800,
    filtersOpen: between(2, 900, 4300),
    travelSelected: after(2, 2400),
    calculating: between(2, 2400, 3200),
    near: after(2, 3200),
    highlight: after(3, 850),
    ticketFocus: after(4, 100),
    saved: after(4, 1400),
    ticket,
    pixRemaining: s === 4 && t >= 4000 ? 1799 - Math.floor((t - 4000) / 1000) : 1800,
    toast,
    announce: after(5, 500),
    pollProgress: s < 5 ? 0 : s > 5 ? 1 : clamp((t - 1000) / 2600),
    voted: after(5, 2350),
    messages: s < 5 ? 0 : s > 5 ? MESSAGES.length : MESSAGES.filter((message) => t >= message.at).length,
    typingIndex: s === 5 ? MESSAGES.findIndex((message) => !message.mine && t >= message.at - 700 && t < message.at) : -1,
    match: after(5, 4800),
    commAnchor: after(5, 4200) ? "chat-anchor" : null,
    qr: after(6, 850),
    scanning: between(6, 1900, 3500),
    checked: after(6, 3500),
  };
}

/** Estado num tempo possivelmente negativo (antes do início da cena: fim da cena anterior). */
function deriveAt(s: number, t: number): DemoState {
  if (t >= 0 || s === 0) return deriveState(s, Math.max(0, t));
  return deriveState(s - 1, SCENES[s - 1].duration + t);
}

const lastIndexAt = <T extends { at: number }>(items: T[], t: number) => {
  let found = -1;
  items.forEach((item, index) => {
    if (item.at <= t) found = index;
  });
  return found;
};

/* Padrão decorativo de QR Code (não escaneável): três marcadores, linha de tempo e módulos pseudoaleatórios. */
const QR_SIZE = 25;
function makeQrPath(initialSeed: number) {
  let seed = initialSeed;
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
}
const QR_ENTRY = makeQrPath(20261121);
const QR_PIX = makeQrPath(60600060);

function QrGraphic({ className, path = QR_ENTRY }: { className?: string; path?: string }) {
  return (
    <svg className={className} viewBox={`-2 -2 ${QR_SIZE + 4} ${QR_SIZE + 4}`} shapeRendering="crispEdges">
      <rect x={-2} y={-2} width={QR_SIZE + 4} height={QR_SIZE + 4} fill="#fff" rx={2} />
      <path d={path} fill="#0B0D12" />
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
          <span className={styles.popupThumb}><Image src={JAZZ.image} alt="" fill sizes="72px" loading="lazy" /></span>
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
          <div className={styles.searchWrap} data-demo-focus="search">
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
        <div className={cx(styles.filters, state.filtersOpen && styles.filtersOpen)} data-demo-focus="filters">
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
                <span className={styles.thumb}><Image src={event.image} alt="" fill sizes="64px" loading="lazy" /></span>
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
      <section className={styles.mapArea} data-demo-focus="map">
        <MapCanvas state={state} compact={compact} />
      </section>
    </div>
  );
}

/* Rolagem simulada: desloca o conteúdo até a âncora, limitado à altura disponível.
 * O deslocamento fica em data-scroll-y para a câmera medir a posição final sem esperar a transição. */
function useMockScroll(anchor: string | null, revision = "") {
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
    setOffset(Math.round(clamp(top - 14, 0, max)));
  }, [anchor, revision]);
  return { viewportRef, contentRef, offset };
}

function TicketCard({ state }: { state: DemoState }) {
  const phase = state.ticket;
  return (
    <section className={styles.ticket} data-demo-anchor="ticket" data-demo-focus="ticket">
      <div className={styles.ticketHead}>
        <Ticket />
        <div>
          <h3>Ingresso</h3>
          <p className={styles.ticketPrice}>{JAZZ.price}</p>
          <p className={styles.ticketLead}>Pagamento por Pix, processado pelo Mercado Pago. O ingresso é confirmado automaticamente e vira seu QR Code de entrada.</p>
        </div>
      </div>
      {phase === "paid" ? (
        <div className={styles.ticketBody} data-demo-target="ticket-ok">
          <p className={styles.confirmedPill}><TicketCheck /> Ingresso confirmado</p>
          <p className={styles.ticketNote}>Mostre o QR Code abaixo na entrada. Ele também fica em Meus ingressos.</p>
          <span className={styles.btnSoft}><QrCode /> Mostrar QR Code para entrada</span>
          <span className={styles.textLink}>Ver meus ingressos →</span>
        </div>
      ) : phase === "pending" ? (
        <div className={cx(styles.ticketBody, styles.checkout)}>
          <div className={styles.checkoutTop}>
            <span className={styles.awaiting}><Loader2 className={styles.spinIcon} /> Aguardando pagamento</span>
            <span className={styles.countdown}><Clock3 />{formatRemaining(state.pixRemaining)}</span>
          </div>
          <div className={styles.pixBox} data-demo-focus="pix">
            <QrGraphic className={styles.pixQr} path={QR_PIX} />
            <span className={styles.pixLabel}>Pix copia e cola</span>
            <span className={styles.pixInput}>{PIX_CODE}</span>
            <span className={styles.btnPrimary} data-demo-target="copy"><Copy /> Copiar código</span>
          </div>
          <ol className={styles.pixSteps}>
            <li><span>1.</span>Abra o app do seu banco e escolha pagar com Pix.</li>
            <li><span>2.</span>Leia o QR Code ou cole o código copiado.</li>
            <li><CheckCircle2 />Pronto: esta página confirma sozinha em alguns segundos.</li>
          </ol>
          <p className={styles.orderLine}>Pedido <span>{ORDER_CODE}</span> · o Pix vale por 30 minutos.</p>
        </div>
      ) : (
        <div className={styles.ticketBody}>
          <span className={styles.btnPrimary} data-demo-target="buy">
            {phase === "generating" ? <><Loader2 className={styles.spinIcon} /> Gerando Pix...</> : `Comprar ingresso — ${JAZZ.price}`}
          </span>
          <p className={styles.seats}>12 ingressos disponíveis</p>
          <p className={styles.legal}>Ao comprar, seu nome e e-mail ficam visíveis para a organização do evento. Reembolsos são feitos pelo organizador, inclusive no prazo de 7 dias para desistência. <span>Ver regras</span></p>
        </div>
      )}
    </section>
  );
}

function EventView({ state, compact }: { state: DemoState; compact: boolean }) {
  const checkoutOpen = state.ticket === "pending" || state.ticket === "paid";
  const anchor = compact ? (state.ticketFocus ? "ticket" : null) : checkoutOpen && state.ticket === "pending" ? "ticket" : null;
  const { viewportRef, contentRef, offset } = useMockScroll(anchor, state.ticket);
  return (
    <div ref={viewportRef} className={styles.pageViewport}>
      <div ref={contentRef} className={styles.pageContent} data-scroll-y={offset} style={{ transform: `translate3d(0, ${-offset}px, 0)` }}>
        <span className={styles.backLink}><ArrowLeft /> Voltar à agenda</span>
        <article className={styles.eventCard}>
          <div className={styles.banner}>
            <Image src={JAZZ.image} alt="" fill sizes={compact ? "340px" : "(max-width: 1200px) 92vw, 1100px"} loading="lazy" />
          </div>
          <div className={styles.eventBody}>
            <div className={styles.eventMain}>
              <div data-demo-focus="event-head">
                <p className={styles.eventMeta}>{JAZZ.category}</p>
                <h2 className={styles.eventTitle}>{JAZZ.name}</h2>
                <dl className={styles.facts}>
                  <div className={styles.fact}>
                    <dt><CalendarDays />Quando</dt>
                    <dd>21 de novembro de 2026</dd>
                    <dd className={styles.factSub}>21:00 · até 23:30</dd>
                  </div>
                  <div className={styles.fact}>
                    <dt><MapPin />Onde</dt>
                    <dd>Terraço Augusta, Consolação</dd>
                    <dd className={styles.factLink}>Abrir no Google Maps ↗</dd>
                  </div>
                  <div className={styles.fact} data-demo-target="fact-price">
                    <dt><Ticket />Valor</dt>
                    <dd>{JAZZ.price}</dd>
                  </div>
                </dl>
              </div>
              <h3 className={styles.sectionTitle}>Sobre o evento</h3>
              <p className={styles.bodyText}>Quarteto ao vivo no terraço, com standards e bossa nova sob as luzes da cidade. Evento fictício criado para esta demonstração.</p>
              <h3 className={styles.sectionTitle}>Antes de participar</h3>
              <p className={styles.bodyText}>Informações fornecidas por quem publicou o evento. Em caso de dúvida, confirme as condições com a organização antes de ir.</p>
            </div>
            <aside className={styles.eventSide} data-demo-focus="aside">
              <TicketCard state={state} />
              <div className={styles.actions}>
                <span className={cx(styles.actionBtn, state.saved && styles.actionSaved)} data-demo-target="save">
                  <Bookmark className={cx(styles.bookmark, state.saved && styles.bookmarkOn)} />
                  {compact ? (state.saved ? "Salvo" : "Salvar") : state.saved ? "Salvo na minha agenda" : "Salvar evento"}
                </span>
                <span className={styles.actionBtn}><Share2 /> Compartilhar</span>
                <span className={styles.actionBtn}><CalendarPlus /> {compact ? "Calendário" : "Adicionar ao calendário (.ics)"}</span>
              </div>
            </aside>
          </div>
        </article>
      </div>
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
      <div ref={contentRef} className={styles.pageContent} data-scroll-y={offset} style={{ transform: `translate3d(0, ${-offset}px, 0)` }}>
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
          <div className={styles.commCol} data-demo-focus="comm-left">
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
          <div className={styles.commCol} data-demo-anchor="chat-anchor" data-demo-focus="comm-right">
            <article className={styles.surface}>
              <div className={styles.chatHead}>
                <MessageCircle />
                <h3>Chat dos participantes</h3>
                <span className={styles.online}><span />{compact ? "Conectado" : "Conectado ao chat"}</span>
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
        <section className={cx(styles.surface, styles.passCard)} data-demo-focus="pass">
          <div className={styles.passTop}>
            <span className={styles.passLabel}>Sua entrada</span>
            <span className={cx(styles.statusPill, !state.checked && state.scanning && styles.statusWait)}>
              {state.checked ? "Entrada registrada" : state.scanning ? "Lendo QR Code…" : "Ingresso confirmado"}
            </span>
          </div>
          <h3 className={styles.passName}>Jazz no Terraço</h3>
          <p className={styles.passMeta}>Sáb., 21 de nov. · 21:00 · Pedido {ORDER_CODE}</p>
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
        <section className={cx(styles.surface, styles.orgCard, state.checked && styles.orgOn)} data-demo-focus="org">
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
              <span><strong>Entrada registrada ✓</strong><span>Participante · ingresso válido · 21:12</span></span>
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

function ViewContent({ state, compact }: { state: DemoState; compact: boolean }) {
  if (state.view === "discovery") return <DiscoveryView state={state} compact={compact} />;
  if (state.view === "event") return <EventView state={state} compact={compact} />;
  if (state.view === "community") return <CommunityView state={state} compact={compact} />;
  return <CheckinView state={state} />;
}

function AppChrome({ view, compact }: { view: ViewName; compact: boolean }) {
  return (
    <>
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
            <span className={cx(styles.navItem, view === "discovery" && styles.navActive)}>Descobrir</span>
            <span className={cx(styles.navItem, view !== "discovery" && styles.navActive)}>Agenda</span>
            <span className={styles.navItem}>Mapa</span>
          </nav>
        )}
        <span className={styles.headerIcons}>
          <Search className={styles.headerIcon} />
          {compact ? <User className={styles.headerIcon} /> : <span className={styles.avatar}>VC</span>}
        </span>
      </header>
    </>
  );
}

/* Mede a região em coordenadas do palco pela cadeia de offsets (ignora transforms em andamento)
 * e desconta a rolagem simulada (data-scroll-y), obtendo a posição final do layout. */
function measureRegion(element: HTMLElement, root: HTMLElement) {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = element;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    const scroll = node.dataset.scrollY;
    if (scroll) y -= Number(scroll) || 0;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y, w: element.offsetWidth, h: element.offsetHeight };
}

function frameCamera(region: { x: number; y: number; w: number; h: number } | null, key: CameraKey, W: number, H: number, compact: boolean): Camera {
  // No celular a tela já ocupa a largura toda: aproximar cortaria texto nas bordas, então a câmera fica parada.
  if (!region || !key.focus || compact) return IDENTITY;
  const fit = Math.min(W / (region.w * 1.16), H / (region.h * 1.16));
  const s = key.zoom ?? clamp(fit, 1, key.max ?? 1.4);
  if (s <= 1.01) return IDENTITY;
  const centerX = region.x + region.w / 2;
  const centerY = region.y + region.h / 2;
  return {
    s,
    x: Math.round(clamp(W / 2 - centerX * s, W - W * s, 0)),
    y: Math.round(clamp(H / 2 - centerY * s, H - H * s, 0)),
  };
}

type Motion = { scene: number; key: string; from: Point; to: Point; start: number; dur: number; bend: number };

export default function ProductDemo() {
  const rootRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLSpanElement | null>(null);
  const elapsedRef = useRef(0);
  const sceneRef = useRef(0);
  const lastQuantRef = useRef(0);
  const motionRef = useRef<Motion | null>(null);
  const cursorPosRef = useRef<Point | null>(null);
  const bendSignRef = useRef(1);

  const [scene, setScene] = useState(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [layout, setLayout] = useState<Layout>("wide");
  const [scale, setScale] = useState(1);
  const [camera, setCamera] = useState<Camera>(IDENTITY);
  const [cursorReady, setCursorReady] = useState(false);

  const compact = layout === "compact";
  const design = compact ? DESIGN.compact : DESIGN.desktop;
  const poster = !started && !reduced;
  const running = playing && inView && pageVisible && !reduced;
  const shownScene = poster ? POSTER_SCENE : scene;
  const shownT = poster ? SCENES[POSTER_SCENE].duration : t;
  const state = deriveState(shownScene, shownT);
  const current = SCENES[scene];

  // Troca de tela com dissolução: a tela anterior fica por baixo enquanto a nova surge.
  const before = !poster && !reduced && (scene > 0 || t >= CROSSFADE) ? deriveAt(scene, t - CROSSFADE) : null;
  const outgoing = before && before.view !== state.view ? before : null;

  const paintBar = () => {
    const bar = barRef.current;
    if (!bar) return;
    bar.style.transform = `scaleX(${clamp(elapsedRef.current / SCENES[sceneRef.current].duration)})`;
  };

  const paintCursor = () => {
    const element = cursorRef.current;
    const motion = motionRef.current;
    if (!element || !motion) return;
    const p = motion.scene === sceneRef.current ? clamp((elapsedRef.current - motion.start) / motion.dur) : 1;
    const e = easeHand(p);
    const dx = motion.to.x - motion.from.x;
    const dy = motion.to.y - motion.from.y;
    // Curva de Bézier quadrática: ponto de controle deslocado na perpendicular do trajeto.
    const controlX = motion.from.x + dx / 2 - dy * motion.bend;
    const controlY = motion.from.y + dy / 2 + dx * motion.bend;
    const inv = 1 - e;
    const x = inv * inv * motion.from.x + 2 * inv * e * controlX + e * e * motion.to.x;
    const y = inv * inv * motion.from.y + 2 * inv * e * controlY + e * e * motion.to.y;
    cursorPosRef.current = { x, y };
    element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  };

  const syncTime = (ms: number) => {
    elapsedRef.current = ms;
    const quantized = Math.floor(ms / QUANT) * QUANT;
    lastQuantRef.current = quantized;
    setT(quantized);
    paintBar();
    paintCursor();
  };

  const goTo = (index: number, keepPlaying = playing) => {
    const next = clamp(index, 0, SCENE_COUNT - 1);
    sceneRef.current = next;
    setScene(next);
    setEnded(false);
    if (!started) setStarted(true);
    const staticView = reduced || !keepPlaying;
    setPlaying(!staticView);
    syncTime(staticView ? SCENES[next].duration : 0);
  };

  const play = () => {
    if (reduced) return;
    if (!started) {
      setStarted(true);
      sceneRef.current = 0;
      setScene(0);
      syncTime(0);
    } else if (ended || elapsedRef.current >= SCENES[sceneRef.current].duration) {
      const restart = ended ? 0 : sceneRef.current;
      sceneRef.current = restart;
      setScene(restart);
      syncTime(0);
    }
    setEnded(false);
    setPlaying(true);
  };

  const togglePlay = () => {
    if (playing) setPlaying(false);
    else play();
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

  // Visibilidade do player na tela.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio >= 0.45), { threshold: [0, 0.45, 0.8] });
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

  // prefers-reduced-motion: sem autoplay, câmera ou cursor; capítulos exibidos no estado final.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReduced(query.matches);
      if (query.matches) {
        setPlaying(false);
        setEnded(false);
        elapsedRef.current = SCENES[sceneRef.current].duration;
        lastQuantRef.current = elapsedRef.current;
        setT(elapsedRef.current);
      }
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // Autoplay silencioso: começa sozinho pouco depois de o player ficar visível (uma vez).
  useEffect(() => {
    if (started || reduced || !inView || !pageVisible) return;
    const timer = window.setTimeout(() => {
      setStarted(true);
      setPlaying(true);
      sceneRef.current = 0;
      setScene(0);
      elapsedRef.current = 0;
      lastQuantRef.current = 0;
      setT(0);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [started, reduced, inView, pageVisible]);

  // Linha do tempo: um único requestAnimationFrame (tempo, barra de progresso e cursor).
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const delta = Math.min(now - last, 100);
      last = now;
      elapsedRef.current += delta;
      if (elapsedRef.current >= SCENES[sceneRef.current].duration) {
        if (sceneRef.current === SCENE_COUNT - 1) {
          elapsedRef.current = SCENES[sceneRef.current].duration;
          lastQuantRef.current = elapsedRef.current;
          setT(elapsedRef.current);
          paintBar();
          setPlaying(false);
          setEnded(true);
          return;
        }
        elapsedRef.current -= SCENES[sceneRef.current].duration;
        sceneRef.current += 1;
        lastQuantRef.current = -1;
        setScene(sceneRef.current);
      }
      const quantized = Math.floor(elapsedRef.current / QUANT) * QUANT;
      if (quantized !== lastQuantRef.current) {
        lastQuantRef.current = quantized;
        setT(quantized);
      }
      paintBar();
      paintCursor();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
    // paintBar/paintCursor leem apenas refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  // Câmera: enquadra a região de ação do momento atual.
  const cameraIndex = lastIndexAt(current.camera, t);
  const cameraKey = poster || reduced ? null : current.camera[cameraIndex] ?? null;
  const cameraSignature = cameraKey ? `${scene}:${cameraIndex}` : "none";
  useIsoLayoutEffect(() => {
    const cameraLayer = cameraRef.current;
    if (!cameraKey || !cameraKey.focus || !cameraLayer) {
      setCamera((prev) => (prev === IDENTITY ? prev : IDENTITY));
      return;
    }
    const measure = () => {
      const view = cameraLayer.querySelector<HTMLElement>("[data-demo-layer='current']");
      const region = view?.querySelector<HTMLElement>(`[data-demo-focus="${cameraKey.focus}"]`);
      const next = frameCamera(region ? measureRegion(region, cameraLayer) : null, cameraKey, design.w, design.h, compact);
      setCamera((prev) => (Math.abs(prev.x - next.x) < 1 && Math.abs(prev.y - next.y) < 1 && Math.abs(prev.s - next.s) < 0.005 ? prev : next));
    };
    // Mede depois do commit da rolagem simulada (que também é ajustada em layout effect).
    let frame = requestAnimationFrame(measure);
    const settle = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    cameraLayer.addEventListener("animationend", settle);
    return () => {
      cancelAnimationFrame(frame);
      cameraLayer.removeEventListener("animationend", settle);
    };
    // cameraKey é identificado por cameraSignature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraSignature, layout, state.view, state.ticket, state.filtersOpen]);

  // Cursor: alvo atual e trajetória curva até ele (pintada pelo rAF da linha do tempo).
  const stepIndex = lastIndexAt(current.cursor, t);
  const previousScene = SCENES[(scene - 1 + SCENE_COUNT) % SCENE_COUNT];
  const step = stepIndex >= 0 ? current.cursor[stepIndex] : null;
  const cursorTarget = poster ? null : step?.target ?? (scene > 0 ? previousScene.cursor[previousScene.cursor.length - 1]?.target : null) ?? null;
  const clickAt = step?.click ? step.at + MOVE : null;
  const clicking = clickAt !== null && t >= clickAt && t < clickAt + CLICK_MS;
  const arrived = step ? t >= step.at + MOVE - 200 : false;
  const touchVisible = Boolean(step?.click) && arrived && clickAt !== null && t < clickAt + 700;
  const stepKey = `${scene}:${stepIndex}`;

  useIsoLayoutEffect(() => {
    if (reduced || !cursorTarget) return;
    const cameraLayer = cameraRef.current;
    if (!cameraLayer) return;
    const measure = () => {
      const view = cameraLayer.querySelector<HTMLElement>("[data-demo-layer='current']");
      const target = view?.querySelector<HTMLElement>(`[data-demo-target="${cursorTarget}"]`);
      if (!target) return;
      const layerBox = cameraLayer.getBoundingClientRect();
      const box = target.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) return;
      const ratio = layerBox.width / design.w || 1;
      const to = {
        x: (box.left - layerBox.left + Math.min(box.width / 2, 110 * ratio)) / ratio,
        y: (box.top - layerBox.top + box.height * 0.55) / ratio,
      };
      const motion = motionRef.current;
      const from = cursorPosRef.current ?? { x: to.x + 60, y: to.y + 90 };
      if (!motion || motion.key !== stepKey || motion.scene !== sceneRef.current) {
        const distance = Math.hypot(to.x - from.x, to.y - from.y);
        bendSignRef.current *= -1;
        motionRef.current = {
          scene: sceneRef.current,
          key: stepKey,
          from,
          to,
          // Parado (pausa ou salto de capítulo): o cursor já aparece no alvo.
          start: !running ? elapsedRef.current - 10000 : step && elapsedRef.current - step.at < 250 ? step.at : elapsedRef.current,
          dur: step ? MOVE : 600,
          bend: distance < 40 ? 0 : 0.16 * bendSignRef.current,
        };
      } else if (Math.abs(motion.to.x - to.x) > 0.5 || Math.abs(motion.to.y - to.y) > 0.5) {
        const p = (elapsedRef.current - motion.start) / motion.dur;
        motionRef.current = p < 1 ? { ...motion, to } : { ...motion, from, to, start: elapsedRef.current, dur: 380, bend: 0 };
      }
      setCursorReady(true);
      paintCursor();
    };
    measure();
    // Reajusta quando zoom do mapa, rolagem simulada ou entradas terminam de se mover.
    let frame = 0;
    const settle = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    cameraLayer.addEventListener("transitionend", settle);
    cameraLayer.addEventListener("animationend", settle);
    return () => {
      cancelAnimationFrame(frame);
      cameraLayer.removeEventListener("transitionend", settle);
      cameraLayer.removeEventListener("animationend", settle);
    };
    // paintCursor/step leem refs ou são cobertos por stepKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorTarget, stepKey, scale, layout, reduced, running, state.view, state.ticket]);

  // Clique: o alvo afunda levemente enquanto o cursor pressiona.
  useEffect(() => {
    if (!clicking || !cursorTarget) return;
    const target = cameraRef.current?.querySelector<HTMLElement>(`[data-demo-layer='current'] [data-demo-target="${cursorTarget}"]`);
    if (!target) return;
    target.setAttribute("data-demo-pressed", "");
    return () => target.removeAttribute("data-demo-pressed");
  }, [clicking, cursorTarget]);

  const setBar = (element: HTMLSpanElement | null) => {
    barRef.current = element;
    paintBar();
  };

  const onTimelineKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(timelineRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const focused = buttons.findIndex((button) => button === document.activeElement);
    const from = focused >= 0 ? focused : scene;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = from + 1;
    else if (event.key === "ArrowLeft") next = from - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = SCENE_COUNT - 1;
    if (next === null) return;
    event.preventDefault();
    const index = clamp(next, 0, SCENE_COUNT - 1);
    goTo(index);
    buttons[index]?.focus();
  };

  // Espaço reproduz/pausa quando o foco está no player (exceto em botões, que já respondem ao espaço).
  const onPlayerKey = (event: ReactKeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const onButton = target.tagName === "BUTTON";
    if ((event.key === " " || event.key === "Spacebar") && !onButton) {
      event.preventDefault();
      if (!reduced) togglePlay();
    } else if (!onButton && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
      event.preventDefault();
      goTo(scene + (event.key === "ArrowRight" ? 1 : -1));
    }
  };

  const lineIndex = lastIndexAt(current.lines, t);
  const subtitle = reduced ? current.description : current.lines[Math.max(0, lineIndex)]?.text ?? current.description;
  const globalMs = poster ? 0 : OFFSETS[scene] + Math.min(t, current.duration);
  const cameraStyle = { transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.s})` };

  return (
    <section
      ref={rootRef}
      className={cx(styles.root, styles[layout], reduced && styles.reduced, poster && styles.isPoster)}
      aria-label="Player da demonstração do EventMap"
      aria-roledescription="player de demonstração"
      onKeyDown={onPlayerKey}
    >
      <div ref={frameRef} className={styles.frameWrap}>
        <div
          className={styles.player}
          tabIndex={0}
          role="group"
          aria-label={`Demonstração: ${reduced ? "use os capítulos para navegar." : "espaço reproduz ou pausa, setas trocam de capítulo."}`}
          aria-keyshortcuts={reduced ? "ArrowLeft ArrowRight" : "Space ArrowLeft ArrowRight"}
          onClick={() => {
            if (!reduced && started && !ended) togglePlay();
          }}
        >
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
              <div className={styles.stage} style={{ width: design.w, height: design.h, transform: `scale(${scale})` }}>
                <div ref={cameraRef} className={styles.camera} style={cameraStyle}>
                  <div className={styles.app}>
                    <AppChrome view={state.view} compact={compact} />
                    <div className={styles.appBody}>
                      <div key={state.view} className={styles.layer} data-demo-layer="current">
                        <ViewContent state={state} compact={compact} />
                      </div>
                      {outgoing && (
                        <div key={outgoing.view} className={cx(styles.layer, styles.layerOut)} data-demo-layer="previous">
                          <ViewContent state={outgoing} compact={compact} />
                        </div>
                      )}
                    </div>
                  </div>
                  {!reduced && (
                    <div ref={cursorRef} className={cx(styles.cursor, (!cursorReady || poster) && styles.cursorHidden, compact && styles.touch, compact && touchVisible && styles.touchOn)}>
                      <span className={styles.cursorScale} style={{ transform: `scale(${1 / camera.s})` }}>
                        {clicking && <span key={`${scene}-${stepIndex}`} className={styles.ripple} />}
                        {compact ? <span className={cx(styles.touchDot, clicking && styles.touchPress)} /> : (
                          <svg className={cx(styles.cursorArrow, clicking && styles.cursorPress)} viewBox="0 0 20 24">
                            <path d="M2 1.5v18.2l4.9-4.6 3.3 7.3 3.2-1.4-3.3-7.2 6.7-.3z" fill="#0B0D12" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                    </div>
                  )}
                </div>
                {state.toast && (
                  <div key={state.toast} className={styles.toast}>
                    <CheckCircle2 />
                    <span>{state.toast}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {poster && (
          <button type="button" className={styles.overlay} onClick={play}>
            <span className={styles.bigPlay}>
              <span className={styles.bigPlayIcon} aria-hidden="true"><Play /></span>
              <span>Assistir demonstração <span className={styles.bigPlayTime}>· {TOTAL_SECONDS} s</span></span>
            </span>
          </button>
        )}
        {ended && !reduced && (
          <button type="button" className={cx(styles.overlay, styles.overlayEnd)} onClick={play}>
            <span className={styles.bigPlay}>
              <span className={styles.bigPlayIcon} aria-hidden="true"><RotateCcw /></span>
              <span>Assistir novamente</span>
            </span>
          </button>
        )}
      </div>

      <div className={styles.caption} aria-hidden="true">
        <p className={styles.captionTitle}>{current.title}</p>
        <p key={`${scene}-${subtitle}`} className={styles.subtitle}>{subtitle}</p>
      </div>
      <p className={styles.srOnly} aria-live="polite" aria-atomic="true">
        {poster ? "" : `Capítulo ${scene + 1} de ${SCENE_COUNT}: ${current.title}. ${current.description}`}
      </p>

      <div className={styles.controls}>
        {compact && (
          <button type="button" className={styles.ctrl} onClick={() => goTo(scene - 1)} disabled={scene === 0 && !poster} aria-label="Capítulo anterior">
            <ChevronLeft aria-hidden="true" />
          </button>
        )}
        {!reduced && (
          <button type="button" className={cx(styles.ctrl, styles.ctrlPlay)} onClick={togglePlay} aria-label={playing ? "Pausar demonstração" : ended ? "Assistir novamente" : "Reproduzir demonstração"}>
            {playing ? <Pause aria-hidden="true" /> : ended ? <RotateCcw aria-hidden="true" /> : <Play aria-hidden="true" />}
          </button>
        )}
        {compact && (
          <button type="button" className={styles.ctrl} onClick={() => goTo(scene + 1)} disabled={scene === SCENE_COUNT - 1} aria-label="Próximo capítulo">
            <ChevronRight aria-hidden="true" />
          </button>
        )}
        <div ref={timelineRef} className={styles.timeline} role="group" aria-label="Capítulos da demonstração" onKeyDown={onTimelineKey}>
          {SCENES.map((item, index) => {
            const active = !poster && index === scene;
            return (
              <button
                key={item.title}
                type="button"
                className={cx(styles.segment, active && styles.segmentOn)}
                style={compact ? undefined : { flexGrow: item.duration }}
                aria-current={active ? "step" : undefined}
                aria-label={`Capítulo ${index + 1} de ${SCENE_COUNT}: ${item.title}`}
                onClick={() => goTo(index, poster ? !reduced : playing)}
              >
                <span className={styles.track} aria-hidden="true">
                  {active
                    ? <span key="active" ref={setBar} className={styles.fill} />
                    : <span key="static" className={cx(styles.fill, !poster && index < scene && styles.fillDone)} />}
                </span>
                <span className={styles.tip} aria-hidden="true">{item.title}</span>
              </button>
            );
          })}
        </div>
        <span className={styles.counter} aria-hidden="true">
          <span className={styles.counterStep}>{poster ? 1 : scene + 1}/{SCENE_COUNT}</span>
          {!compact && <span className={styles.counterTime}>{formatClock(globalMs)} / {formatClock(TOTAL)}</span>}
        </span>
      </div>

      <p className={styles.footnote}>
        <span className={styles.badgeDot} aria-hidden="true" />
        <span>Simulação · dados fictícios</span>
        <span className={styles.footSep} aria-hidden="true">·</span>
        <span>Interface baseada no EventMap real</span>
      </p>
      {reduced && <p className={styles.reducedNote}>Animação desativada pela preferência de movimento reduzido. Use os capítulos para navegar.</p>}
    </section>
  );
}
