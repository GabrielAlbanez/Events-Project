import Link from "next/link";
import { ArrowRight, Check, CircleSlash, Gift, MinusCircle } from "lucide-react";
import { FadeInView } from "@/components/animations/FadeInView";
import { cn } from "@/lib/utils";
import { BrowserFrame, PhoneFrame, REAL_UI_CAPTION } from "./DeviceFrames";
import styles from "./Landing.module.css";

/* ---------------- Organizadores (B2B) ---------------- */

const SWAPS: Array<[string, string]> = [
  ["Planilha de presença", "Inscrição com capacidade e QR na porta"],
  ["Cinco grupos de aviso", "Comunicados oficiais na comunidade"],
  ["Formulário de lista de espera", "Lista de espera automática"],
  ["Enquete solta no grupo", "Enquetes, perguntas e programação"],
  ["Achismo sobre o público", "Painel de resultados por evento"],
];

const ORG_FEATURES = [
  { title: "Publicação no mapa", text: "Seu evento aparece para quem está perto e filtra por tempo de deslocamento." },
  { title: "Rascunho, duplicar e cancelar", text: "Crie com calma, recupere rascunhos e reaproveite o último evento." },
  { title: "Séries recorrentes", text: "Agenda semanal ou mensal criada uma única vez." },
  { title: "Filas virtuais", text: "Bar, banheiro, credenciamento: o público espera sem ficar parado." },
  { title: "Equipe e tarefas", text: "Distribua responsabilidades no próprio evento." },
  { title: "Página pública e seguidores", text: "Seu perfil de organizador vira canal direto com o público." },
];

