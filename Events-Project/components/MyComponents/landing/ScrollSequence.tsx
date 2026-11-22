"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import lightDesktop from "@/public/landing/sequence/light/desktop/manifest.json";
import lightMobile from "@/public/landing/sequence/light/mobile/manifest.json";
import darkDesktop from "@/public/landing/sequence/dark/desktop/manifest.json";
import darkMobile from "@/public/landing/sequence/dark/mobile/manifest.json";
import styles from "./ScrollSequence.module.css";
import { getScrollParent, useMediaQuery, useMotionAllowed, useScrollProgress } from "./useLandingMotion";

/*
 * "Do mapa à porta do evento": sequência de quadros pré-renderizados (scripts/scroll-scene) desenhada num canvas
 * conforme a rolagem — descer avança, subir volta. Os quadros só começam a baixar quando a seção se aproxima
 * (IntersectionObserver): primeiro o quadro inicial, depois um a cada 8, a cada 4… até completar.
 * Sem movimento reduzido nem JS: a seção não fica alta e mostra o quadro final com os quatro passos.
 */

type Variant = "light" | "dark";
type Size = "desktop" | "mobile";
type SequenceManifest = { count: number; width: number; height: number; path: string };

const SETS: Record<Variant, Record<Size, SequenceManifest>> = {
  light: { desktop: lightDesktop, mobile: lightMobile },
  dark: { desktop: darkDesktop, mobile: darkMobile },
};

const POSTERS: { variant: Variant; size: Size; kind: "start" | "end" }[] = (["light", "dark"] as const).flatMap(variant =>
  (["desktop", "mobile"] as const).flatMap(size => (["start", "end"] as const).map(kind => ({ variant, size, kind }))),
);

type Step = { title: string; text: string; from: number };

/** `from`: progresso da rolagem em que o passo começa, alinhado às fases da cena. */
const STEPS: Step[] = [
  { title: "Encontre no mapa", text: "Os eventos perto de você aparecem como pins na cidade.", from: 0 },
  { title: "Abra o evento", text: "Data, local, preço e lotação reunidos num só cartão.", from: 0.42 },
  { title: "Garanta o lugar", text: "Confirme presença ou pague por Pix sem sair da página.", from: 0.62 },
  { title: "Entre com o QR", text: "O ingresso fica no celular; na porta, basta mostrar o QR Code.", from: 0.8 },
];

const MAX_DPR = 2;
const CONCURRENCY = 4;
const MAX_FAILURE_RATIO = 0.25;

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

const stepAt = (progress: number) => {
  let active = 0;
  STEPS.forEach((step, index) => {
    if (progress >= step.from) active = index;
  });
  return active;
};

export function ScrollSequence() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const stepRef = useRef(0);
  const progressRef = useRef(0);
  const requestDrawRef = useRef<() => void>(() => {});
  const motionAllowed = useMotionAllowed();
  const portrait = useMediaQuery("(orientation: portrait)");
  const { resolvedTheme } = useTheme();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [variant, setVariant] = useState<Variant>("light");
  const size: Size = portrait ? "mobile" : "desktop";

  // O next-themes só resolve o tema no cliente; a classe .dark no <html> é a fonte de verdade enquanto isso.
  useEffect(() => {
    const dark = resolvedTheme ? resolvedTheme === "dark" : document.documentElement.classList.contains("dark");
    setVariant(dark ? "dark" : "light");
  }, [resolvedTheme]);

  // A rolagem não passa pelo React: barra, passo ativo e canvas são atualizados direto no DOM, sem re-render.
  const onProgress = useCallback((progress: number) => {
    progressRef.current = progress;
    barRef.current?.style.setProperty("transform", `scaleX(${progress.toFixed(4)})`);
    const next = stepAt(progress);
    if (next !== stepRef.current) {
      stepRef.current = next;
      listRef.current?.querySelectorAll("li").forEach((item, index) => {
        item.dataset.active = index === next ? "true" : "false";
        if (index === next) item.setAttribute("aria-current", "step");
        else item.removeAttribute("aria-current");
      });
    }
    requestDrawRef.current();
  }, []);

  // Ao ligar o movimento, o React marca o primeiro passo; o ref acompanha esse estado inicial.
  useEffect(() => {
    stepRef.current = 0;
  }, [motionAllowed]);

  useScrollProgress(sectionRef, onProgress, { enabled: motionAllowed && !failed, mode: "sticky" });

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: false });
    if (!motionAllowed || !section || !canvas || !context) return;

    const set = SETS[variant][size];
    const frames: (HTMLImageElement | null)[] = new Array(set.count).fill(null);
    const pending = new Set<HTMLImageElement>();
    let cancelled = false;
    let started = false;
    let failures = 0;
    let lastDrawn = -1;
    let frame = 0;
    setReady(false);
    setFailed(false);

    const nearestLoaded = (target: number) => {
      for (let offset = 0; offset < set.count; offset++) {
        if (frames[target - offset]) return target - offset;
        if (frames[target + offset]) return target + offset;
      }
      return -1;
    };

    // Desenha só quando o quadro muda (ou o canvas foi redimensionado), com ajuste "cover".
    const draw = () => {
      frame = 0;
      const target = Math.round(progressRef.current * (set.count - 1));
      const index = nearestLoaded(target);
      if (index < 0 || index === lastDrawn) return;
      const image = frames[index];
      if (!image) return;
      const { width, height } = canvas;
      const scale = Math.max(width / set.width, height / set.height);
      const drawWidth = set.width * scale;
      const drawHeight = set.height * scale;
      context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
      if (lastDrawn < 0) setReady(true);
      lastDrawn = index;
    };
    const requestDraw = () => {
      if (!frame && !cancelled) frame = window.requestAnimationFrame(draw);
    };
    requestDrawRef.current = requestDraw;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      context.imageSmoothingQuality = "high";
      // Redimensionar limpa o canvas: redesenha no mesmo quadro para não piscar.
      window.cancelAnimationFrame(frame);
      lastDrawn = -2;
      draw();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    const fail = () => {
      if (!cancelled) setFailed(true);
    };

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
        // que decodifica ao desenhar e pode descartar bitmaps sob pressão de memória (120 quadros decodificados
        // de 1600×900 passariam de 600 MB).
        const decoded = index === 0 && typeof image.decode === "function" ? image.decode() : Promise.resolve();
        decoded.catch(() => undefined).then(() => {
          if (cancelled) return;
          frames[index] = image;
          requestDraw();
          settle();
        });
      };
      image.onerror = () => {
        failures += 1;
        if (index === 0 || failures > set.count * MAX_FAILURE_RATIO) fail();
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

    return () => {
      cancelled = true;
      intersection.disconnect();
      resizeObserver.disconnect();
      window.cancelAnimationFrame(frame);
      requestDrawRef.current = () => {};
      pending.forEach(image => {
        image.onload = null;
        image.onerror = null;
        image.src = "";
      });
      pending.clear();
    };
  }, [motionAllowed, variant, size]);

  return (
    <section
      ref={sectionRef}
      className={styles.sequence}
      aria-labelledby="mapa-porta-titulo"
      data-poster={failed ? "end" : "start"}
    >
      <div className={styles.sticky}>
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
          <p className={styles.note}>Cena ilustrativa · a interface real aparece nos capítulos abaixo.</p>
        </div>
      </div>
    </section>
  );
}
