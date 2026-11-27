"use client";

import Link from "next/link";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, LazyMotion, MotionConfig, m } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  CalendarDays,
  Check,
  DownloadCloud,
  Heart,
  Link2,
  MapPinned,
  Megaphone,
  MessagesSquare,
  Printer,
  QrCode,
  ScanLine,
  Sparkles,
  Ticket,
  TicketPercent,
  UserCheck,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { loadLayoutFeatures } from "@/components/animations/config";
import { cn } from "@/lib/utils";
import { DemoQr } from "./DemoQr";
import { LandingEventImage } from "./LandingEventImage";
import type { LandingEvent } from "./landingData";
import styles from "./Playground.module.css";

type Audience = "participante" | "organizador";
type ToolId = "aprovacao" | "cupons" | "kit" | "checkin" | "resultados" | "destaque";

const PARTICIPANT_FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: MapPinned, title: "Mapa com distância", text: "Filtre por distância, tempo de deslocamento, categoria e preço." },
  { icon: CalendarDays, title: "Agenda e calendário", text: "Veja em lista ou calendário e exporte para o seu calendário." },
  { icon: Heart, title: "Favoritos e lembretes", text: "Salve eventos e receba lembretes e notificações de mudança." },
  { icon: Users, title: "Presença com lotação", text: "Confirme presença; se lotar, entre na lista de espera." },
  { icon: Ticket, title: "Ingresso por Pix", text: "Pagamento pelo Mercado Pago, com cupom de desconto." },
  { icon: MessagesSquare, title: "Comunidade e chat", text: "Avisos, enquetes e conversa com quem vai ao evento." },
  { icon: UserPlus, title: "Conexões opcionais", text: "Conheça gente do evento só se você ativar as Conexões." },
  { icon: DownloadCloud, title: "Mais eventos por perto", text: "Eventos importados de fontes oficiais, verificados antes de aparecer." },
];

const TOOLS: { id: ToolId; icon: LucideIcon; label: string; title: string; text: string }[] = [
  { id: "aprovacao", icon: UserCheck, label: "Aprovação", title: "Aprove cada inscrição.", text: "Ative a aprovação manual: cada pessoa pede para participar e você aprova ou recusa. Em eventos pagos, a compra só é liberada depois da aprovação." },
  { id: "cupons", icon: TicketPercent, label: "Cupons", title: "Cupons de desconto.", text: "Crie cupons para os ingressos vendidos por Pix e compartilhe um link que já chega com o cupom preenchido." },
  { id: "kit", icon: Megaphone, label: "Divulgação", title: "Kit de divulgação pronto.", text: "Imagem para stories e feed, mensagem para WhatsApp, cartaz para imprimir com QR Code e link do evento." },
  { id: "checkin", icon: QrCode, label: "Check-in", title: "Check-in por QR com a equipe.", text: "Você e as pessoas da equipe do evento leem o QR pessoal de cada participante pelo celular." },
  { id: "resultados", icon: BarChart3, label: "Resultados", title: "Do clique à portaria.", text: "Acompanhe visualizações, cliques em ingressos, inscrições e comparecimento por evento." },
  { id: "destaque", icon: Sparkles, label: "Destaque", title: "Destaque pago, sempre sinalizado.", text: "Coloque seu evento em evidência. O público vê o rótulo “Destaque”, que indica conteúdo patrocinado." },
];

const REQUESTS = [
  { id: "marina", name: "Marina S.", note: "2 eventos com você" },
  { id: "diego", name: "Diego A.", note: "Primeira vez" },
  { id: "lia", name: "Lia R.", note: "Seguindo você" },
] as const;

type Decision = "pendente" | "aprovada" | "recusada";

const FUNNEL = {
  "7": [
    { label: "Visualizações", value: 1240 },
    { label: "Cliques em ingressos", value: 318 },
    { label: "Inscrições", value: 96 },
    { label: "Check-ins", value: 81 },
  ],
  "30": [
    { label: "Visualizações", value: 4870 },
    { label: "Cliques em ingressos", value: 1102 },
    { label: "Inscrições", value: 341 },
    { label: "Check-ins", value: 296 },
  ],
} as const;

const LIST = [
  { id: "seu", name: "Seu evento: Sarau da Vila", meta: "Sáb · 20h · 1,8 km" },
  { id: "a", name: "Feira Criativa", meta: "Sáb · 10h · 3,4 km" },
  { id: "b", name: "Noite Live Session", meta: "Sáb · 22h · 2,6 km" },
] as const;

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const count = (value: number) => value.toLocaleString("pt-BR");

