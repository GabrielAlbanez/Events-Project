"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { DEMO_DATA_CAPTION, REAL_UI_CAPTION } from "./DeviceFrames";
import styles from "./Playground.module.css";
import { clamp01, useMediaQuery, useMotionAllowed, useScrollProgress } from "./useLandingMotion";

type Shot = {
  id: string;
  kicker: string;
  title: string;
  text: string;
  caption: string;
  src: string;
  alt: string;
  width: number;
  height: number;
  phone?: boolean;
};

const SHOTS: Shot[] = [
  {
    id: "mapa",
    kicker: "Mapa e lista",
    title: "A cidade inteira, em um mapa.",
    text: "Cada evento vira um pin. Toque em um cartão e o mapa leva você até ele, com data, endereço, distância e o caminho para chegar.",
    caption: REAL_UI_CAPTION,
    src: "/landing/descoberta-mapa.jpg",
    alt: "Tela de descoberta do EventMap com a lista de eventos próximos em Campinas à esquerda e o Google Maps à direita, mostrando os pins e o cartão do evento Banda Trip no Alma Grey Bowl selecionado",
    width: 2000,
    height: 1280,
  },
  {
    id: "evento",
    kicker: "Página do evento",
    title: "Tudo o que importa, logo no topo.",
    text: "Quando, onde, quanto custa e como chegar. Adicione à agenda, veja eventos parecidos e participe da comunidade e do chat do evento.",
    caption: REAL_UI_CAPTION,
    src: "/landing/evento-detalhes.jpg",
    alt: "Página do evento Banda Trip no Alma Grey Bowl no computador, com o cartaz do show acústico, a categoria e os quadros de data, endereço em Campinas e valor gratuito",
    width: 2368,
    height: 1440,
  },
  {
    id: "celular",
    kicker: "No celular",
    title: "Feito para a palma da mão.",
    text: "A barra fixa deixa preço, salvar, compartilhar e o acesso sempre a um toque, do caminho até a porta.",
    caption: REAL_UI_CAPTION,
    src: "/landing/evento-celular.jpg",
    alt: "Página do evento Bem da Madrugada Campinas no celular, com o cartaz, o título e a barra fixa com o valor gratuito e os botões de salvar, compartilhar e ver acesso",
    width: 1170,
    height: 1992,
    phone: true,
  },
  {
    id: "resultados",
    kicker: "Para quem organiza",
    title: "Resultados de cada evento.",
    text: "Visualizações, cliques em ingressos, favoritos e comparecimento lado a lado, para decidir a próxima edição.",
    caption: DEMO_DATA_CAPTION,
    src: "/landing/painel-resultados.jpg",
    alt: "Página de resultados do organizador com visualizações, cliques em ingressos e favoritos, e gráficos de visualizações recentes por evento",
    width: 1800,
    height: 1140,
  },
];

/** Galeria em profundidade: no desktop a seção fica presa e as capturas reais avançam em direção à câmera. */
export function ShowcaseDepth() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const motionAllowed = useMotionAllowed();
  const wide = useMediaQuery("(min-width: 960px)");
  const enabled = motionAllowed && wide;

  useScrollProgress(
    sectionRef,
    progress => {
      const position = progress * (SHOTS.length - 1);
      itemRefs.current.forEach((node, index) => {
        const frame = node?.querySelector<HTMLElement>("[data-depth-frame]");
        if (!frame) return;
        const t = Math.max(-2, Math.min(1.2, position - index));
        const future = Math.min(0, t);
        const past = Math.max(0, t);
        const y = future * -9 - past * 26;
        const scale = 1 + future * 0.1 + past * 0.06;
        const opacity = t < 0 ? clamp01(1 + future * 0.55) : clamp01(1 - past * 1.6);
        frame.style.transform = `translate3d(0, ${y.toFixed(2)}%, 0) scale(${scale.toFixed(3)})`;
        frame.style.opacity = opacity.toFixed(3);
        frame.style.zIndex = String(10 - Math.round(Math.abs(t) * 3));
      });
      const next = Math.round(position);
      setActive(current => (current === next ? current : next));
    },
    { enabled, mode: "sticky" },
  );

  // Ao desligar o efeito (tela estreita ou movimento reduzido), limpa os estilos escritos no DOM.
  useEffect(() => {
    if (enabled) return;
    itemRefs.current.forEach(node => {
      const frame = node?.querySelector<HTMLElement>("[data-depth-frame]");
      frame?.style.removeProperty("transform");
      frame?.style.removeProperty("opacity");
      frame?.style.removeProperty("z-index");
    });
  }, [enabled]);

  return (
    <div ref={sectionRef} className={cn(styles.showcase, enabled && styles.showcaseDepth)} style={{ "--shots": SHOTS.length } as CSSProperties}>
      <div className={styles.showcaseSticky}>
        <ol className={styles.showcaseList}>
          {SHOTS.map((shot, index) => (
            <li
              key={shot.id}
              ref={node => {
                itemRefs.current[index] = node;
              }}
              className={styles.showcaseItem}
              data-active={!enabled || active === index ? "true" : "false"}
            >
              <div className={styles.showcaseCopy}>
                <p className={styles.showcaseKicker}>{shot.kicker}</p>
                <h3 className={styles.showcaseTitle}>{shot.title}</h3>
                <p className={styles.showcaseText}>{shot.text}</p>
              </div>
              <figure className={cn(styles.showcaseFigure, shot.phone && styles.showcaseFigurePhone)} data-depth-frame>
                <div className={styles.showcaseFrame} style={{ aspectRatio: `${shot.width} / ${shot.height}` }}>
                  <Image
                    src={shot.src}
                    alt={shot.alt}
                    fill
                    loading="lazy"
                    sizes={shot.phone ? "(max-width: 960px) 70vw, 300px" : "(max-width: 960px) 92vw, 760px"}
                    className={styles.cover}
                  />
                </div>
                <figcaption>{shot.caption}</figcaption>
              </figure>
            </li>
          ))}
        </ol>
        {enabled && (
          <div className={styles.showcaseDots} aria-hidden="true">
            {SHOTS.map((shot, index) => (
              <span key={shot.id} data-active={active === index ? "true" : "false"} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
