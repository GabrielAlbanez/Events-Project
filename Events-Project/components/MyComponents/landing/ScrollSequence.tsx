"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useTheme } from "next-themes";
import { CalendarDays, MapPin } from "lucide-react";
import lightDesktop from "@/public/landing/sequence/light/desktop/manifest.json";
import lightDesktopHd from "@/public/landing/sequence/light/desktop-hd/manifest.json";
import lightMobile from "@/public/landing/sequence/light/mobile/manifest.json";
import darkDesktop from "@/public/landing/sequence/dark/desktop/manifest.json";
import darkDesktopHd from "@/public/landing/sequence/dark/desktop-hd/manifest.json";
import darkMobile from "@/public/landing/sequence/dark/mobile/manifest.json";
import cardDesktop from "@/public/landing/sequence/card-desktop.json";
import cardMobile from "@/public/landing/sequence/card-mobile.json";
import styles from "./ScrollSequence.module.css";
import { LandingEventImage } from "./LandingEventImage";
import type { LandingEvent } from "./landingData";
import { getScrollParent, useMediaQuery, useMotionAllowed } from "./useLandingMotion";

/*
 * "Do mapa à porta do evento": quadros pré-renderizados (scripts/scroll-scene) desenhados num canvas conforme a
 * rolagem. A rolagem define um progresso-alvo; o progresso exibido o segue com uma mola criticamente amortecida
 * (independente da taxa de quadros, assenta exatamente e para o laço quando chega). Entre dois quadros vizinhos o
 * canvas faz uma fusão proporcional à fração, então o movimento é contínuo.
 * O cartão e o ingresso nos quadros são superfícies vazias: o conteúdo — o evento real em destaque, ou um cartão
 * genérico sem agenda — é DOM posicionado com a geometria exportada pela própria cena (card-*.json).
 * Sem movimento reduzido nem JS: faixa de uma tela com o quadro final e o ingresso estático.
 */

type Variant = "light" | "dark";
type Size = "desktop" | "desktop-hd" | "mobile";
type Layout = "desktop" | "mobile";
type SequenceManifest = { count: number; width: number; height: number; path: string };
type CardGeometry = { count: number; aspect: number; card: { w: number; h: number }; frames: (number[] | null)[] };

/** Evento em destaque (já formatado no servidor em pt-BR, serializável). */
export type FeaturedEvent = Pick<LandingEvent, "id" | "name" | "category" | "image" | "dateLabel" | "priceLabel" | "place"> & { href: string };

const SETS: Record<Variant, Record<Size, SequenceManifest>> = {
  light: { desktop: lightDesktop, "desktop-hd": lightDesktopHd, mobile: lightMobile },
  dark: { desktop: darkDesktop, "desktop-hd": darkDesktopHd, mobile: darkMobile },
};
const GEOMETRY: Record<Layout, CardGeometry> = { desktop: cardDesktop, mobile: cardMobile };
const layoutOf = (size: Size): Layout => (size === "mobile" ? "mobile" : "desktop");

const VARIANTS = ["light", "dark"] as const;
const SIZES = ["desktop", "desktop-hd", "mobile"] as const;
const POSTERS = VARIANTS.flatMap(variant => SIZES.flatMap(size => (["start", "end"] as const).map(kind => ({ variant, size, kind }))));

type Step = { title: string; text: string; from: number };

/** `from`: progresso da rolagem em que o passo começa, alinhado às fases da cena. */
const STEPS: Step[] = [
  { title: "Encontre no mapa", text: "Os eventos perto de você aparecem como pins na cidade.", from: 0 },
  { title: "Abra o evento", text: "Data, local, preço e lotação reunidos num só cartão.", from: 0.42 },
  { title: "Garanta o lugar", text: "Confirme presença ou pague por Pix sem sair da página.", from: 0.62 },
  { title: "Entre com o QR", text: "O ingresso fica no celular; na porta, basta mostrar o QR Code.", from: 0.8 },
];

