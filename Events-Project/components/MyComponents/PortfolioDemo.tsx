"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Bookmark, Check, MapPin, RotateCcw } from "lucide-react";
import type { DemoEvent } from "@/lib/demoEvents";
import styles from "./PortfolioDemo.module.css";

type DemoRole = "visitante" | "organizador";
const stages = ["Descobrir", "Salvar", "Lista de espera", "Promoção", "Check-in"];
const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export default function PortfolioDemo({ events }: { events: DemoEvent[] }) {
  const [role, setRole] = useState<DemoRole>("visitante");
  const [category, setCategory] = useState("Todos");
  const [selectedId, setSelectedId] = useState(events[0].id);
  const [stage, setStage] = useState(0);
  const [saved, setSaved] = useState(false);
  const selected = events.find((event) => event.id === selectedId) ?? events[0];
  const visible = events.filter((event) => category === "Todos" || event.category === category);
  const reset = () => { setStage(0); setSaved(false); setCategory("Todos"); setSelectedId(events[0].id); setRole("visitante"); };
  const choose = (id: string) => { setSelectedId(id); setStage(0); setSaved(false); };
  const filterCategory = (value: string) => {
    setCategory(value);
    if (value !== "Todos" && selected.category !== value) {
      const next = events.find((event) => event.category === value);
      if (next) choose(next.id);
    }
  };
  const actions = role === "visitante"
    ? ["Explorar este evento", "Simular entrada na espera", "Simular liberação de vaga", "Simular check-in"]
    : ["Examinar evento fictício", "Simular participante na espera", "Simular liberação de vaga", "Simular validação de presença"];
  const explanations = [
    "Escolha um dos seis eventos fictícios e siga uma jornada curta, do interesse à chegada.",
    "Salve o evento e acompanhe o interesse. Para explorar a lista de espera, este cenário considera a capacidade esgotada.",
    "Você está na posição 1 da fila fictícia. A próxima ação representa uma desistência e a liberação de uma vaga.",
    "Vaga liberada: a participação está confirmada nesta simulação. Nenhuma notificação ou reserva real foi enviada.",
    "Check-in simulado concluído. Nenhum ingresso foi emitido, lido ou validado, e nenhuma presença real foi registrada.",
  ];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}><ArrowLeft size={17} aria-hidden="true" /> EventMap</Link>
        <span className={styles.badge}>Demonstração · simulação local</span>
        <button className={styles.reset} onClick={reset}><RotateCcw size={16} aria-hidden="true" /> Reiniciar</button>
      </header>
      <section className={styles.intro} aria-labelledby="demo-title">
        <div><p className={styles.eyebrow}>EXPERIMENTE O EVENTMAP</p><h1 id="demo-title">Seu próximo encontro<br />começa por aqui.</h1><p>Explore a experiência com dados fictícios, sem conta e sem alterar eventos reais.</p></div>
        <fieldset className={styles.roles}><legend>Perspectiva da demonstração</legend>{(["visitante", "organizador"] as const).map((item) => <button key={item} aria-pressed={role === item} onClick={() => setRole(item)}>{item === "visitante" ? "Visitante" : "Organizador"}</button>)}<p>{role === "visitante" ? "Acompanhe a jornada de quem descobre um evento." : "Observe a espera, a vaga liberada e a presença pela perspectiva de organização. Nenhuma permissão real é concedida."}</p></fieldset>
      </section>
      <div className={styles.layout}>
        <section className={styles.discovery} aria-labelledby="discovery-title">
          <div className={styles.sectionTitle}><h2 id="discovery-title">Uma agenda de possibilidades</h2><span>{visible.length} {visible.length === 1 ? "evento fictício" : "eventos fictícios"}</span></div>
          <label className={styles.filter}>Categoria<select value={category} onChange={(event) => filterCategory(event.target.value)}>{["Todos", ...events.map((event) => event.category)].map((item) => <option key={item}>{item}</option>)}</select></label>
          <div className={styles.grid}>{visible.map((event) => <article key={event.id} className={`${styles.card} ${selectedId === event.id ? styles.selected : ""}`}>
            <button className={styles.cardButton} onClick={() => choose(event.id)} aria-pressed={selectedId === event.id} aria-label={`Explorar ${event.title}, evento fictício`}>
              <div className={styles.cover}><Image src={event.cover} alt="" fill sizes="(max-width: 640px) 100vw, (max-width: 1100px) 45vw, 25vw" /></div>
              <div className={styles.cardBody}><span className={styles.category}>{event.category}</span><h3>{event.title}</h3><time dateTime={event.startsAt}>{dateFormat.format(new Date(event.startsAt))} · Brasília</time><p><MapPin size={13} aria-hidden="true" />{event.location}</p><span className={styles.cardFoot}>{event.admission === "externo" ? "Ingresso externo · exemplo" : "Participação gratuita · exemplo"}{selectedId === event.id && <Check size={16} aria-hidden="true" />}</span></div>
            </button>
          </article>)}</div>
        </section>
        <aside className={styles.journey} aria-labelledby="journey-title">
          <p className={styles.eyebrow}>JORNADA GUIADA</p><h2 id="journey-title">{role === "visitante" ? "Do interesse à presença" : "Da espera à recepção"}</h2>
          <ol className={styles.steps}>{stages.map((label, index) => <li key={label} aria-current={stage === index ? "step" : undefined} data-complete={stage > index}><span>{stage > index ? <Check size={13} aria-hidden="true" /> : index + 1}</span>{label}</li>)}</ol>
          <div className={styles.current} aria-live="polite" aria-atomic="true"><p className={styles.category}>ETAPA {stage + 1} DE {stages.length}</p><h3>{selected.title}</h3><p>{selected.description}</p><strong>{stages[stage]}{stage === 4 ? " concluído" : ""}</strong><p>{explanations[stage]}</p>{stage === 2 && <p className={styles.receipt}>Fila simulada: posição 1 · evento lotado</p>}{stage >= 3 && <p className={styles.receipt}>{stage === 4 ? "Presença simulada registrada" : "Participação simulada confirmada"}</p>}</div>
          {stage === 1 && <button className={styles.secondary} aria-pressed={saved} onClick={() => setSaved(!saved)}><Bookmark size={16} aria-hidden="true" />{saved ? "Salvo nesta simulação" : "Salvar nesta simulação"}</button>}
          {stage < 4 ? <button className={styles.primary} onClick={() => { if (stage === 1) setSaved(true); setStage(stage + 1); }}>{actions[stage]}<ArrowRight size={16} aria-hidden="true" /></button> : <button className={styles.primary} onClick={reset}>Explorar novamente<RotateCcw size={16} aria-hidden="true" /></button>}
          <p className={styles.note}>{selected.admission === "externo" ? "Ingresso externo: em um evento real, a compra ocorre no canal do organizador. Salvar, confirmar participação ou fazer check-in aqui não substitui o ingresso." : "Participação e ingresso são conceitos diferentes. A confirmação desta demonstração não garante acesso a nenhum evento real."}</p>
        </aside>
      </div>
      <footer className={styles.footer}><div><strong>Um ambiente para experimentar.</strong><p>Tudo acontece apenas nesta página e é apagado ao recarregar. Esta simulação local não demonstra entrega WebSocket real. Para conferir as funcionalidades conectadas, explore o site real.</p></div><Link href="/">Explorar o site real <ArrowRight size={16} aria-hidden="true" /></Link></footer>
    </main>
  );
}
