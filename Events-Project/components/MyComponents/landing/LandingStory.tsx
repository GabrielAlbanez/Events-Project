import { cn } from "@/lib/utils";
import { Screenshot } from "./DeviceFrames";
import styles from "./Landing.module.css";

const STEPS = [
  {
    title: "Descubra",
    text: "Veja no mapa o que acontece por perto. Filtre por distância, tempo de deslocamento, categoria e preço — ou navegue pela agenda.",
  },
  {
    title: "Participe",
    text: "Salve o evento e receba lembretes. Confirme presença, compre o ingresso por Pix ou siga para a bilheteria do organizador.",
  },
  {
    title: "Viva",
    text: "Acompanhe os avisos na comunidade, converse no chat, conheça gente nas Conexões da festa e entre com seu QR Code.",
  },
] as const;

export function StepsSection() {
  return (
    <section id="passos" className={styles.section} aria-labelledby="passos-titulo">
      <div className={styles.container}>
        <h2 id="passos-titulo" className={styles.h2}>Em três passos.</h2>
        <ol className={styles.steps}>
          {STEPS.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.stepIndex} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <h3 className={styles.h3}><span className="sr-only">Passo {index + 1}: </span>{step.title}</h3>
              <p className={styles.body}>{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

type Band = {
  id: string;
  kicker: string;
  title: string;
  text: string;
  shot: { src: string; alt: string; width: number; height: number; variant?: "desktop" | "phone" };
};

const BANDS: Band[] = [
  {
    id: "mapa",
    kicker: "Mapa",
    title: "A cidade inteira, em um mapa.",
    text: "Cada evento vira um pin. Toque em um cartão da lista e o mapa leva você até ele, com data, endereço e o caminho para chegar.",
    shot: {
      src: "/landing/descoberta-mapa.jpg",
      alt: "Tela de descoberta do EventMap com a lista de eventos próximos em Campinas à esquerda e o Google Maps à direita, mostrando os pins e o cartão do evento Banda Trip no Alma Grey Bowl selecionado, com os botões Ver evento e Detalhes e rota",
      width: 2000,
      height: 1280,
    },
  },
  {
    id: "evento",
    kicker: "Página do evento",
    title: "Tudo o que importa, logo no topo.",
    text: "Quando, onde, quanto custa e como chegar. Adicione à sua agenda, veja eventos parecidos e garanta seu lugar em poucos toques.",
    shot: {
      src: "/landing/evento-detalhes.jpg",
      alt: "Página do evento Banda Trip no Alma Grey Bowl no computador, com o cartaz do show acústico, a categoria e os quadros de data, endereço em Campinas e valor gratuito",
      width: 2368,
      height: 1440,
    },
  },
  {
    id: "ingresso",
    kicker: "Ingresso e entrada",
    title: "Do celular à porta do evento.",
    text: "Em eventos com venda pelo EventMap, você paga por Pix e o ingresso vira sua inscrição, com um QR Code para a entrada. Quando o organizador usa outra bilheteria, o link leva até ela.",
    shot: {
      src: "/landing/evento-celular.jpg",
      alt: "Página do evento Bem da Madrugada Campinas no celular, com o cartaz da ação, o título e a barra fixa com o valor gratuito e os botões de salvar, compartilhar e ver acesso",
      width: 1170,
      height: 1992,
      variant: "phone",
    },
  },
];

export function ShowcaseSection() {
  return (
    <section className={styles.showcase} aria-label="O EventMap por dentro">
      {BANDS.map((band, index) => (
        <article key={band.id} className={styles.band} aria-labelledby={`band-${band.id}`}>
          <div className={cn(styles.container, styles.bandGrid, index % 2 === 1 && styles.bandReverse, band.shot.variant === "phone" && styles.bandGridPhone)}>
            <div className={styles.bandCopy}>
              <p className={styles.kicker}>{band.kicker}</p>
              <h2 id={`band-${band.id}`} className={styles.h2}>{band.title}</h2>
              <p className={styles.bodyLarge}>{band.text}</p>
            </div>
            <Screenshot
              {...band.shot}
              sizes={band.shot.variant === "phone" ? "(max-width: 860px) 70vw, 320px" : "(max-width: 860px) 92vw, 720px"}
              className={styles.bandShot}
            />
          </div>
        </article>
      ))}
    </section>
  );
}
