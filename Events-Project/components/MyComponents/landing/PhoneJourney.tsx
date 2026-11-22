"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, LazyMotion, MotionConfig, m } from "framer-motion";
import {
  BellRing,
  CalendarPlus,
  CheckCircle2,
  Copy,
  Heart,
  Hourglass,
  QrCode,
  RotateCcw,
  ScanLine,
  Ticket,
  TicketPercent,
  Users,
  type LucideIcon,
} from "lucide-react";
import { loadAnimationFeatures } from "@/components/animations/config";
import { cn } from "@/lib/utils";
import { DemoQr } from "./DemoQr";
import styles from "./Playground.module.css";
import { useMediaQuery } from "./useLandingMotion";

type Step = { id: string; tab: string; icon: LucideIcon; title: string; text: string };

const STEPS: Step[] = [
  {
    id: "salvar",
    tab: "Salvar",
    icon: Heart,
    title: "Salve e receba lembretes.",
    text: "Gostou? Salve o evento: ele vai para seus favoritos, você recebe lembretes e notificações se a data ou o local mudarem, e pode exportar para o seu calendário.",
  },
  {
    id: "lugar",
    tab: "Lugar",
    icon: Users,
    title: "Garanta seu lugar.",
    text: "Confirme presença e acompanhe a lotação. Se lotar, você entra na lista de espera. Em eventos com aprovação, você pede para participar e a organização responde.",
  },
  {
    id: "pix",
    tab: "Pix",
    icon: Ticket,
    title: "Ingresso por Pix, com cupom.",
    text: "Quando o organizador vende pelo EventMap, você paga por Pix, processado pelo Mercado Pago, e pode aplicar um cupom de desconto. O ingresso vira sua inscrição.",
  },
  {
    id: "entrada",
    tab: "Entrada",
    icon: QrCode,
    title: "Entre com seu QR Code.",
    text: "Na porta, a equipe do evento lê o seu QR Code pessoal pelo celular. Pronto: check-in feito, é só aproveitar.",
  },
];

const PRICE = 60;
const COUPON_PERCENT = 10;
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type PixState = "idle" | "pending" | "paid";
type Mode = "livre" | "aprovacao";

