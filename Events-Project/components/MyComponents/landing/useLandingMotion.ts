"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/*
 * Utilitários de movimento da /conheca.
 * - A página rola dentro do shell do site (overflow-y: auto), não na janela: o progresso é medido no
 *   ancestral rolável mais próximo, com a janela como fallback.
 * - Os efeitos escrevem estilos direto no DOM dentro de um único requestAnimationFrame, sem re-render.
 * - Tudo começa desligado (SSR e primeira pintura) e só liga depois de conferir prefers-reduced-motion.
 */

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function getScrollParent(node: HTMLElement | null): HTMLElement | null {
  let current = node?.parentElement ?? null;
  while (current && current !== document.body && current !== document.documentElement) {
    const { overflowY } = window.getComputedStyle(current);
    if (overflowY === "auto" || overflowY === "scroll") return current;
    current = current.parentElement;
  }
  return null;
}

/** Media query reativa; retorna false no servidor e até o primeiro efeito no cliente. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

/** true apenas quando o visitante não pediu movimento reduzido. */
export function useMotionAllowed(): boolean {
  return useMediaQuery("(prefers-reduced-motion: no-preference)");
}

/**
 * sticky: 0 quando o topo da seção encosta no topo visível, 1 quando o fim dela chega ao fim da tela.
 * leave: 0 com a seção no topo, 1 quando ela saiu inteira por cima.
 * through: 0 quando a seção entra por baixo, 1 quando sai por cima.
 */
export type ProgressMode = "sticky" | "leave" | "through";

type ProgressOptions = { enabled: boolean; mode: ProgressMode };

export function useScrollProgress(target: RefObject<HTMLElement>, onProgress: (progress: number) => void, { enabled, mode }: ProgressOptions) {
  const callback = useRef(onProgress);
  useEffect(() => {
    callback.current = onProgress;
  });

  useEffect(() => {
    const node = target.current;
    if (!enabled || !node) return;
    const scroller = getScrollParent(node);
    const source: HTMLElement | Window = scroller ?? window;
    const headerInset = scroller ? parseFloat(window.getComputedStyle(scroller).getPropertyValue("--site-header-height")) || 0 : 0;
    let frame = 0;

    const measure = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      const viewTop = (scroller ? scroller.getBoundingClientRect().top : 0) + headerInset;
      const viewHeight = (scroller ? scroller.clientHeight : window.innerHeight) - headerInset;
      const top = rect.top - viewTop;
      let progress: number;
      if (mode === "sticky") progress = -top / Math.max(1, rect.height - viewHeight);
      else if (mode === "leave") progress = -top / Math.max(1, rect.height);
      else progress = (viewHeight - top) / Math.max(1, rect.height + viewHeight);
      callback.current(clamp01(progress));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };

    measure();
    source.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      source.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [target, enabled, mode]);
}
