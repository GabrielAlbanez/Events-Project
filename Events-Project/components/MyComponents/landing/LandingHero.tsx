import Link from "next/link";
import { ArrowRight, BellRing, Clock3, MapPinned, PlayCircle, ShieldCheck, Smartphone, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import { CityMap } from "./CityMap";
import { BrowserFrame, PhoneFrame, REAL_UI_CAPTION } from "./DeviceFrames";
import styles from "./Landing.module.css";

const TRUST = [
  { icon: Ticket, label: "Funciona com qualquer bilheteria" },
  { icon: Clock3, label: "Comunidade e chat em tempo real" },
  { icon: Smartphone, label: "Web + app mobile" },
  { icon: ShieldCheck, label: "Privacidade (LGPD) e moderação" },
];

export function LandingHero() {
  return (
    <>
      <section className={styles.hero} aria-labelledby="produto-titulo">
        <CityMap id="hero" pulse />
        <div className={cn(styles.container, styles.heroGrid)}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Para quem vai e para quem organiza</p>
            <h1 id="produto-titulo" className={styles.h1}>
              A cidade ao vivo —{" "}
              <span className={styles.h1Soft}>do mapa à porta do evento.</span>
            </h1>
            <p className={styles.heroSub}>
              Descubra no mapa o que acontece perto de você. Chegue sabendo quem vai estar lá.{" "}
              <strong>Comunidade, chat, conexões e check-in em um só lugar</strong> — funcionando com a bilheteria que o organizador já usa.
            </p>
            <div className={styles.actions}>
              <Link href="/" className={cn(styles.btn, styles.btnPrimary)}>
                <MapPinned size={18} aria-hidden="true" />
                Explorar eventos agora
              </Link>
              <a href="#demo" className={cn(styles.btn, styles.btnGhost)}>
                <PlayCircle size={18} aria-hidden="true" />
                Ver como funciona
              </a>
              <a href="#organizadores" className={styles.textLink}>
                Sou organizador <ArrowRight size={16} aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className={styles.heroVisual}>
            <BrowserFrame
              src="/landing/agenda.jpg"
              alt="Agenda de eventos do EventMap com busca, filtros e cartões de eventos como Jazz no Terraço e Festival Pôr do Sol"
              width={1860}
              height={1185}
              sizes="(max-width: 960px) 92vw, 600px"
              address="EventMap · Agenda"
              priority
            />
            <PhoneFrame
              className={styles.heroPhone}
              src="/landing/evento-mobile.jpg"
              alt="Página do evento Festival Pôr do Sol no celular, com foto, categoria, data e local"
              sizes="(max-width: 960px) 30vw, 200px"
              priority
            />
            <div className={styles.heroTag} aria-hidden="true">
              <span className={styles.heroTagIcon}><BellRing size={16} /></span>
              <span><small>Lembrete</small>Começa em 2 h · a 18 min</span>
            </div>
            <p className={cn(styles.caption, styles.heroCaption)}>{REAL_UI_CAPTION}</p>
          </div>
        </div>
      </section>

      <section className={styles.trust} aria-label="O que o EventMap garante">
        <div className={styles.container}>
          <ul className={styles.trustList}>
            {TRUST.map(({ icon: Icon, label }) => (
              <li key={label}><Icon size={18} aria-hidden="true" />{label}</li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
