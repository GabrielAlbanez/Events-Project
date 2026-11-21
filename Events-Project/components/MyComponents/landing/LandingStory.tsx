import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight, BarChart3, MapPinned, BellRing, CalendarDays, Check, ClipboardList, Heart, MessagesSquare,
  QrCode, Repeat, Sparkles, Star, UserPlus, Users, Vote, Wand2, X,
} from "lucide-react";
import { FadeInView } from "@/components/animations/FadeInView";
import ProductDemo from "@/components/MyComponents/landing/ProductDemo";
import { cn } from "@/lib/utils";
import styles from "./Landing.module.css";

/* ---------------- Problema → solução ---------------- */

const AUDIENCES = [
  {
    label: "Quem vai",
    code: "B2C",
    title: "Descobrir tarde. Decidir no grupo. Chegar sem conhecer ninguém.",
    pains: [
      "Descobre o evento pelo feed — quando já passou.",
      "Não sabe se vale o deslocamento.",
      "Decide com os amigos num grupo bagunçado.",
      "Chega sem conhecer ninguém.",
    ],
    fixes: [
      "Mapa com o que acontece perto, filtrado por raio e tempo até o local.",
      "Lembretes e notificações antes de começar.",
      "Sala com amigos: cada um sugere, todo mundo vota.",
      "Comunidade e conexões opt-in quando você chega.",
    ],
  },
  {
    label: "Quem organiza",
    code: "B2B",
    title: "Cinco grupos de WhatsApp, uma planilha e uma fila na porta.",
    pains: [
      "Avisos espalhados em grupos que ninguém lê.",
      "Lista de presença em planilha e fila na entrada.",
      "Público que vai uma vez e não volta.",
      "Nenhum dado de interesse antes do evento.",
    ],
    fixes: [
      "Comunicados oficiais, perguntas e enquetes num só canal.",
      "Inscrição com capacidade, lista de espera automática e QR na porta.",
      "Seguidores recebem seus próximos eventos.",
      "Painel com visualizações, cliques no ingresso e favoritos.",
    ],
  },
];

