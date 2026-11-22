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
import { getScrollParent, useMediaQuery, useMotionAllowed, useScrollProgress } from "./useLandingMotion";

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
/** Mola criticamente amortecida: ω maior segue a rolagem mais de perto; ~9 rad/s assenta em ~0,5 s sem ultrapassar. */
const OMEGA = 9;
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  const onProgress = useCallback((progress: number) => {
    targetRef.current = progress;
    kickRef.current();
  }, []);

  useScrollProgress(sectionRef, onProgress, { enabled: motionAllowed && !failed, mode: "sticky" });

  // Movimento reduzido ou falha: cartão parado no estado final (o ingresso com o evento).
  useEffect(() => {
    const card = cardRef.current;
    if (!card || (motionAllowed && !failed)) return;
    finalCard(GEOMETRY[layout]).forEach((value, k) => card.style.setProperty(CARD_VARS[k], String(value)));
    card.style.visibility = "";
  }, [motionAllowed, failed, layout]);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: false });
    if (!motionAllowed || !section || !canvas || !context) return;

    const set = SETS[variant][size];
    const geometry = GEOMETRY[layoutOf(size)];
    const frames: (HTMLImageElement | null)[] = new Array(set.count).fill(null);
    const pending = new Set<HTMLImageElement>();
    const card = cardRef.current;
    let cancelled = false;
    let started = false;
    let painted = false;
    let failures = 0;
    let loop = 0;
    let last = 0;
    let shown = targetRef.current;
    let velocity = 0;
    let drawnKey = "";
    let barValue = "";
    const cardValues: string[] = [];
    setReady(false);
    setFailed(false);
    if (card) card.dataset.driven = "true";

    const nearestLoaded = (target: number) => {
      for (let offset = 0; offset < set.count; offset++) {
        if (frames[target - offset]) return target - offset;
        if (frames[target + offset]) return target + offset;
      }
      return -1;
    };

    const cover = (image: HTMLImageElement, alpha: number) => {
      const { width, height } = canvas;
      const scale = Math.max(width / set.width, height / set.height);
      const drawWidth = set.width * scale;
      const drawHeight = set.height * scale;
      context.globalAlpha = alpha;
      context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    };

    // Fusão entre o quadro de baixo e o de cima pela fração; sem um dos dois, o carregado mais próximo, inteiro.
    const drawFrames = (progress: number) => {
      const index = progress * (set.count - 1);
      const i0 = Math.floor(index);
      const i1 = Math.min(set.count - 1, i0 + 1);
      const quantized = Math.round((index - i0) * 64) / 64;
      let key: string;
      if (frames[i0] && frames[i1]) key = quantized > 0 && i1 !== i0 ? `${i0}:${i1}:${quantized}` : `${i0}`;
      else {
        const nearest = nearestLoaded(Math.round(index));
        if (nearest < 0) return;
        key = `${nearest}`;
      }
      if (key === drawnKey) return;
      drawnKey = key;
      const [a, b, f] = key.split(":");
      const first = frames[Number(a)];
      if (!first) return;
      cover(first, 1);
      const second = b ? frames[Number(b)] : null;
      if (second && f) cover(second, Number(f));
      context.globalAlpha = 1;
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
      values.forEach((value, k) => {
        const text = value.toFixed(4);
        if (cardValues[k] !== text) {
          cardValues[k] = text;
          card.style.setProperty(CARD_VARS[k], text);
        }
      });
      // Invisível = fora da ordem de tabulação e da árvore de acessibilidade.
      const visibility = values[5] < 0.02 ? "hidden" : "";
      if (card.style.visibility !== visibility) card.style.visibility = visibility;
    };

    const tick = (now: number) => {
      loop = 0;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
      last = now;
      const target = targetRef.current;
      const [offset, nextVelocity] = springStep(shown - target, velocity, dt);
      shown = target + offset;
      velocity = nextVelocity;
      const settled = Math.abs(offset) < 0.0002 && Math.abs(velocity) < 0.002;
      if (settled) {
        shown = target;
        velocity = 0;
      }
      drawFrames(shown);
      renderUi(shown);
      if (!settled && !cancelled) loop = window.requestAnimationFrame(tick);
      else last = 0;
    };
    const kick = () => {
      if (!loop && !cancelled) loop = window.requestAnimationFrame(tick);
    };
    kickRef.current = kick;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      // Redimensionar limpa o canvas: redesenha já, no mesmo quadro, para não piscar.
      drawnKey = "";
      drawFrames(shown);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();
    renderUi(shown);

    const queue = preloadOrder(set.count);
    const loadNext = () => {
      if (cancelled) return;
      const index = queue.shift();
      if (index === undefined) return;
      const image = new window.Image();
      image.decoding = "async";
      pending.add(image);
      const settle = () => {
        pending.delete(image);
        loadNext();
      };
      image.onload = () => {
        // Só o primeiro quadro é decodificado à força (pintura inicial suave). Os demais ficam com o navegador,
        // que decodifica ao desenhar e pode descartar bitmaps sob pressão de memória.
        const decoded = index === 0 && typeof image.decode === "function" ? image.decode() : Promise.resolve();
        decoded.catch(() => undefined).then(() => {
          if (cancelled) return;
          frames[index] = image;
          // Redesenha se o quadro novo é vizinho do exibido (ou se nada foi pintado ainda).
          if (!painted || Math.abs(index - shown * (set.count - 1)) <= 1.5) {
            drawnKey = "";
            kick();
          }
          settle();
        });
      };
      image.onerror = () => {
        failures += 1;
        if ((index === 0 || failures > set.count * MAX_FAILURE_RATIO) && !cancelled) setFailed(true);
        settle();
      };
      image.src = frameUrl(set, index);
    };
    const start = () => {
      if (started) return;
      started = true;
      for (let worker = 0; worker < CONCURRENCY; worker++) loadNext();
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
      if (card) delete card.dataset.driven;
      pending.forEach(image => {
        image.onload = null;
        image.onerror = null;
        image.src = "";
      });
      pending.clear();
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
            <canvas ref={canvasRef} className={styles.canvas} data-ready={ready && !failed ? "true" : "false"} aria-hidden="true" />
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