const MAX_DPR = 2;
/** Acima desta largura em pixels reais (CSS × DPR) o conjunto 2560×1440 substitui o de 1600×900. */
const HD_MIN_PIXELS = 1700;
const CONCURRENCY = 4;
const MAX_FAILURE_RATIO = 0.25;
/** Mola criticamente amortecida: ω 12 rad/s acompanha a rolagem de perto (assenta em ~0,4 s) sem ultrapassar. */
const OMEGA = 12;
/** Escala de rasterização considerada no orçamento: no máximo 2560 px de largura (além disso não há ganho visível). */
const MAX_BACKING_WIDTH = 2560;
/** Memória para quadros decodificados em camadas (largura × altura × 4 bytes por quadro). */
const DESKTOP_BITMAP_BUDGET = 150 * 1024 * 1024;
const MOBILE_BITMAP_BUDGET = 80 * 1024 * 1024;
const MIN_WINDOW = 4;
const MAX_WINDOW = 16;
const DECODE_CONCURRENCY = 2;
/** Frações muito perto de 0 ou 1 desenham um quadro só (a segunda cópia seria invisível). */
const CROSSFADE_EPSILON = 0.02;
const CARD_VARS = ["--x", "--y", "--sx", "--sy", "--cover", "--a", "--cta-a", "--note"] as const;

const frameUrl = (set: SequenceManifest, index: number) => `${set.path}frame-${String(index).padStart(3, "0")}.webp`;

/** Ordem de carga: primeiro e último quadros, depois a cada 8, 4, 2 e enfim todos — a rolagem nunca fica sem imagem. */
export function preloadOrder(count: number): number[] {
  const order: number[] = [];
  const seen = new Set<number>();
  const add = (index: number) => {
    if (index >= 0 && index < count && !seen.has(index)) {
      seen.add(index);
      order.push(index);
    }
  };
  add(0);
  add(count - 1);
  for (const step of [8, 4, 2, 1]) for (let index = 0; index < count; index += step) add(index);
  return order;
}

/** Um passo exato da mola criticamente amortecida (solução analítica): estável com qualquer dt. */
export function springStep(offset: number, velocity: number, dt: number, omega = OMEGA): [number, number] {
  const decay = Math.exp(-omega * dt);
  const shared = velocity + omega * offset;
  return [(offset + shared * dt) * decay, (velocity - omega * shared * dt) * decay];
}

/** Quantos bitmaps cabem no orçamento para este tamanho de desenho (entre 4 e 16). */
export function bitmapWindow(width: number, height: number, budget: number): number {
  const bytes = Math.max(1, width * height * 4);
  return Math.max(MIN_WINDOW, Math.min(MAX_WINDOW, Math.floor(budget / bytes)));
}

const stepAt = (progress: number) => {
  let active = 0;
  STEPS.forEach((step, index) => {
    if (progress >= step.from) active = index;
  });
  return active;
};

/** Valores do cartão no índice fracionário: interpola os dois quadros vizinhos (null = cartão ainda fechado). */
function cardAt(geometry: CardGeometry, index: number): number[] {
  const last = geometry.frames.length - 1;
  const i0 = Math.max(0, Math.min(last, Math.floor(index)));
  const i1 = Math.min(last, i0 + 1);
  const a = geometry.frames[i0];
  const b = geometry.frames[i1];
  const f = Math.max(0, Math.min(1, index - i0));
  if (!a && !b) return [0.5, 0.5, 0.1, 0.1, 1, 0, 1, 0];
  const from = a ?? [...(b as number[]).slice(0, 5), 0, 1, 0];
  const to = b ?? from;
  return from.map((value, k) => value + (to[k] - value) * f);
}

const finalCard = (geometry: CardGeometry) => cardAt(geometry, geometry.frames.length - 1);

function cardStyle(layout: Layout): CSSProperties {
  const values = finalCard(GEOMETRY[layout]);
  const vars: Record<string, number> = {};
  CARD_VARS.forEach((name, k) => { vars[name] = values[k]; });
  return vars as CSSProperties;
}

/** Geometria de cada layout em variáveis CSS: a orientação escolhe qual vale, sem medir nada no servidor. */
const FRAME_STYLE = {
  "--ar-d": 1 / cardDesktop.aspect,
  "--ar-m": 1 / cardMobile.aspect,
  "--cw-d": cardDesktop.card.w,
  "--cw-m": cardMobile.card.w,
  "--car-d": (cardDesktop.card.w * cardDesktop.aspect) / cardDesktop.card.h,
  "--car-m": (cardMobile.card.w * cardMobile.aspect) / cardMobile.card.h,
} as CSSProperties;