export function ProblemSection() {
  return (
    <section className={styles.section} aria-labelledby="problema-titulo">
      <div className={styles.container}>
        <FadeInView className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>O problema</p>
            <h2 id="problema-titulo" className={styles.h2}>O evento não termina quando o ingresso é vendido.</h2>
          </div>
          <p className={styles.lead}>
            Bilheterias resolvem a venda. Todo o resto — descobrir, decidir, chegar, falar com o público e trazê-lo de volta — acontece em lugares que não conversam entre si.
          </p>
        </FadeInView>
        <div className={styles.problemGrid}>
          {AUDIENCES.map((audience, index) => (
            <FadeInView key={audience.label} delay={index * 0.06} className={styles.problemCard}>
              <div className={styles.problemTop}>
                <p className={styles.problemLabel}><span>{audience.label}</span><span>{audience.code}</span></p>
                <h3 className={styles.h3}>{audience.title}</h3>
                <ul className={styles.painList} aria-label={`Dores de ${audience.label.toLowerCase()}`}>
                  {audience.pains.map(pain => <li key={pain}><X size={16} aria-hidden="true" />{pain}</li>)}
                </ul>
              </div>
              <div className={styles.problemBottom}>
                <p className={styles.fixTitle}><Sparkles size={14} aria-hidden="true" />Com o EventMap</p>
                <ul className={styles.fixList}>
                  {audience.fixes.map(fix => <li key={fix}><Check size={16} aria-hidden="true" />{fix}</li>)}
                </ul>
              </div>
            </FadeInView>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- Demonstração ---------------- */

export function DemoSection() {
  return (
    <section id="demo" className={cn(styles.section, styles.muted)} aria-labelledby="demo-titulo">
      <div className={styles.container}>
        <FadeInView className={styles.sectionHeadCenter}>
          <p className={styles.eyebrow}>Demonstração interativa</p>
          <h2 id="demo-titulo" className={styles.h2}>Do mapa ao check-in, sem sair desta página.</h2>
          <p className={styles.lead}>
            Acompanhe uma noite pelos olhos de quem vai: encontrar um evento perto, salvar, se inscrever, entrar na comunidade e passar pela porta com o QR.
          </p>
        </FadeInView>
        <div className={styles.demoWrap}>
          <ProductDemo />
        </div>
        <p className={styles.demoNote}>
          <span>Simulação com dados fictícios — nada aqui chama a plataforma. Prefere explorar com calma?</span>
          <Link href="/demonstracao" className={styles.textLink}>Demonstração guiada <ArrowRight size={15} aria-hidden="true" /></Link>
        </p>
      </div>
    </section>
  );
}

/* ---------------- Jornada (bento) ---------------- */

type Tile = {
  icon: LucideIcon;
  title: string;
  text: string;
  span: string;
  feature?: "map" | "community" | "results";
  chips?: string[];
  wide?: boolean;
  tag?: string;
};

type Phase = { num: string; title: string; text: string; tiles: Tile[] };

const PHASES: Phase[] = [
  {
    num: "01",
    title: "Antes",
    text: "Descobrir, decidir e garantir o lugar.",
    tiles: [
      { icon: MapPinned, title: "O mapa responde “vale ir?”", text: "Clusters, lista sincronizada e filtros por categoria, preço, raio a partir de você e tempo de deslocamento.", span: cn(styles.span4, styles.rows2), feature: "map", tag: "Raro nos concorrentes" },
      { icon: CalendarDays, title: "Agenda e calendário", text: "Lista ou calendário, página pública do evento e exportação .ics.", span: styles.span2 },
      { icon: BellRing, title: "Favoritos e lembretes", text: "Salve, receba lembretes e notificações push no navegador.", span: styles.span2 },
      { icon: Heart, title: "Recomendações", text: "Sugestões pelo seu gosto e pelos organizadores que você segue.", span: styles.span2 },
      { icon: Vote, title: "Salas com amigos", text: "Cada um sugere um evento, a sala vota e o rolê se decide.", span: styles.span2 },
      { icon: ClipboardList, title: "Inscrição com lotação", text: "Capacidade definida e lista de espera que anda sozinha.", span: styles.span2 },
    ],
  },
  {
    num: "02",
    title: "Durante",
    text: "Um canal oficial, gente conectada e porta sem fila.",
    tiles: [
      {
        icon: Users,
        title: "Comunidade do evento",
        text: "O lugar oficial do evento — moderado, organizado e em tempo real. Substitui os grupos espalhados.",
        span: cn(styles.span4, styles.rows2),
        feature: "community",
        chips: ["Comunicados", "Perguntas", "Enquetes", "Programação", "Filas virtuais", "Equipe e tarefas", "Achados e perdidos"],
      },
      { icon: MessagesSquare, title: "Chat ao vivo", text: "Conversa dos participantes com imagens, digitação e confirmação de leitura.", span: styles.span2 },
      { icon: UserPlus, title: "Conexões da festa", text: "Perfil opt-in, curtidas e match. Com bloqueio e denúncia.", span: styles.span2 },
      { icon: QrCode, title: "Check-in por QR", text: "Cada inscrito recebe um QR assinado; a equipe lê na porta pelo celular e a presença fica registrada.", span: styles.span6, wide: true },
    ],
  },
  {
    num: "03",
    title: "Depois",
    text: "Aprender com o evento e trazer o público de volta.",
    tiles: [
      { icon: BarChart3, title: "Painel de resultados", text: "Visualizações, cliques no ingresso e favoritos por evento, com série diária.", span: cn(styles.span3, styles.rows2), feature: "results" },
      { icon: Star, title: "Avaliação pós-evento", text: "Quem foi avalia — você sabe o que repetir.", span: styles.span3 },
      { icon: Heart, title: "Seguir organizadores", text: "Audiência própria: seguidores recebem seus próximos eventos.", span: styles.span3 },
      { icon: Repeat, title: "Séries recorrentes", text: "Toda quinta, todo mês: crie a série uma vez.", span: styles.span3 },
      { icon: Wand2, title: "Curadoria com IA", text: "Eventos de fontes oficiais sugeridos por IA, publicados só com aprovação humana.", span: styles.span3 },
    ],
  },
];

function MapArt() {
  return (
    <svg className={styles.tileArt} viewBox="0 0 600 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width="600" height="360" fill="hsl(224 36% 7%)" />
      <g stroke="hsl(218 40% 80%)" strokeOpacity="0.08">
        {Array.from({ length: 14 }, (_, index) => <line key={`v${index}`} x1={index * 46} y1="0" x2={index * 46 - 60} y2="360" />)}
        {Array.from({ length: 9 }, (_, index) => <line key={`h${index}`} x1="0" y1={index * 44} x2="600" y2={index * 44 + 30} />)}
      </g>
      <path d="M0 250 C 120 220, 220 260, 330 190 S 520 90, 600 70" fill="none" stroke="hsl(218 50% 85%)" strokeOpacity="0.16" strokeWidth="3" />
      <circle cx="400" cy="120" r="92" fill="hsl(226.58 100% 57%)" fillOpacity="0.12" stroke="hsl(226.58 100% 70%)" strokeOpacity="0.5" strokeDasharray="4 6" />
      <circle cx="400" cy="120" r="7" fill="hsl(226.58 100% 70%)" />
      <circle cx="400" cy="120" r="16" fill="none" stroke="hsl(226.58 100% 70%)" strokeOpacity="0.4" />
      {[[452, 78], [350, 160], [470, 170], [330, 88]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="5" fill="hsl(75.62 87.56% 62%)" />)}
      {[[120, 90], [200, 300], [560, 290]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill="hsl(218 30% 60%)" />)}
      <rect width="600" height="360" fill="url(#mapFade)" />
      <defs>
        <linearGradient id="mapFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.35" stopColor="hsl(224 36% 6%)" stopOpacity="0" />
          <stop offset="1" stopColor="hsl(224 36% 6%)" stopOpacity="0.95" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function ResultsArt() {
  const bars = [28, 44, 36, 52, 48, 70, 82];
  return (
    <svg className={styles.tileArt} viewBox="0 0 400 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width="400" height="360" fill="hsl(224 36% 7%)" />
      <g transform="translate(40 40)">
        {bars.map((height, index) => (
          <rect key={index} x={index * 46} y={150 - height * 1.6} width="30" height={height * 1.6} rx="6" fill={index === bars.length - 1 ? "hsl(75.62 87.56% 62%)" : "hsl(226.58 100% 62%)"} fillOpacity={index === bars.length - 1 ? 1 : 0.35 + index * 0.08} />
        ))}
        <line x1="0" y1="152" x2="320" y2="152" stroke="hsl(0 0% 100%)" strokeOpacity="0.12" />
      </g>
      <rect width="400" height="360" fill="url(#resultsFade)" />
      <defs>
        <linearGradient id="resultsFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.4" stopColor="hsl(224 36% 6%)" stopOpacity="0" />
          <stop offset="1" stopColor="hsl(224 36% 6%)" stopOpacity="0.95" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function CommunityArt() {
  return (
    <div className={styles.tileArt} aria-hidden="true">
      <Image src="/branding/home-live-v1.webp" alt="" fill sizes="(max-width: 960px) 100vw, 600px" loading="lazy" style={{ objectFit: "cover", opacity: 0.42 }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, hsl(224 36% 6% / 0.2) 0%, hsl(224 36% 6% / 0.92) 62%)" }} />
    </div>
  );
}

function TileView({ tile }: { tile: Tile }) {
  const Icon = tile.icon;
  const feature = Boolean(tile.feature);
  return (
    <li className={cn(styles.tile, tile.span, feature && styles.tileFeature, tile.wide && styles.tileWide)}>
      {tile.feature === "map" && <><MapArt /><span className={styles.mapPill} aria-hidden="true">3 km · até 20 min</span></>}
      {tile.feature === "results" && <ResultsArt />}
      {tile.feature === "community" && <CommunityArt />}
      {tile.tag && <span className={styles.tag}>{tile.tag}</span>}
      <Icon className={styles.tileIcon} size={feature ? 24 : 20} aria-hidden="true" />
      <div>
        <h4>{tile.title}</h4>
        <p style={{ marginTop: 6 }}>{tile.text}</p>
      </div>
      {tile.chips && (
        <ul className={styles.chips} aria-label="Recursos da comunidade">
          {tile.chips.map(chip => <li key={chip}>{chip}</li>)}
        </ul>
      )}
    </li>
  );
}

export function JourneySection() {
  return (
    <section id="jornada" className={styles.section} aria-labelledby="jornada-titulo">
      <div className={styles.container}>
        <FadeInView className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>A jornada completa</p>
            <h2 id="jornada-titulo" className={styles.h2}>Antes, durante e depois. Um só lugar.</h2>
          </div>
          <p className={styles.lead}>
            Tudo o que aparece aqui já existe no produto. Sem “em breve”, sem promessa de roadmap.
          </p>
        </FadeInView>
        <div className={styles.phases}>
          {PHASES.map(phase => (
            <FadeInView key={phase.num} className={styles.phase}>
              <div className={styles.phaseHead}>
                <span className={styles.phaseNum}>{phase.num} / 03</span>
                <h3 className={styles.phaseTitle}>{phase.title}</h3>
                <p className={styles.phaseText}>{phase.text}</p>
              </div>
              <ul className={styles.bento}>
                {phase.tiles.map(tile => <TileView key={tile.title} tile={tile} />)}
              </ul>
            </FadeInView>
          ))}
        </div>
      </div>
    </section>
  );
}