export function OrganizersSection() {
  return (
    <section id="organizadores" className={cn(styles.section, styles.ink)} aria-labelledby="org-titulo">
      <div className={styles.container}>
        <div className={styles.orgGrid}>
          <FadeInView>
            <p className={styles.eyebrow}>Para organizadores</p>
            <h2 id="org-titulo" className={styles.h2}>Pare de gerenciar seu evento em cinco grupos de WhatsApp.</h2>
            <p className={styles.lead}>
              Divulgue no mapa, controle a lotação, faça o check-in e fale com o público em um só painel — sem trocar a bilheteria que você já usa.
            </p>
            <ul className={styles.swapList} aria-label="O que o EventMap substitui">
              {SWAPS.map(([from, to]) => (
                <li key={from}>
                  <span className={styles.swapFrom}><span className="sr-only">Antes: </span>{from}</span>
                  <ArrowRight className={styles.swapArrow} size={18} aria-hidden="true" />
                  <span className={styles.swapTo}><span className="sr-only">Agora: </span>{to}</span>
                </li>
              ))}
            </ul>
            <div className={styles.actions}>
              <Link href="/register" className={cn(styles.btn, styles.btnPrimary)}>
                Quero ser organizador fundador <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <a href="#planos" className={cn(styles.btn, styles.btnGhost)}>Ver planos</a>
            </div>
            <p className={styles.orgNote}>
              Crie sua conta e a equipe do EventMap libera o perfil de organizador. Os eventos passam por validação antes de aparecer no mapa.
            </p>
          </FadeInView>
          <FadeInView className={styles.orgVisual} delay={0.06}>
            <BrowserFrame
              src="/landing/painel-resultados.jpg"
              alt="Painel de resultados do organizador com visualizações, cliques em ingressos e favoritos, e gráficos de visualizações recentes por evento"
              width={1800}
              height={1140}
              sizes="(max-width: 960px) 92vw, 620px"
              address="EventMap · Resultados"
              caption={REAL_UI_CAPTION}
            />
          </FadeInView>
        </div>
        <ul className={styles.featureGrid}>
          {ORG_FEATURES.map((feature, index) => (
            <li key={feature.title}>
              <span className={styles.mono}>{String(index + 1).padStart(2, "0")}</span>
              <strong>{feature.title}</strong>
              <span>{feature.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------------- Participantes (B2C) ---------------- */

const PARTICIPANT_BENEFITS = [
  "Veja no mapa o que acontece hoje, no fim de semana ou no mês.",
  "Filtre pelo tempo até o local — e pelo que é gratuito.",
  "Decida com os amigos numa sala com votação.",
  "Receba lembretes e avisos oficiais do organizador.",
  "Converse com quem vai e, se quiser, faça conexões.",
  "Entre com o QR, sem nome em lista de papel.",
];

export function ParticipantsSection() {
  return (
    <section id="participantes" className={styles.section} aria-labelledby="part-titulo">
      <div className={cn(styles.container, styles.partGrid)}>
        <FadeInView className={styles.partVisual}>
          <BrowserFrame
            src="/landing/pagina-evento.jpg"
            alt="Página pública do evento Jazz no Terraço com foto do show, categoria, preço e horário"
            width={1770}
            height={1185}
            sizes="(max-width: 960px) 80vw, 520px"
            address="EventMap · Jazz no Terraço"
          />
          <PhoneFrame
            className={styles.partPhone}
            src="/landing/evento-mobile.jpg"
            alt="Versão mobile da página do evento mostrando data, horário e local com link para o Google Maps"
            sizes="(max-width: 960px) 30vw, 200px"
          />
          <p className={cn(styles.caption, styles.partCaption)}>{REAL_UI_CAPTION}</p>
        </FadeInView>
        <FadeInView delay={0.06}>
          <p className={styles.eyebrow}>Para participantes</p>
          <h2 id="part-titulo" className={styles.h2}>Descubra perto. Chegue sabendo quem vai estar lá.</h2>
          <p className={styles.lead}>Menos rolagem de feed, mais noites que valem o deslocamento.</p>
          <ul className={styles.checkList}>
            {PARTICIPANT_BENEFITS.map(item => <li key={item}><Check size={16} aria-hidden="true" />{item}</li>)}
          </ul>
          <p className={styles.freeBadge}><Gift size={16} aria-hidden="true" />Gratuito para participantes</p>
          <div className={styles.actions} style={{ marginTop: 24 }}>
            <Link href="/" className={cn(styles.btn, styles.btnBlue)}>Explorar eventos <ArrowRight size={18} aria-hidden="true" /></Link>
          </div>
        </FadeInView>
      </div>
    </section>
  );
}

/* ---------------- Diferenciais + comparação ---------------- */

type Verdict = "yes" | "partial" | "no";
type Row = { feature: string; us: [Verdict, string]; ticketing: [Verdict, string]; groups: [Verdict, string] };

const ROWS: Row[] = [
  { feature: "Descoberta por mapa e tempo de deslocamento", us: ["yes", "Sim — raio e tempo até o local"], ticketing: ["partial", "Algumas têm mapa"], groups: ["no", "Não"] },
  { feature: "Comunidade e avisos oficiais", us: ["yes", "Sim — comunicados, perguntas, enquetes"], ticketing: ["partial", "Em geral, e-mail ao comprador"], groups: ["partial", "Sim, sem moderação nem organização"] },
  { feature: "Filas virtuais", us: ["yes", "Sim"], ticketing: ["no", "Em geral, não"], groups: ["no", "Não"] },
  { feature: "Conexões entre participantes", us: ["yes", "Sim — opt-in, com bloqueio e denúncia"], ticketing: ["no", "Em geral, não"], groups: ["partial", "Informal, sem controle de privacidade"] },
  { feature: "Check-in por QR", us: ["yes", "Sim"], ticketing: ["yes", "Sim"], groups: ["no", "Não"] },
  { feature: "Funciona com sua bilheteria atual", us: ["yes", "Sim"], ticketing: ["no", "É a própria bilheteria"], groups: ["yes", "Sim"] },
  { feature: "Venda de ingresso própria", us: ["no", "Não — usa a sua"], ticketing: ["yes", "Sim"], groups: ["no", "Não"] },
];

const VERDICT_LABEL: Record<Verdict, string> = { yes: "Sim", partial: "Parcial", no: "Não" };

function VerdictCell({ value, label, us = false }: { value: [Verdict, string]; label: string; us?: boolean }) {
  const [verdict, text] = value;
  const Icon = verdict === "yes" ? Check : verdict === "partial" ? MinusCircle : CircleSlash;
  return (
    <td data-label={label} className={cn(us && styles.colUs)} role="cell">
      <span className={cn(styles.cell, styles[verdict])}>
        <Icon size={16} aria-hidden="true" />
        <span><span className="sr-only">{VERDICT_LABEL[verdict]}: </span>{text}</span>
      </span>
    </td>
  );
}

const DIFFERENTIALS = [
  { title: "Complementa, não compete", text: "O EventMap não vende ingresso. A página do evento leva ao link de compra que você já usa — zero migração." },
  { title: "A experiência continua depois da compra", text: "Comunidade, chat, filas e conexões transformam o dia do evento num canal oficial e moderado." },
  { title: "Mapa que responde “vale ir?”", text: "Raio a partir da sua localização e tempo de deslocamento — não só um pin num mapa." },
];

export function ComparisonSection() {
  return (
    <section id="diferenciais" className={cn(styles.section, styles.muted)} aria-labelledby="dif-titulo">
      <div className={styles.container}>
        <FadeInView className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>Por que o EventMap</p>
            <h2 id="dif-titulo" className={styles.h2}>A camada que faltava entre o ingresso e a porta.</h2>
          </div>
          <p className={styles.lead}>Não somos mais uma bilheteria. Somos o que acontece em volta dela.</p>
        </FadeInView>
        <ul className={styles.diffGrid}>
          {DIFFERENTIALS.map((item, index) => (
            <li key={item.title}>
              <span className={styles.diffNum}>{String(index + 1).padStart(2, "0")}</span>
              <strong>{item.title}</strong>
              <p>{item.text}</p>
            </li>
          ))}
        </ul>
        <FadeInView className={styles.tableWrap}>
          <table className={styles.table} role="table">
            <caption>Comparação qualitativa e geral. Recursos variam entre plataformas e mudam com o tempo.</caption>
            <thead>
              <tr role="row">
                <th scope="col" role="columnheader">Recurso</th>
                <th scope="col" role="columnheader" className={styles.colUs}>EventMap</th>
                <th scope="col" role="columnheader">Plataformas de bilheteria</th>
                <th scope="col" role="columnheader">Grupos de mensagem</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(row => (
                <tr key={row.feature} role="row">
                  <th scope="row" role="rowheader">{row.feature}</th>
                  <VerdictCell value={row.us} label="EventMap" us />
                  <VerdictCell value={row.ticketing} label="Bilheterias" />
                  <VerdictCell value={row.groups} label="Grupos" />
                </tr>
              ))}
            </tbody>
          </table>
        </FadeInView>
      </div>
    </section>
  );
}

/* ---------------- Planos ---------------- */

type Plan = {
  name: string;
  audience: string;
  price: string;
  desc: string;
  items: string[];
  cta: { label: string; href: string };
  featured?: boolean;
};

const PLANS: Plan[] = [
  {
    name: "Participante",
    audience: "Para o público",
    price: "Grátis",
    desc: "Tudo para descobrir, decidir e viver o evento.",
    items: ["Mapa, filtros e agenda", "Favoritos, lembretes e push", "Salas com amigos", "Chat e conexões da festa"],
    cta: { label: "Explorar eventos", href: "/" },
  },
  {
    name: "Organizador Essencial",
    audience: "Para quem está começando",
    price: "Grátis",
    desc: "Coloque seu evento no mapa da cidade.",
    items: ["Eventos validados no mapa", "Página pública do evento", "Presença na agenda", "Métricas básicas"],
    cta: { label: "Criar conta", href: "/register" },
  },
  {
    name: "Organizador Pro",
    audience: "Para produtores recorrentes",
    price: "Acesso antecipado",
    desc: "O evento inteiro num painel, do convite à porta.",
    items: ["Inscrição com capacidade e lista de espera", "Check-in por QR", "Comunidade completa: filas, enquetes, equipe", "Chat e conexões da festa", "Séries recorrentes", "Painel de resultados"],
    cta: { label: "Quero ser fundador", href: "/register" },
    featured: true,
  },
  {
    name: "Espaços & Festivais",
    audience: "Casas, festivais, prefeituras e marcas",
    price: "Sob consulta",
    desc: "Agenda recorrente e grandes públicos.",
    items: ["Tudo do Pro", "Vários eventos simultâneos", "Equipe e tarefas", "Acompanhamento próximo da equipe"],
    cta: { label: "Criar conta e conversar", href: "/register" },
  },
];

export function PlansSection() {
  return (
    <section id="planos" className={styles.section} aria-labelledby="planos-titulo">
      <div className={styles.container}>
        <FadeInView className={styles.sectionHeadCenter}>
          <p className={styles.eyebrow}>Planos</p>
          <h2 id="planos-titulo" className={styles.h2}>Comece grátis. Cresça com o seu público.</h2>
          <p className={styles.lead}>Para participantes, o EventMap é gratuito. Para organizadores, comece sem custo e evolua quando precisar de mais.</p>
        </FadeInView>
        <ul className={styles.plans}>
          {PLANS.map(plan => (
            <li key={plan.name} className={cn(styles.plan, plan.featured && styles.planFeatured)}>
              {plan.featured && <span className={styles.planBadge}>Fundadores</span>}
              <p className={styles.planFor}>{plan.audience}</p>
              <h3 className={styles.planName}>{plan.name}</h3>
              <span className={styles.planPrice}>{plan.price}</span>
              <p className={styles.planDesc}>{plan.desc}</p>
              <ul className={styles.checkList}>
                {plan.items.map(item => <li key={item}><Check size={16} aria-hidden="true" />{item}</li>)}
              </ul>
              <Link href={plan.cta.href} className={cn(styles.btn, plan.featured ? styles.btnPrimary : styles.btnOutline)}>
                {plan.cta.label}
              </Link>
            </li>
          ))}
        </ul>
        <p className={styles.plansNote}>
          <strong>Valores em definição.</strong>
          <span>Organizadores fundadores participam da construção dos planos.</span>
        </p>
      </div>
    </section>
  );
}