function LiveCardContent({ event }: { event: FeaturedEvent }) {
  return (
    <>
      <span className={styles.liveCover}>
        <LandingEventImage src={event.image} category={event.category} sizes="(orientation: portrait) 60vw, 30vw" className={styles.liveCoverImage} />
        <span className={styles.liveCoverShade} />
      </span>
      <span className={styles.liveBody}>
        <span className={styles.liveChip}>{event.category}</span>
        <strong className={styles.liveName}>{event.name}</strong>
        {event.dateLabel ? <span className={styles.liveMeta}><CalendarDays aria-hidden="true" /><span className={styles.liveMetaText}>{event.dateLabel}</span></span> : null}
        {event.place ? <span className={styles.liveMeta}><MapPin aria-hidden="true" /><span className={styles.liveMetaText}>{event.place}</span></span> : null}
        <span className={styles.livePrice}>{event.priceLabel}</span>
      </span>
      <span className={styles.liveCta} aria-hidden="true">Ver evento</span>
      <span className={styles.liveNote}>QR Code ilustrativo</span>
    </>
  );
}

/** Sem agenda real: o mesmo cartão genérico de antes (marca + blocos), agora em DOM sobre a superfície vazia. */
function GenericCardContent() {
  return (
    <>
      <span className={`${styles.liveCover} ${styles.genericCover}`}><span className={styles.genericPin} /></span>
      <span className={styles.liveBody}>
        <span className={styles.genericBrand}><span className={styles.genericBrandPin} />EventMap</span>
        <span className={styles.genericBar} style={{ width: "82%" }} />
        <span className={styles.genericBar} style={{ width: "56%" }} />
        <span className={styles.genericMeta}><span /><span style={{ width: "50%" }} /></span>
        <span className={styles.genericMeta}><span /><span style={{ width: "38%" }} /></span>
      </span>
      <span className={styles.liveCta}>Garantir lugar</span>
    </>
  );
}