export function PhoneJourney() {
  const ids = useId();
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState(false);
  const [mode, setMode] = useState<Mode>("livre");
  const [confirmed, setConfirmed] = useState(false);
  const [requested, setRequested] = useState(false);
  const [approved, setApproved] = useState(false);
  const [coupon, setCoupon] = useState(false);
  const [pix, setPix] = useState<PixState>("idle");
  const [checkedIn, setCheckedIn] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const narrativeRefs = useRef<(HTMLLIElement | null)[]>([]);
  const scrollSync = useMediaQuery("(min-width: 960px)");

  // Desktop: a narrativa à esquerda rola e o celular acompanha a etapa que está no centro da tela.
  useEffect(() => {
    if (!scrollSync) return;
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = narrativeRefs.current.indexOf(entry.target as HTMLLIElement);
          if (index >= 0) setStep(index);
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    narrativeRefs.current.forEach(node => node && observer.observe(node));
    return () => observer.disconnect();
  }, [scrollSync]);

  const total = coupon ? PRICE * (1 - COUPON_PERCENT / 100) : PRICE;
  const capacityUsed = confirmed ? 43 : 42;

  const restart = () => {
    setSaved(false);
    setConfirmed(false);
    setRequested(false);
    setApproved(false);
    setCoupon(false);
    setPix("idle");
    setCheckedIn(false);
    setStep(0);
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const keys: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: STEPS.length - 1 };
    if (!(event.key in keys)) return;
    event.preventDefault();
    const next = (keys[event.key] + STEPS.length) % STEPS.length;
    setStep(next);
    tabRefs.current[next]?.focus();
  };

  const status = [
    saved ? "Evento salvo. Você vai receber um lembrete antes de começar." : "",
    mode === "livre" ? (confirmed ? "Presença confirmada." : "") : approved ? "Participação aprovada." : requested ? "Pedido enviado — aguardando aprovação da organização." : "",
    pix === "pending" ? "Pix gerado. Aguardando pagamento." : pix === "paid" ? "Pagamento confirmado. Ingresso emitido." : "",
    checkedIn ? "Check-in feito. Boa festa!" : "",
  ][step];

  const next = () => setStep(current => Math.min(STEPS.length - 1, current + 1));

  return (
    <div className={styles.journey}>
      <ol className={styles.narrative}>
        {STEPS.map((item, index) => (
          <li
            key={item.id}
            ref={node => {
              narrativeRefs.current[index] = node;
            }}
            className={cn(styles.narrativeItem, step === index && styles.narrativeActive)}
            aria-current={step === index ? "step" : undefined}
          >
            <span className={styles.narrativeIndex} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <h3 className={styles.narrativeTitle}>
              <button type="button" onClick={() => setStep(index)} aria-controls={`${ids}-painel`}>
                <span className="sr-only">Etapa {index + 1}: </span>
                {item.title}
              </button>
            </h3>
            <p>{item.text}</p>
          </li>
        ))}
      </ol>

      <div className={styles.phoneColumn}>
        <div className={styles.phone} role="group" aria-label="Simulação no celular: toque nos botões para avançar">
          <div className={styles.phoneNotch} aria-hidden="true" />
          <div className={styles.phoneTabs} role="tablist" aria-label="Etapas">
            {STEPS.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  ref={node => {
                    tabRefs.current[index] = node;
                  }}
                  type="button"
                  role="tab"
                  id={`${ids}-tab-${index}`}
                  aria-selected={step === index}
                  aria-controls={`${ids}-painel`}
                  tabIndex={step === index ? 0 : -1}
                  onClick={() => setStep(index)}
                  onKeyDown={event => onTabKey(event, index)}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{item.tab}</span>
                </button>
              );
            })}
          </div>

          <div className={styles.phoneScreen} id={`${ids}-painel`} role="tabpanel" aria-labelledby={`${ids}-tab-${step}`}>
            <div className={styles.phoneEvent}>
              <div className={styles.phonePoster}>
                <Image src="/branding/home-jazz-v1.webp" alt="Cartaz fictício do evento Jazz no Terraço" fill sizes="300px" className={styles.cover} />
              </div>
              <p className={styles.phoneKicker}>Música · Hoje, 21h</p>
              <p className={styles.phoneTitle}>Jazz no Terraço</p>
              <p className={styles.phonePlace}>Terraço Augusta · 1,2 km</p>
            </div>

            <LazyMotion features={loadAnimationFeatures}>
              <MotionConfig reducedMotion="user">
                <AnimatePresence initial={false} mode="wait">
                  <m.div
                    key={step}
                    className={styles.phoneStep}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {step === 0 && (
                      <>
                        <button type="button" className={cn(styles.phoneBtn, saved && styles.phoneBtnDone)} aria-pressed={saved} onClick={() => setSaved(value => !value)}>
                          <Heart size={16} aria-hidden="true" fill={saved ? "currentColor" : "none"} />
                          {saved ? "Salvo nos favoritos" : "Salvar evento"}
                        </button>
                        <div className={cn(styles.phoneNote, !saved && styles.phoneNoteIdle)}>
                          <BellRing size={15} aria-hidden="true" />
                          <span>{saved ? "Lembrete agendado para antes do evento." : "Salve para receber lembretes e avisos de mudança."}</span>
                        </div>
                        <div className={styles.phoneNote}>
                          <CalendarPlus size={15} aria-hidden="true" />
                          <span>Adicionar ao calendário</span>
                        </div>
                      </>
                    )}

                    {step === 1 && (
                      <>
                        <div className={styles.phoneSwitch} role="group" aria-label="Tipo de inscrição">
                          <button type="button" aria-pressed={mode === "livre"} onClick={() => setMode("livre")}>Inscrição livre</button>
                          <button type="button" aria-pressed={mode === "aprovacao"} onClick={() => setMode("aprovacao")}>Com aprovação</button>
                        </div>
                        {mode === "livre" ? (
                          <>
                            <div className={styles.capacity}>
                              <span>{capacityUsed} de 60 vagas</span>
                              <span className={styles.capacityTrack} aria-hidden="true">
                                <span style={{ transform: `scaleX(${capacityUsed / 60})` }} />
                              </span>
                            </div>
                            <button type="button" className={cn(styles.phoneBtn, confirmed && styles.phoneBtnDone)} aria-pressed={confirmed} onClick={() => setConfirmed(value => !value)}>
                              <CheckCircle2 size={16} aria-hidden="true" />
                              {confirmed ? "Presença confirmada" : "Confirmar presença"}
                            </button>
                            <p className={styles.phoneHint}>Lotou? Você entra na lista de espera e é avisado se abrir vaga.</p>
                          </>
                        ) : approved ? (
                          <div className={cn(styles.phoneNote, styles.phoneNoteSuccess)}>
                            <CheckCircle2 size={15} aria-hidden="true" />
                            <span>Participação aprovada — compre seu ingresso.</span>
                          </div>
                        ) : (
                          <>
                            <button type="button" className={cn(styles.phoneBtn, requested && styles.phoneBtnWait)} aria-pressed={requested} onClick={() => setRequested(value => !value)}>
                              {requested ? <Hourglass size={16} aria-hidden="true" /> : <Users size={16} aria-hidden="true" />}
                              {requested ? "Cancelar pedido" : "Pedir para participar"}
                            </button>
                            <p className={styles.phoneHint}>
                              {requested ? "Pedido enviado — aguardando aprovação da organização." : "A organização aprova cada pedido. Em eventos pagos, a compra é liberada depois da aprovação."}
                            </p>
                            {requested && (
                              <button type="button" className={styles.smallBtnGhost} onClick={() => setApproved(true)}>Simular aprovação da organização</button>
                            )}
                          </>
                        )}
                      </>
                    )}

                    {step === 2 && (
                      <>
                        <div className={styles.priceRow}>
                          <span>1 ingresso</span>
                          <span>
                            {coupon && <s className={styles.priceOld}>{money(PRICE)}</s>}
                            <strong>{money(total)}</strong>
                          </span>
                        </div>
                        {mode === "aprovacao" && !approved && (
                          <div className={cn(styles.phoneNote, styles.phoneNoteIdle)}>
                            <Hourglass size={15} aria-hidden="true" />
                            <span>Com aprovação, a compra é liberada depois que a organização aprovar o seu pedido.</span>
                          </div>
                        )}
                        {pix === "idle" && (mode === "livre" || approved) && (
                          <>
                            <button type="button" className={cn(styles.couponBtn, coupon && styles.couponOn)} aria-pressed={coupon} onClick={() => setCoupon(value => !value)}>
                              <TicketPercent size={15} aria-hidden="true" />
                              {coupon ? `Cupom AMIGOS aplicado (−${COUPON_PERCENT}%)` : "Tem um cupom? Aplicar AMIGOS"}
                            </button>
                            <button type="button" className={styles.phoneBtn} onClick={() => setPix("pending")}>
                              <QrCode size={16} aria-hidden="true" /> Pagar com Pix
                            </button>
                          </>
                        )}
                        {pix === "pending" && (
                          <div className={styles.pixBox}>
                            <DemoQr seed={6060} className={styles.pixQr} label="QR Code Pix de demonstração" />
                            <div className={styles.pixSide}>
                              <span className={styles.pixCopy}><Copy size={13} aria-hidden="true" /> Pix copia e cola</span>
                              <span className={styles.phoneHint}>Aguardando pagamento…</span>
                              <button type="button" className={styles.smallBtn} onClick={() => setPix("paid")}>Simular pagamento</button>
                            </div>
                          </div>
                        )}
                        {pix === "paid" && (
                          <div className={cn(styles.phoneNote, styles.phoneNoteSuccess)}>
                            <CheckCircle2 size={15} aria-hidden="true" />
                            <span>Pagamento confirmado via Mercado Pago. Seu ingresso já é sua inscrição.</span>
                          </div>
                        )}
                      </>
                    )}

                    {step === 3 && (
                      <div className={styles.entry}>
                        <div className={cn(styles.entryQr, checkedIn && styles.entryQrDone)}>
                          <DemoQr seed={2611} className={styles.entryQrSvg} label="QR Code de entrada de demonstração" />
                          {checkedIn && (
                            <span className={styles.entryCheck} aria-hidden="true"><CheckCircle2 size={40} /></span>
                          )}
                        </div>
                        <button type="button" className={cn(styles.phoneBtn, checkedIn && styles.phoneBtnDone)} onClick={() => setCheckedIn(true)} disabled={checkedIn}>
                          <ScanLine size={16} aria-hidden="true" />
                          {checkedIn ? "Check-in feito" : "Simular leitura na portaria"}
                        </button>
                      </div>
                    )}
                  </m.div>
                </AnimatePresence>
              </MotionConfig>
            </LazyMotion>

            <div className={styles.phoneFooter}>
              {step < STEPS.length - 1 ? (
                <button type="button" className={styles.phoneNext} onClick={next}>
                  Próxima etapa: {STEPS[step + 1].tab}
                </button>
              ) : (
                <button type="button" className={styles.phoneNext} onClick={restart}>
                  <RotateCcw size={14} aria-hidden="true" /> Recomeçar
                </button>
              )}
            </div>
          </div>
          <p className="sr-only" aria-live="polite">{status}</p>
        </div>
        <p className={styles.mapLegend}>Simulação com dados fictícios</p>
      </div>
    </div>
  );
}
