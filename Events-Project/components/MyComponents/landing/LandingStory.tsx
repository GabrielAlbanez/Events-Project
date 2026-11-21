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
    id: "evento",
    kicker: "Página do evento",
    title: "Tudo o que importa, logo no topo.",
    text: "Quando, onde, quanto custa e como chegar. Adicione à sua agenda, veja eventos parecidos e garanta seu lugar em poucos toques.",
    shot: {
      src: "/landing/pagina-evento.jpg",
      alt: "Página do evento Jazz no Terraço no computador, com foto do show, categoria Música, preço de R$ 60,00, descrição e quadro com data e horário",
      width: 1770,
      height: 1185,
    },
  },
  {
    id: "ingresso",
    kicker: "Ingresso e entrada",
    title: "Do celular à porta do evento.",
    text: "Em eventos com venda pelo EventMap, você paga por Pix e o ingresso vira sua inscrição, com um QR Code para a entrada. Quando o organizador usa outra bilheteria, o link leva até ela.",
    shot: {
      src: "/landing/evento-mobile.jpg",
      alt: "Página do evento Festival Pôr do Sol no celular, com foto da festa, indicação de evento gratuito, data, horário e local no Parque Villa-Lobos",
      width: 1170,
      height: 1992,
      variant: "phone",
    },
  },
  {
    id: "agenda",
    kicker: "Agenda",
    title: "Sua semana, sem esforço.",
    text: "Busque por nome ou data, alterne entre lista e calendário e leve os eventos salvos para o calendário do seu celular.",
    shot: {
      src: "/landing/agenda.jpg",
      alt: "Agenda de eventos do EventMap com busca, filtros, alternância entre eventos e calendário e cartões como Jazz no Terraço e Festival Pôr do Sol",
      width: 1860,
      height: 1185,
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