export function ScrollSequence({ featured }: { featured: FeaturedEvent | null }) {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const framesRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const stepRef = useRef(0);
  const targetRef = useRef(0);
  const kickRef = useRef<() => void>(() => {});
  const motionAllowed = useMotionAllowed();
  const portrait = useMediaQuery("(orientation: portrait)");
  const { resolvedTheme } = useTheme();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [variant, setVariant] = useState<Variant>("light");
  const [hd, setHd] = useState(false);
  const size: Size = portrait ? "mobile" : hd ? "desktop-hd" : "desktop";
  const layout = layoutOf(size);
  const setCardRef = useCallback((node: HTMLElement | null) => { cardRef.current = node; }, []);

  // O next-themes só resolve o tema no cliente; a classe .dark no <html> é a fonte de verdade enquanto isso.
  useEffect(() => {
    const dark = resolvedTheme ? resolvedTheme === "dark" : document.documentElement.classList.contains("dark");
    setVariant(dark ? "dark" : "light");
  }, [resolvedTheme]);

  // Conjunto pela largura real em pixels: telas grandes ou retina recebem 2560×1440; as demais, 1600×900.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => setHd(stage.clientWidth * Math.min(window.devicePixelRatio || 1, MAX_DPR) > HD_MIN_PIXELS);
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    update();
    return () => observer.disconnect();
  }, []);

  // Progresso-alvo pela rolagem: o listener passivo só lê scrollTop e guarda o alvo; as medidas da seção ficam em
  // cache (recalculadas por ResizeObserver), então não há getBoundingClientRect por evento nem dentro do rAF.
  useEffect(() => {
    const section = sectionRef.current;
    if (!motionAllowed || failed || !section) return;
    const scroller = getScrollParent(section);
    const source: HTMLElement | Window = scroller ?? window;
    let top = 0;
    let span = 1;
    const measure = () => {
      const headerInset = scroller ? parseFloat(window.getComputedStyle(scroller).getPropertyValue("--site-header-height")) || 0 : 0;
      const rect = section.getBoundingClientRect();
      const viewTop = (scroller ? scroller.getBoundingClientRect().top : 0) + headerInset;
      const scrollTop = scroller ? scroller.scrollTop : window.scrollY;
      const viewHeight = (scroller ? scroller.clientHeight : window.innerHeight) - headerInset;
      top = rect.top - viewTop + scrollTop;
      span = Math.max(1, rect.height - viewHeight);
      onScroll();
    };
    const onScroll = () => {
      const scrollTop = scroller ? scroller.scrollTop : window.scrollY;
      targetRef.current = Math.min(1, Math.max(0, (scrollTop - top) / span));
      kickRef.current();
    };
    // O conteúdo acima (imagens, agenda ao vivo) pode mudar de altura: observa a página inteira, não só a seção.
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(section);
    if (section.parentElement) resizeObserver.observe(section.parentElement);
    if (scroller) resizeObserver.observe(scroller);
    measure();
    source.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      resizeObserver.disconnect();
      source.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
    };
  }, [motionAllowed, failed]);

  // Movimento reduzido ou falha: cartão parado no estado final (o ingresso com o evento).
  useEffect(() => {
    const card = cardRef.current;
    if (!card || (motionAllowed && !failed)) return;
    finalCard(GEOMETRY[layout]).forEach((value, k) => card.style.setProperty(CARD_VARS[k], String(value)));
    // Remove o que o laço escreveu direto nas peças: volta a valer o CSS com as variáveis do estado final.
    for (const element of [card, ...Array.from(card.querySelectorAll<HTMLElement>("[class]"))]) {
      element.style.transform = "";
      element.style.opacity = "";
    }
    card.style.visibility = "";
    card.style.willChange = "";
  }, [motionAllowed, failed, layout]);

  useEffect(() => {
    const section = sectionRef.current;
    const layer = framesRef.current;
    if (!motionAllowed || !section || !layer) return;

    const set = SETS[variant][size];
    const geometry = GEOMETRY[layoutOf(size)];
    // Quadros baixados como Blob (WebP comprimido, ~30–70 KB cada) — só arquivos estáticos do próprio site.
    const blobs: (Blob | null)[] = new Array(set.count).fill(null);
    const abort = new AbortController();
    /*
     * Janela de decodificação: cada quadro próximo vira um elemento de imagem já decodificado fora da thread principal
     * (img.decode()) e promovido a camada própria do compositor. Trocar de quadro é só mudar a opacidade de duas
     * camadas — nada de pintar um canvas grande a cada quadro (o que, medido, custava 60–160 ms por quadro).
     * Quadros que saem da janela são removidos e têm a URL liberada (revokeObjectURL).
     */
    const frames = new Map<number, { image: HTMLImageElement; url: string }>();
    const decoding = new Set<number>();
    const card = cardRef.current;
    const budget = layoutOf(size) === "mobile" ? MOBILE_BITMAP_BUDGET : DESKTOP_BITMAP_BUDGET;
    let windowSize = MIN_WINDOW;
    let cancelled = false;
    let started = false;
    let painted = false;
    let failures = 0;
    let loop = 0;
    let last = 0;
    let shown = targetRef.current;
    let velocity = 0;
    let direction = 1;
    let drawnKey = "";
    let barValue = "";
    let cardVisible = false;
    let lit: HTMLImageElement[] = [];
    const cardValues: string[] = [];
    // Peças do cartão e medidas em cache (atualizadas no resize): o laço não lê layout.
    const parts = {
      cover: card?.querySelector<HTMLElement>(`.${styles.liveCover}`) ?? null,
      shade: card?.querySelector<HTMLElement>(`.${styles.liveCoverShade}`) ?? null,
      body: card?.querySelector<HTMLElement>(`.${styles.liveBody}`) ?? null,
      cta: card?.querySelector<HTMLElement>(`.${styles.liveCta}`) ?? null,
      note: card?.querySelector<HTMLElement>(`.${styles.liveNote}`) ?? null,
    };
    const box = { width: 0, height: 0, cardWidth: 0, cardHeight: 0, coverHeight: 0 };
    const measureCard = () => {
      const frameBox = card?.parentElement;
      if (!card || !frameBox) return;
      box.width = frameBox.offsetWidth;
      box.height = frameBox.offsetHeight;
      box.cardWidth = card.offsetWidth;
      box.cardHeight = card.offsetHeight;
      box.coverHeight = parts.cover?.offsetHeight ?? 0;
      cardValues.length = 0;
    };
    const clearCard = () => {
      if (!card) return;
      card.style.transform = "";
      card.style.opacity = "";
      for (const part of Object.values(parts)) {
        if (!part) continue;
        part.style.transform = "";
        part.style.opacity = "";
      }
    };
    setReady(false);
    setFailed(false);
    if (card) card.dataset.driven = "true";

    const currentIndex = () => shown * (set.count - 1);

    const drop = (index: number) => {
      const entry = frames.get(index);
      if (!entry) return;
      entry.image.remove();
      URL.revokeObjectURL(entry.url);
      frames.delete(index);
    };

    const evict = () => {
      if (frames.size <= windowSize) return;
      const center = currentIndex();
      const sorted = Array.from(frames.keys()).sort((a, b) => Math.abs(b - center) - Math.abs(a - center));
      for (const index of sorted) {
        if (frames.size <= windowSize) break;
        if (lit.includes(frames.get(index)?.image as HTMLImageElement)) continue;
        drop(index);
      }
    };

    // Agenda a decodificação da janela à frente (no sentido da rolagem) e um pouco atrás.
    const scheduleDecode = () => {
      if (cancelled) return;
      const center = Math.round(currentIndex());
      const ahead = Math.max(2, Math.round(windowSize * 0.7));
      const behind = Math.max(1, windowSize - ahead - 1);
      const wanted: number[] = [center];
      for (let k = 1; k <= Math.max(ahead, behind); k++) {
        if (k <= ahead) wanted.push(center + direction * k);
        if (k <= behind) wanted.push(center - direction * k);
      }
      for (const index of wanted) {
        if (decoding.size >= DECODE_CONCURRENCY) break;
        if (index < 0 || index >= set.count || frames.has(index) || decoding.has(index)) continue;
        const blob = blobs[index];
        if (!blob) continue;
        decoding.add(index);
        const url = URL.createObjectURL(blob);
        const image = new window.Image();
        image.alt = "";
        image.decoding = "async";
        image.className = styles.frame;
        image.src = url;
        image.decode().catch(() => undefined).then(() => {
          decoding.delete(index);
          if (cancelled || !image.naturalWidth) {
            URL.revokeObjectURL(url);
            return;
          }
          layer.appendChild(image);
          frames.set(index, { image, url });
          evict();
          if (Math.abs(index - currentIndex()) <= 1.5 || !painted) {
            drawnKey = "";
            kick();
          }
          scheduleDecode();
        });
      }
    };

    const nearestReady = (target: number) => {
      for (let offset = 0; offset < set.count; offset++) {
        if (frames.has(target - offset)) return target - offset;
        if (frames.has(target + offset)) return target + offset;
      }
      return -1;
    };

    // Mostra o quadro de baixo inteiro e o de cima com opacidade = fração (pulada perto de 0 ou 1).
    const drawFrames = (progress: number) => {
      const index = progress * (set.count - 1);
      let i0 = Math.floor(index);
      let fraction = index - i0;
      if (fraction > 1 - CROSSFADE_EPSILON) {
        i0 = Math.min(set.count - 1, i0 + 1);
        fraction = 0;
      } else if (fraction < CROSSFADE_EPSILON) fraction = 0;
      const i1 = Math.min(set.count - 1, i0 + 1);
      const quantized = Math.round(fraction * 64) / 64;
      let key: string;
      if (frames.has(i0) && (quantized === 0 || i1 === i0 || frames.has(i1))) key = quantized > 0 && i1 !== i0 ? `${i0}:${i1}:${quantized}` : `${i0}`;
      else {
        const nearest = nearestReady(Math.round(index));
        if (nearest < 0) return;
        key = `${nearest}`;
      }
      if (key === drawnKey) return;
      drawnKey = key;
      const [a, b, f] = key.split(":");
      const base = frames.get(Number(a))?.image;
      if (!base) return;
      const top = b && f ? frames.get(Number(b))?.image : undefined;
      const next = top ? [base, top] : [base];
      for (const image of lit) {
        if (!next.includes(image)) image.style.opacity = "0";
      }
      base.style.zIndex = "1";
      base.style.opacity = "1";
      if (top) {
        top.style.zIndex = "2";
        top.style.opacity = f;
      }
      lit = next;
      if (!painted) {
        painted = true;
        setReady(true);
      }
    };

    // Barra, passo ativo e cartão seguem o progresso exibido; só escreve no DOM quando o valor muda.
    const renderUi = (progress: number) => {
      const bar = `scaleX(${progress.toFixed(4)})`;
      if (bar !== barValue && barRef.current) {
        barValue = bar;
        barRef.current.style.transform = bar;
      }
      const next = stepAt(progress);
      if (next !== stepRef.current) {
        stepRef.current = next;
        listRef.current?.querySelectorAll("li").forEach((item, index) => {
          item.dataset.active = index === next ? "true" : "false";
          if (index === next) item.setAttribute("aria-current", "step");
          else item.removeAttribute("aria-current");
        });
      }
      if (!card) return;
      const values = cardAt(geometry, progress * (geometry.count - 1));
      const visible = values[5] >= 0.02;
      if (visible !== cardVisible) {
        cardVisible = visible;
        // Invisível = fora da ordem de tabulação e da árvore de acessibilidade; will-change só enquanto aparece.
        card.style.visibility = visible ? "" : "hidden";
        card.style.willChange = visible ? "transform, opacity" : "";
      }
      if (!visible && cardValues[5] === "0.0000") return;
      // Escreve transform/opacity direto em cada peça (sem variáveis herdadas): só elas recalculam, nada de layout.
      const [x, y, sx, sy, coverK, alpha, cta, note] = values;
      const write = (k: number, value: number, apply: (text: string) => void) => {
        const text = value.toFixed(4);
        if (cardValues[k] === text) return;
        cardValues[k] = text;
        apply(text);
      };
      const moved = cardValues[0] !== x.toFixed(4) || cardValues[1] !== y.toFixed(4) || cardValues[2] !== sx.toFixed(4) || cardValues[3] !== sy.toFixed(4);
      if (moved) {
        cardValues[0] = x.toFixed(4);
        cardValues[1] = y.toFixed(4);
        cardValues[2] = sx.toFixed(4);
        cardValues[3] = sy.toFixed(4);
        card.style.transform = `translate(${(x * box.width - box.cardWidth / 2).toFixed(2)}px, ${(y * box.height - box.cardHeight / 2).toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
      }
      write(4, coverK, text => {
        if (parts.cover) parts.cover.style.transform = `scaleY(${text})`;
        if (parts.shade) parts.shade.style.opacity = String((1 - coverK) * 0.45);
        if (parts.body) parts.body.style.transform = `translateY(${(coverK * box.coverHeight).toFixed(2)}px)`;
      });
      write(5, alpha, text => { card.style.opacity = text; });
      write(6, cta, text => { if (parts.cta) parts.cta.style.opacity = text; });
      write(7, note, text => { if (parts.note) parts.note.style.opacity = text; });
    };

    // Um único laço: mola + troca de camadas + escritas no DOM; para quando assenta.
    const tick = (now: number) => {
      loop = 0;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
      last = now;
      const target = targetRef.current;
      const before = shown;
      const [offset, nextVelocity] = springStep(shown - target, velocity, dt);
      shown = target + offset;
      velocity = nextVelocity;
      const settled = Math.abs(offset) < 0.0002 && Math.abs(velocity) < 0.002;
      if (settled) {
        shown = target;
        velocity = 0;
      }
      if (shown !== before) direction = shown > before ? 1 : -1;
      drawFrames(shown);
      renderUi(shown);
      scheduleDecode();
      if (!settled && !cancelled) loop = window.requestAnimationFrame(tick);
      else last = 0;
    };
    const kick = () => {
      if (!loop && !cancelled) loop = window.requestAnimationFrame(tick);
    };
    kickRef.current = kick;

    // Janela no orçamento de memória: cada camada ocupa a área exibida × min(DPR, 2)² × 4 bytes.
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const ratio = Math.min(dpr, MAX_BACKING_WIDTH / Math.max(1, layer.clientWidth));
      windowSize = bitmapWindow(Math.round(layer.clientWidth * ratio), Math.round(layer.clientHeight * ratio), budget);
      measureCard();
      renderUi(shown);
      evict();
      scheduleDecode();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(layer);
    if (card?.parentElement) resizeObserver.observe(card.parentElement);
    resize();
    renderUi(shown);

    const queue = preloadOrder(set.count);
    const loadNext = async (): Promise<void> => {
      while (!cancelled) {
        const index = queue.shift();
        if (index === undefined) return;
        try {
          const response = await fetch(frameUrl(set, index), { signal: abort.signal });
          if (!response.ok) throw new Error(String(response.status));
          blobs[index] = await response.blob();
          scheduleDecode();
        } catch {
          if (cancelled) return;
          failures += 1;
          if (index === 0 || failures > set.count * MAX_FAILURE_RATIO) {
            setFailed(true);
            return;
          }
        }
      }
    };
    const start = () => {
      if (started) return;
      started = true;
      for (let worker = 0; worker < CONCURRENCY; worker++) void loadNext();
    };

    // Carrega só quando a seção chega a cerca de uma tela de distância, medida no contêiner que rola.
    const intersection = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        start();
        intersection.disconnect();
      }
    }, { root: getScrollParent(section), rootMargin: "100% 0px 100% 0px" });
    intersection.observe(section);
    kick();

    return () => {
      cancelled = true;
      intersection.disconnect();
      resizeObserver.disconnect();
      window.cancelAnimationFrame(loop);
      kickRef.current = () => {};
      Array.from(frames.keys()).forEach(drop);
      clearCard();
      if (card) {
        delete card.dataset.driven;
        card.style.willChange = "";
      }
      abort.abort();
    };
  }, [motionAllowed, variant, size]);

  const cardLabel = featured ? `${featured.name}. ${[featured.dateLabel, featured.place, featured.priceLabel].filter(Boolean).join(" · ")}. Ver evento` : undefined;

  return (
    <section
      ref={sectionRef}
      className={styles.sequence}
      aria-labelledby="mapa-porta-titulo"
      data-poster={failed ? "end" : "start"}
    >
      <div className={styles.sticky}>
        <div ref={stageRef} className={styles.stage} style={FRAME_STYLE}>
          <div className={styles.media} aria-hidden="true">
            {POSTERS.map(poster => (
              <Image
                key={`${poster.variant}-${poster.size}-${poster.kind}`}
                src={frameUrl(SETS[poster.variant][poster.size], poster.kind === "start" ? 0 : SETS[poster.variant][poster.size].count - 1)}
                alt=""
                fill
                unoptimized
                loading="lazy"
                sizes="100vw"
                className={styles.poster}
                data-variant={poster.variant}
                data-size={poster.size}
                data-kind={poster.kind}
              />
            ))}
            <div ref={framesRef} className={styles.frames} data-ready={ready && !failed ? "true" : "false"} aria-hidden="true" />
          </div>
          <div className={styles.frameBox}>
            {featured ? (
              <Link ref={setCardRef} href={featured.href} className={styles.liveCard} style={cardStyle(layout)} aria-label={cardLabel}>
                <LiveCardContent event={featured} />
              </Link>
            ) : (
              <div ref={setCardRef} className={styles.liveCard} style={cardStyle(layout)} aria-hidden="true">
                <GenericCardContent />
              </div>
            )}
          </div>
        </div>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>Do mapa à porta do evento</p>
          <h2 id="mapa-porta-titulo" className={styles.title}>Um caminho só, do pin ao QR Code.</h2>
          <ol ref={listRef} className={styles.steps}>
            {STEPS.map((item, index) => (
              <li key={item.title} className={styles.step} data-active={motionAllowed && index === 0 ? "true" : "false"} aria-current={motionAllowed && index === 0 ? "step" : undefined}>
                <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
                <span className={styles.stepBody}>
                  <strong>{item.title}</strong>
                  <span className={styles.stepText}>{item.text}</span>
                </span>
              </li>
            ))}
          </ol>
          <span className={styles.progress} aria-hidden="true"><span ref={barRef} className={styles.progressBar} /></span>
          <p className={styles.note}>
            {featured ? "Cena ilustrativa com um evento real da agenda · o QR Code é só ilustração." : "Cena ilustrativa · a interface real aparece nos capítulos abaixo."}
          </p>
        </div>
      </div>
    </section>
  );
}
