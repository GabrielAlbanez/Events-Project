"use client";

import { useCallback, useRef } from "react";
import styles from "./Landing.module.css";
import { useScrollProgress } from "./useLandingMotion";

/** Barra fina de leitura da página. Atualiza só um transform; não é animação, então vale também com movimento reduzido. */
export function ScrollProgress() {
  const barRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLElement | null>(null);
  // O alvo medido é a página inteira (pai da trilha); a ref de callback roda antes do efeito de medição.
  const trackRef = useCallback((node: HTMLDivElement | null) => {
    pageRef.current = node?.parentElement ?? null;
  }, []);

  useScrollProgress(
    pageRef,
    progress => {
      if (barRef.current) barRef.current.style.transform = `scaleX(${progress.toFixed(4)})`;
    },
    { enabled: true, mode: "sticky" },
  );

  return (
    <div ref={trackRef} className={styles.progressTrack} aria-hidden="true">
      <div ref={barRef} className={styles.progressBar} />
    </div>
  );
}
