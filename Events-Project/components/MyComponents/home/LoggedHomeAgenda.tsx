"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useSession } from "next-auth/react";
import { ArrowUpRight, CalendarDays, MapPin, Ticket } from "lucide-react";
import CheckInPass from "@/components/MyComponents/CheckInPass";
import { groupSavedEvents } from "@/lib/personalAgenda";
import { eventInstant } from "@/lib/eventTime";
import type { Evento } from "@/types";
import styles from "./LoggedHomeAgenda.module.css";

type RegistrationStatus = "CONFIRMED" | "CHECKED_IN" | "WAITLISTED" | "CANCELLED";
type RegistrationValue = RegistrationStatus | "LOADING" | "ERROR" | null;
type RegistrationResponse = { registration?: { status?: RegistrationStatus } | null };
type Props = { events: Evento[]; loading: boolean; error: boolean; onRetry: () => void; stackRef: RefObject<HTMLDivElement> };
const labels: Record<RegistrationStatus, string> = { CONFIRMED: "Presença confirmada", CHECKED_IN: "Check-in realizado", WAITLISTED: "Na lista de espera", CANCELLED: "Inscrição cancelada" };

function eventDate(event: Evento): string {
  const instant = eventInstant(event.dataInicio, event.startTime, event.timezone);
  if (!instant) return "Data a confirmar";
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: event.timezone || "America/Sao_Paulo" }).format(instant) + (event.startTime ? ` · ${event.startTime}` : "");
}

export default function LoggedHomeAgenda({ events, loading, error, onRetry, stackRef }: Props) {
  const { data: session, status } = useSession();
  const section = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [retryRegistrations, setRetryRegistrations] = useState(0);
  const [registrations, setRegistrations] = useState<{ owner: string; key: string; values: Record<string, RegistrationValue> }>({ owner: "", key: "", values: {} });
  const owner = status === "authenticated" ? session?.user?.id || "" : "";
  const upcoming = useMemo(() => groupSavedEvents(events).upcoming.slice(0, 3), [events]);
  const eventKey = upcoming.map(event => event.id).join("|");

  useEffect(() => {
    if (!section.current) return;
    if (!("IntersectionObserver" in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "150px" });
    observer.observe(section.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!owner || !visible || loading || error) return;
    let active = true;
    const controllers: AbortController[] = [];
    const timers: number[] = [];
    const ids = eventKey ? eventKey.split("|") : [];
    setRegistrations({ owner, key: eventKey, values: Object.fromEntries(ids.map(id => [id, "LOADING" as const])) });
    void Promise.all(ids.map(async id => {
      const controller = new AbortController();
      controllers.push(controller);
      const timer = window.setTimeout(() => controller.abort(), 10000);
      timers.push(timer);
      let value: RegistrationValue = null;
      try {
        const response = await fetch(`/api/events/${encodeURIComponent(id)}/registration`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("registration unavailable");
        const data = await response.json() as RegistrationResponse;
        if (!data || !Object.prototype.hasOwnProperty.call(data, "registration")) throw new Error("Invalid registration response");
        const candidate = data.registration?.status;
        if (data.registration && (!candidate || !Object.prototype.hasOwnProperty.call(labels, candidate))) throw new Error("Invalid registration status");
        if (candidate) value = candidate;
      } catch { value = "ERROR"; }
      finally { window.clearTimeout(timer); }
      if (active) setRegistrations(previous => ({ owner, key: eventKey, values: { ...(previous.owner === owner && previous.key === eventKey ? previous.values : {}), [id]: value } }));
    }));
    return () => { active = false; controllers.forEach(controller => controller.abort()); timers.forEach(timer => window.clearTimeout(timer)); };
  }, [owner, visible, eventKey, loading, error, retryRegistrations]);

  const values = registrations.owner === owner && registrations.key === eventKey && owner ? registrations.values : {};
  const registrationError = Object.values(values).some(value => value === "ERROR");
  const registrationLoading = Object.values(values).some(value => value === "LOADING");
  const registrationLabel = (id: string) => {
    const value = values[id];
    if (value === "LOADING") return "Consultando inscrição…";
    if (value === "ERROR") return "Inscrição indisponível";
    return value ? labels[value] : "Salvo na agenda";
  };
  return <section ref={section} className={styles.section} id="logged-home-agenda" aria-labelledby="logged-home-agenda-title">
    <div className={styles.intro}>
      <span className={styles.eyebrow}>Minha agenda</span>
      <h2 id="logged-home-agenda-title">Seus próximos<br />bons momentos.</h2>
      <p>Os eventos que você salvou, em ordem. Sua inscrição e sua entrada aparecem aqui quando estiverem disponíveis.</p>
      <Link className={styles.action} href="/salvos">Abrir minha agenda <ArrowUpRight size={18} aria-hidden="true" /></Link>
    </div>
    <div className={styles.content}>
      <div ref={stackRef} className={styles.stack} aria-busy={loading}>
        {loading ? [0, 1, 2].map(index => <div key={index} className={`${styles.ticket} ${styles.skeleton}`} aria-hidden="true"><span /><span /><span /></div>) : error ? <div className={styles.empty} role="alert"><Ticket aria-hidden="true" /><h3>Sua agenda não carregou.</h3><p>Tente novamente para ver seus eventos salvos.</p><button className={styles.action} type="button" onClick={onRetry}>Tentar novamente</button></div> : upcoming.length ? upcoming.map((event, index) => <article key={event.id} className={styles.ticket} data-ticket data-home-ticket data-index={index}>
          <div className={styles.main}><span className={styles.ticketLabel}>Evento salvo · {String(index + 1).padStart(2, "0")}</span><h3><Link href={`/eventos/${encodeURIComponent(event.id)}`}>{event.nome}</Link></h3><p><CalendarDays size={15} aria-hidden="true" />{eventDate(event)}</p><p><MapPin size={15} aria-hidden="true" /><span>{event.endereco || "Local a confirmar"}</span></p><span className={styles.status}>{registrationLabel(event.id)}</span></div>
          <div className={styles.stub}><Ticket size={28} aria-hidden="true" /><Link href={`/eventos/${encodeURIComponent(event.id)}`} aria-label={`Ver detalhes de ${event.nome}`}>Ver evento <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
        </article>) : <div className={styles.empty}><Ticket aria-hidden="true" /><h3>Seu próximo plano começa aqui.</h3><p>Salve um evento para encontrá-lo na sua agenda.</p><Link className={styles.action} href="/#home-discovery">Explorar eventos <ArrowUpRight size={18} aria-hidden="true" /></Link></div>}
      </div>
      {!loading && !error && registrationError && <div className={styles.registrationError} role="status"><p>Não foi possível conferir uma ou mais inscrições. Os eventos continuam salvos na sua agenda.</p><button type="button" className={styles.action} disabled={registrationLoading} onClick={() => setRetryRegistrations(value => value + 1)}>{registrationLoading ? "Atualizando inscrições…" : "Tentar atualizar inscrições"}</button></div>}
      {!loading && !error && upcoming.filter(event => values[event.id] === "CONFIRMED").map(event => <div className={styles.pass} key={`${owner}-${event.id}`}><p>Entrada · {event.nome}</p><CheckInPass eventId={event.id} /></div>)}
    </div>
  </section>;
}