function useArrowTabs<T extends string>(items: readonly T[], current: T, select: (value: T) => void, orientation: "horizontal" | "both" = "horizontal") {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = items.indexOf(current);
    const forward = orientation === "both" ? ["ArrowRight", "ArrowDown"] : ["ArrowRight"];
    const backward = orientation === "both" ? ["ArrowLeft", "ArrowUp"] : ["ArrowLeft"];
    let next = -1;
    if (forward.includes(event.key)) next = (index + 1) % items.length;
    else if (backward.includes(event.key)) next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    if (next < 0) return;
    event.preventDefault();
    select(items[next]);
    refs.current[next]?.focus();
  };
  const bind = (index: number) => (node: HTMLButtonElement | null) => {
    refs.current[index] = node;
  };
  return { onKeyDown, bind };
}

const AUDIENCES = ["participante", "organizador"] as const;
const TOOL_IDS = TOOLS.map(tool => tool.id);

export function AudienceSwitch({ promoEvent }: { promoEvent: LandingEvent | null }) {
  const ids = useId();
  const [audience, setAudience] = useState<Audience>("organizador");
  const [tool, setTool] = useState<ToolId>("aprovacao");
  const audienceTabs = useArrowTabs(AUDIENCES, audience, setAudience);
  const toolTabs = useArrowTabs(TOOL_IDS, tool, setTool, "both");
  const activeTool = TOOLS.find(item => item.id === tool) ?? TOOLS[0];

  return (
    <LazyMotion features={loadLayoutFeatures}>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
        <div className={styles.audience}>
          <div className={styles.audienceTabs} role="tablist" aria-label="Ver o EventMap como">
            {AUDIENCES.map((value, index) => (
              <button
                key={value}
                ref={audienceTabs.bind(index)}
                type="button"
                role="tab"
                id={`${ids}-aud-${value}`}
                aria-selected={audience === value}
                aria-controls={`${ids}-aud-painel`}
                tabIndex={audience === value ? 0 : -1}
                onClick={() => setAudience(value)}
                onKeyDown={audienceTabs.onKeyDown}
              >
                {audience === value && <m.span layoutId={`${ids}-pill`} className={styles.audiencePill} aria-hidden="true" />}
                <span className={styles.audienceLabel}>{value === "participante" ? "Participante" : "Organizador"}</span>
              </button>
            ))}
          </div>

          <div id={`${ids}-aud-painel`} role="tabpanel" aria-labelledby={`${ids}-aud-${audience}`} className={styles.audiencePanel}>
            {audience === "participante" ? (
              <ul className={styles.featureGrid}>
                {PARTICIPANT_FEATURES.map(feature => {
                  const Icon = feature.icon;
                  return (
                    <li key={feature.title} className={styles.featureItem}>
                      <Icon size={20} aria-hidden="true" />
                      <strong>{feature.title}</strong>
                      <span>{feature.text}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className={styles.tools}>
                <div className={styles.toolTabs} role="tablist" aria-label="Ferramentas do organizador" aria-orientation="vertical">
                  {TOOLS.map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        ref={toolTabs.bind(index)}
                        type="button"
                        role="tab"
                        id={`${ids}-tool-${item.id}`}
                        aria-selected={tool === item.id}
                        aria-controls={`${ids}-tool-painel`}
                        tabIndex={tool === item.id ? 0 : -1}
                        onClick={() => setTool(item.id)}
                        onKeyDown={toolTabs.onKeyDown}
                      >
                        <Icon size={18} aria-hidden="true" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div id={`${ids}-tool-painel`} role="tabpanel" aria-labelledby={`${ids}-tool-${tool}`} className={styles.toolPanel}>
                  <div className={styles.toolCopy}>
                    <h3>{activeTool.title}</h3>
                    <p>{activeTool.text}</p>
                  </div>
                  <AnimatePresence initial={false} mode="wait">
                    <m.div
                      key={tool}
                      className={styles.toolPreview}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2 }}
                    >
                      {tool === "aprovacao" && <ApprovalPreview />}
                      {tool === "cupons" && <CouponPreview />}
                      {tool === "kit" && <PromoPreview event={promoEvent} />}
                      {tool === "checkin" && <CheckinPreview />}
                      {tool === "resultados" && <ResultsPreview />}
                      {tool === "destaque" && <HighlightPreview />}
                    </m.div>
                  </AnimatePresence>
                  <p className={styles.mapLegend}>Prévia interativa · dados de demonstração</p>
                </div>
              </div>
            )}
          </div>

          <div className={styles.audienceCtas}>
            {audience === "organizador" ? (
              <>
                <Link href="/para-organizadores" className={styles.ctaSolid}>
                  Conheça o EventMap para organizadores <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link href="/register" className={styles.ctaGhost}>Criar conta grátis</Link>
              </>
            ) : (
              <>
                <Link href="/" className={styles.ctaSolid}>
                  Explorar eventos <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link href="/register" className={styles.ctaGhost}>Criar conta grátis</Link>
              </>
            )}
          </div>
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}

function ApprovalPreview() {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const pending = REQUESTS.filter(request => (decisions[request.id] ?? "pendente") === "pendente").length;
  const decide = (id: string, decision: Decision) => setDecisions(current => ({ ...current, [id]: decision }));
  return (
    <div className={styles.previewCard}>
      <div className={styles.previewHead}>
        <strong>Pedidos para participar</strong>
        <span className={styles.badge} aria-live="polite">{pending} {pending === 1 ? "pendente" : "pendentes"}</span>
      </div>
      <ul className={styles.requestList}>
        {REQUESTS.map(request => {
          const decision = decisions[request.id] ?? "pendente";
          return (
            <li key={request.id} className={styles.requestItem}>
              <span className={styles.avatar} aria-hidden="true">{request.name[0]}</span>
              <span className={styles.requestText}>
                <strong>{request.name}</strong>
                <small>{request.note}</small>
              </span>
              {decision === "pendente" ? (
                <span className={styles.requestActions}>
                  <button type="button" className={styles.iconBtnOk} onClick={() => decide(request.id, "aprovada")} aria-label={`Aprovar ${request.name}`}>
                    <Check size={16} aria-hidden="true" />
                  </button>
                  <button type="button" className={styles.iconBtnNo} onClick={() => decide(request.id, "recusada")} aria-label={`Recusar ${request.name}`}>
                    <X size={16} aria-hidden="true" />
                  </button>
                </span>
              ) : (
                <button type="button" className={cn(styles.statusChip, decision === "aprovada" ? styles.statusOk : styles.statusNo)} onClick={() => decide(request.id, "pendente")} aria-label={`${decision === "aprovada" ? "Aprovada" : "Recusada"}: desfazer decisão sobre ${request.name}`}>
                  {decision === "aprovada" ? "Aprovada" : "Recusada"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const COUPON_OPTIONS = [10, 20, 50] as const;

function CouponPreview() {
  const [percent, setPercent] = useState<(typeof COUPON_OPTIONS)[number]>(20);
  const price = 60;
  return (
    <div className={styles.previewCard}>
      <div className={styles.previewHead}>
        <strong>Cupom AMIGOS</strong>
        <span className={styles.badge}>Ativo</span>
      </div>
      <div className={styles.segmented} role="group" aria-label="Desconto do cupom">
        {COUPON_OPTIONS.map(option => (
          <button key={option} type="button" aria-pressed={percent === option} onClick={() => setPercent(option)}>{option}%</button>
        ))}
      </div>
      <div className={styles.couponPrice} aria-live="polite">
        <s>{money(price)}</s>
        <strong>{money(price * (1 - percent / 100))}</strong>
        <span>no Pix, com o cupom</span>
      </div>
      <p className={styles.previewLine}><Link2 size={14} aria-hidden="true" /> eventmap…/evento/sarau-da-vila?cupom=AMIGOS</p>
    </div>
  );
}

/** Com agenda real, a prévia usa um evento publicado (nome e banner verdadeiros); sem ela, um exemplo sem foto. */
function PromoPreview({ event }: { event: LandingEvent | null }) {
  const [format, setFormat] = useState<"stories" | "feed">("stories");
  return (
    <div className={styles.previewCard}>
      <div className={styles.segmented} role="group" aria-label="Formato da imagem">
        <button type="button" aria-pressed={format === "stories"} onClick={() => setFormat("stories")}>Stories</button>
        <button type="button" aria-pressed={format === "feed"} onClick={() => setFormat("feed")}>Feed</button>
      </div>
      <div className={styles.promoStage}>
        <div className={cn(styles.promoImage, format === "feed" && styles.promoFeed)}>
          <LandingEventImage src={event?.image ?? null} category={event?.category ?? "Música"} sizes="200px" />
          <div className={styles.promoOverlay}>
            <strong>{event?.name ?? "Sarau da Vila"}</strong>
            <span>{event ? event.dateLabel : "Sáb · 20h · Vila Madalena"}</span>
            <DemoQr seed={77} className={styles.promoQr} />
          </div>
        </div>
        <ul className={styles.promoList}>
          <li><MessagesSquare size={15} aria-hidden="true" /> Mensagem para WhatsApp</li>
          <li><Printer size={15} aria-hidden="true" /> Cartaz com QR Code</li>
          <li><Link2 size={15} aria-hidden="true" /> Link do evento</li>
        </ul>
      </div>
    </div>
  );
}

function CheckinPreview() {
  const names = ["Bruna T.", "Caio M.", "Helena P.", "Rafael C.", "Yasmin L."];
  const [present, setPresent] = useState(41);
  const read = present - 41;
  const last = read > 0 ? names[(read - 1) % names.length] : null;
  return (
    <div className={styles.previewCard}>
      <div className={styles.previewHead}>
        <strong>Portaria · Sarau da Vila</strong>
        <span className={styles.badge}>Equipe: 3</span>
      </div>
      <div className={styles.checkinCount} aria-live="polite">
        <strong>{present}</strong>
        <span>de 60 presentes</span>
      </div>
      <span className={styles.capacityTrack} aria-hidden="true">
        <span style={{ transform: `scaleX(${present / 60})` }} />
      </span>
      <p className={styles.previewLine}>{last ? <><Check size={14} aria-hidden="true" /> {last} entrou agora</> : "Aponte a câmera para o QR do participante."}</p>
      <button type="button" className={styles.smallBtn} onClick={() => setPresent(value => Math.min(60, value + 1))} disabled={present >= 60}>
        <ScanLine size={15} aria-hidden="true" /> {present >= 60 ? "Lotação completa" : "Ler próximo QR"}
      </button>
    </div>
  );
}

function ResultsPreview() {
  const [period, setPeriod] = useState<"7" | "30">("7");
  const rows = FUNNEL[period];
  const max = rows[0].value;
  return (
    <div className={styles.previewCard}>
      <div className={styles.previewHead}>
        <strong>Funil do evento</strong>
        <div className={styles.segmented} role="group" aria-label="Período">
          <button type="button" aria-pressed={period === "7"} onClick={() => setPeriod("7")}>7 dias</button>
          <button type="button" aria-pressed={period === "30"} onClick={() => setPeriod("30")}>30 dias</button>
        </div>
      </div>
      <dl className={styles.funnel}>
        {rows.map(row => (
          <div key={row.label} className={styles.funnelRow}>
            <dt>{row.label}</dt>
            <dd>
              <span className={styles.funnelBar} aria-hidden="true">
                <span style={{ transform: `scaleX(${Math.max(0.04, row.value / max)})` }} />
              </span>
              <strong>{count(row.value)}</strong>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function HighlightPreview() {
  const labelId = useId();
  const [featured, setFeatured] = useState(false);
  const ordered = featured ? LIST : [LIST[1], LIST[2], LIST[0]];
  return (
    <div className={styles.previewCard}>
      <div className={styles.previewHead}>
        <strong id={labelId}>Destacar meu evento</strong>
        <button type="button" role="switch" aria-checked={featured} aria-labelledby={labelId} className={styles.switch} onClick={() => setFeatured(value => !value)}>
          <span aria-hidden="true" />
        </button>
      </div>
      <ul className={styles.highlightList}>
        {ordered.map(item => (
          <m.li key={item.id} layout className={cn(styles.highlightItem, featured && item.id === "seu" && styles.highlightOn)}>
            <span className={styles.requestText}>
              <strong>{item.name}</strong>
              <small>{item.meta}</small>
            </span>
            {featured && item.id === "seu" && (
              <span className={styles.featuredTag} aria-label="Evento em destaque patrocinado">
                <span aria-hidden="true">Destaque</span>
              </span>
            )}
          </m.li>
        ))}
      </ul>
      <p className={styles.previewLine}><BellRing size={14} aria-hidden="true" /> Quem segue você também é avisado de novos eventos.</p>
    </div>
  );
}
