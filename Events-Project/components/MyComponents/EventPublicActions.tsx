"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Bookmark, Share2, CalendarPlus, CircleSlash, Flag, Hourglass, TicketCheck, Users, ExternalLink, BadgeCheck } from "lucide-react";
import { getFavoriteState, toggleFavorite, setEventReminder, toggleFollow } from "@/app/(actions)/engagement/action";
import CheckInPass from "./CheckInPass";
import TicketPurchase, { type TicketApproval } from "./tickets/TicketPurchase";
import EventPeoplePreview from "./EventPeoplePreview";
import { hasMetricConsent, METRIC_CONSENT_EVENT } from "@/lib/metricConsent";
import { RegistrationStatusBadge, type RegistrationStatus } from "@/components/ui/status-badge";
import { PopIcon } from "@/components/animations/PopIcon";
import { toast } from "react-toastify";

// PENDING / APPROVED / REJECTED exist only on events where the organizer approves each participant (requiresApproval).
type Registration = { id: string; status: RegistrationStatus; createdAt: string; checkedInAt: string | null };
type RegistrationState = { capacity: number | null; confirmedCount: number; waitingCount: number; registration: Registration | null; requiresApproval?: boolean; ticketSale?: boolean; ticketSalesPaused?: boolean };
type RequestStatus = Extract<RegistrationStatus, "PENDING" | "APPROVED" | "REJECTED">;
const requestStatusOf = (status: RegistrationStatus | undefined): RequestStatus | null => status === "PENDING" || status === "APPROVED" || status === "REJECTED" ? status : null;
type ApiError = { message?: string };
// Action results are shown as toasts; toastId keyed by text avoids stacking the same message twice.
const notify = (text: string, type: "success" | "error") => { if (text) toast(text, { type, toastId: `event-actions:${text}` }); };

export const registrationPrivacyNotice = "Ao confirmar, seu nome e e-mail ficam visíveis para a organização do evento.";
export const approvalPrivacyNotice = "Ao pedir para participar, seu nome e e-mail ficam visíveis para a organização do evento.";

type EventPublicActionsProps = { eventId: string; ticketUrl?: string; eventStatus?: string; isFree?: boolean; priceLabel?: string; googleCalendarUrl?: string | null; /** Fixed mobile CTA bar for the full event page; pass false inside drawers or overlays. */ stickyBar?: boolean; /** Set when EventMap sells this event's tickets (Pix): replaces the free registration with the checkout. */ ticketSale?: { priceCents: number } };

export default function EventPublicActions({ eventId, ticketUrl, eventStatus, isFree, priceLabel, googleCalendarUrl, stickyBar = true, ticketSale }: EventPublicActionsProps) {
  const { status, data: session } = useSession();
  const [saved, setSaved] = useState(false);
  // Incremented only after a confirmed user action, so loading the saved state never animates.
  const [savePulse, setSavePulse] = useState(0);
  const [registrationPulse, setRegistrationPulse] = useState(0);
  const [reminder, setReminder] = useState<number | null>(null);
  const [registration, setRegistration] = useState<RegistrationState | null>(null);
  const [registrationLoading, setRegistrationLoading] = useState(true);
  const [registrationPending, setRegistrationPending] = useState(false);
  const [registrationError, setRegistrationError] = useState("");
  // Bumped after a registration change so the ticket panel re-reads its purchase state (approval gate).
  const [ticketRefresh, setTicketRefresh] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("INCORRECT_INFORMATION");
  const [reportDetails, setReportDetails] = useState("");
  const [reportPending, setReportPending] = useState(false);
  const [pending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelOutOfView, setPanelOutOfView] = useState(false);
  useEffect(() => {
    // The mobile CTA bar appears only after the full actions panel scrolls away, so actions never show twice.
    const panel = panelRef.current;
    if (!panel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setPanelOutOfView(!entry.isIntersecting));
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const recordView = () => {
      if (!hasMetricConsent()) return;
      void fetch('/api/event-engagement/' + encodeURIComponent(eventId), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "view" }), keepalive: true }).catch(() => undefined);
    };
    recordView();
    window.addEventListener(METRIC_CONSENT_EVENT, recordView);
    return () => window.removeEventListener(METRIC_CONSENT_EVENT, recordView);
  }, [eventId]);
  useEffect(() => {
    let active = true;
    if (status !== "authenticated") { setSaved(false); setReminder(null); return; }
    getFavoriteState(eventId).then(result => { if (active) { setSaved(result.saved); setReminder(result.reminderMinutes); } }).catch(() => { if (active) notify("Não foi possível consultar sua agenda.", "error"); });
    return () => { active = false; };
  }, [eventId, status, session?.user?.id]);
  useEffect(() => {
    const controller = new AbortController();
    setRegistrationLoading(true);
    fetch(`/api/events/${encodeURIComponent(eventId)}/registration`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível consultar as vagas.");
        return response.json() as Promise<RegistrationState>;
      })
      .then((result) => { setRegistration(result); setRegistrationError(""); })
      .catch(() => { if (!controller.signal.aborted) setRegistrationError("Não foi possível consultar as vagas. Tente atualizar a página."); })
      .finally(() => { if (!controller.signal.aborted) setRegistrationLoading(false); });
    return () => controller.abort();
  }, [eventId, status, session?.user?.id]);
  async function changeRegistration(method: "POST" | "DELETE") {
    setRegistrationPending(true);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/registration`, { method });
      const result = await response.json() as ApiError;
      if (!response.ok) throw new Error(result.message || "Não foi possível atualizar sua inscrição.");
      const wasRequest = Boolean(registration?.requiresApproval);
      const latest = await fetch(`/api/events/${encodeURIComponent(eventId)}/registration`);
      if (!latest.ok) throw new Error("Inscrição alterada. Atualize a página para conferir o estado.");
      const next = await latest.json() as RegistrationState;
      setRegistration(next);
      setTicketRefresh(value => value + 1);
      if (method === "POST") setRegistrationPulse(value => value + 1);
      if (wasRequest && method === "POST" && next.registration?.status === "PENDING") notify("Pedido enviado. Avisaremos quando a organização responder.", "success");
      if (wasRequest && method === "DELETE") notify("Pedido cancelado.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível atualizar sua inscrição.", "error");
    } finally {
      setRegistrationPending(false);
    }
  }
  async function submitReport() {
    setReportPending(true);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reportReason, details: reportDetails.trim() }),
      });
      const result = await response.json() as ApiError;
      if (!response.ok) throw new Error(result.message || "Não foi possível enviar a denúncia.");
      notify("Denúncia enviada para análise. Obrigado por nos avisar.", "success");
      setReportDetails("");
      setReportOpen(false);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível enviar a denúncia.", "error");
    } finally {
      setReportPending(false);
    }
  }
  async function share() {
    const url = new URL('/eventos/' + encodeURIComponent(eventId), window.location.origin).href;
    try { if (navigator.share) await navigator.share({ title: "Evento no EventMap", url }); else { await navigator.clipboard.writeText(url); notify("Link do evento copiado.", "success"); } }
    catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) notify("Não foi possível compartilhar. Copie o endereço desta página.", "error"); }
  }
  const toggleSave = () => startTransition(async () => { try { const result = await toggleFavorite(eventId); notify(result.message, result.success ? "success" : "error"); if (result.success && typeof result.saved === "boolean") { setSaved(result.saved); if (result.saved) setSavePulse(value => value + 1); else setReminder(null); } } catch { notify("Não foi possível salvar. Tente novamente.", "error"); } });
  const loginHref = `/login?callbackUrl=${encodeURIComponent(`/eventos/${eventId}`)}`;
  const hasExternalTickets = Boolean(ticketUrl && /^https?:\/\//i.test(ticketUrl));
  const trackTicket = () => { if (!hasMetricConsent()) return; void fetch('/api/event-engagement/' + encodeURIComponent(eventId), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ticket" }), keepalive: true }).catch(() => undefined); };
  const registrationOpen = eventStatus !== "CANCELLED" && eventStatus !== "ENDED";
  const activeRegistration = registration?.registration && registration.registration.status !== "CANCELLED" ? registration.registration : null;
  const waitlistOnly = Boolean(registration && registration.capacity !== null && registration.confirmedCount >= registration.capacity);
  // Drawers/modals don't pass ticketSale; when EventMap sells this event's tickets they link to the checkout instead of the free RSVP.
  const sellsElsewhere = !ticketSale && Boolean(registration?.ticketSale);
  // EventMap sells this event but payments are paused: neither checkout nor free RSVP.
  const salesPaused = !ticketSale && Boolean(registration?.ticketSalesPaused);
  const canRegister = registrationOpen && !registrationLoading && Boolean(registration) && !activeRegistration && !sellsElsewhere && !salesPaused;
  // Organizer approval: the visitor asks to participate; paid events unlock the purchase only after APPROVED.
  const requiresApproval = Boolean(registration?.requiresApproval);
  const requestStatus = requestStatusOf(registration?.registration?.status);
  const joinLabel = requiresApproval ? "Pedir para participar" : waitlistOnly ? "Entrar na lista de espera" : "Confirmar presença";
  const joiningLabel = requiresApproval ? "Enviando pedido..." : "Confirmando...";
  const privacyNotice = requiresApproval ? approvalPrivacyNotice : null;
  const button = "em-motion-press inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";
  // Mobile: equal-width two-column grid with short labels; from sm up the original inline buttons.
  const tile = `${button.replace(" px-4 ", " px-2 sm:px-4 ")} min-w-0 flex-1 basis-[calc(50%-0.25rem)] whitespace-nowrap sm:flex-none sm:basis-auto sm:whitespace-normal`;
  const iconButton = button.replace(" px-4 ", " w-11 shrink-0 px-0 ");
  const primaryButton = `${button} border-primary bg-primary text-primary-foreground hover:bg-primary/90`;
  const requestButton = <button type="button" disabled={registrationPending} onClick={() => void changeRegistration("POST")} className={primaryButton}>{registrationPending ? joiningLabel : "Pedir para participar"}</button>;
  const cancelRequestButton = <button type="button" disabled={registrationPending} onClick={() => void changeRegistration("DELETE")} className={button}>{registrationPending ? "Atualizando..." : "Cancelar pedido"}</button>;
  // Status of a request, paired with an icon and text (never color alone).
  const requestNotice = requestStatus === "PENDING"
    ? <div className="space-y-1"><p role="status" className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-800 dark:text-amber-300"><PopIcon pulse={registrationPulse}><Hourglass aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /></PopIcon><span>Pedido enviado — aguardando aprovação da organização</span></p><p className="text-sm leading-6 text-muted-foreground">Você recebe um aviso quando a organização responder.</p></div>
    : requestStatus === "REJECTED"
      ? <p role="status" className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground"><CircleSlash aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><span>Sua participação não foi aprovada pela organização deste evento.</span></p>
      : requestStatus === "APPROVED"
        ? <p role="status" className="flex items-start gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300"><BadgeCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><span>Participação aprovada — compre seu ingresso</span></p>
        : null;
  // Paid approval events: the ticket panel shows this instead of the buy button until the request is approved.
  const ticketApproval: TicketApproval | undefined = requiresApproval ? {
    notice: requestStatus === "APPROVED" ? requestNotice : null,
    action: registrationLoading && !registration ? <p role="status" className="text-sm text-muted-foreground">Consultando sua inscrição...</p>
      : registrationError && !registration ? <p role="alert" className="text-sm text-destructive">{registrationError}</p>
        : requestStatus === "PENDING" ? <>{requestNotice}{cancelRequestButton}</>
          : requestStatus === "REJECTED" ? requestNotice
            : <>
              <p className="text-sm leading-6 text-muted-foreground">A organização aprova cada participante. Peça para participar: a compra do ingresso é liberada depois da aprovação.</p>
              {requestButton}
              <p className="text-xs leading-5 text-muted-foreground">{approvalPrivacyNotice} <Link href="/privacidade" className="font-medium text-brand underline-offset-4 hover:underline">Saiba mais</Link></p>
            </>,
  } : undefined;
  const stickyAction = ticketSale && registrationOpen
    ? activeRegistration && requestStatus !== "APPROVED" ? null : <a href="#ticket-title" className={`${button} shrink-0 border-primary bg-primary text-primary-foreground`}>{requiresApproval && requestStatus !== "APPROVED" ? "Pedir para participar" : "Comprar ingresso"}</a>
    : canRegister
    ? status === "authenticated"
      ? <button type="button" disabled={registrationPending} onClick={() => void changeRegistration("POST")} className={`${button} shrink-0 border-primary bg-primary text-primary-foreground hover:bg-primary/90`}>{registrationPending ? joiningLabel : requiresApproval ? "Pedir para participar" : waitlistOnly ? "Entrar na lista de espera" : "Confirmar presença"}</button>
      : status === "unauthenticated" ? <Link href={loginHref} className={`${button} shrink-0 border-primary bg-primary text-primary-foreground`}>{requiresApproval ? "Pedir para participar" : "Confirmar presença"}</Link> : null
    : registrationOpen && hasExternalTickets && !isFree
      ? <a href={ticketUrl} target="_blank" rel="noopener noreferrer" onClick={trackTicket} className={`${button} shrink-0 border-primary bg-primary text-primary-foreground`}>Comprar ingresso ↗<span className="sr-only"> no site do organizador (abre em nova aba)</span></a>
      : registrationOpen && hasExternalTickets
        ? <a href={ticketUrl} target="_blank" rel="noopener noreferrer" onClick={trackTicket} className={`${button} shrink-0 border-primary bg-primary text-primary-foreground`}>Ver acesso ↗<span className="sr-only"> no site do organizador (abre em nova aba)</span></a>
        : null;
  const showStickyBar = stickyBar && panelOutOfView && (Boolean(stickyAction) || Boolean(activeRegistration && registrationOpen));
  useEffect(() => {
    // The global footer reads this variable to stay clear of the fixed bar (mobile only, see ClientProviders).
    if (!showStickyBar) return;
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--event-cta-space", "8rem");
    return () => { rootStyle.removeProperty("--event-cta-space"); };
  }, [showStickyBar]);
  return <div ref={panelRef} className="space-y-3">
    {ticketSale && registrationOpen && <TicketPurchase eventId={eventId} priceCents={ticketSale.priceCents} approval={ticketApproval} refreshKey={ticketRefresh} />}
    {sellsElsewhere && registrationOpen && <Link href={`/eventos/${encodeURIComponent(eventId)}#ticket-title`} className={`${button} w-full border-primary bg-primary text-primary-foreground hover:bg-primary/90`}><TicketCheck aria-hidden="true" className="h-4 w-4" />{activeRegistration && !requestStatus ? "Ver meu ingresso" : requiresApproval && requestStatus !== "APPROVED" ? requestStatus ? "Ver meu pedido" : "Pedir para participar" : `Comprar ingresso${priceLabel ? ` · ${priceLabel}` : ""}`}</Link>}
    {salesPaused && registrationOpen && !activeRegistration && <p role="status" className="flex items-start gap-2 rounded-2xl border bg-muted/30 p-4 text-sm leading-6"><TicketCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />As vendas deste evento estão pausadas no momento.</p>}
    {!ticketSale && !sellsElsewhere && !salesPaused && eventStatus !== "CANCELLED" && eventStatus !== "ENDED" && <section aria-labelledby="registration-title" className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
      <div className="flex items-start gap-3"><Users aria-hidden="true" className="mt-0.5 h-5 w-5 text-brand" /><div><h2 id="registration-title" className="font-semibold">Participar deste evento</h2><p className="mt-1 text-sm text-muted-foreground">{requiresApproval ? `A organização aprova cada participante. Peça para participar e acompanhe a resposta aqui.${hasExternalTickets && !isFree ? " A compra e as regras do ingresso ficam no site do organizador." : ""}` : isFree ? "Inscrição gratuita pelo EventMap. Confirme sua presença e acompanhe sua inscrição aqui." : hasExternalTickets ? "Confirme sua presença no EventMap. A compra e as regras do ingresso ficam no site do organizador; esta confirmação não substitui o ingresso." : "Confirme sua presença no EventMap. Consulte as informações do organizador sobre ingresso e acesso."}</p></div></div>
      {registrationLoading ? <p role="status" className="mt-4 text-sm text-muted-foreground">Consultando vagas...</p> : registrationError && !registration ? <p role="alert" className="mt-4 text-sm text-destructive">{registrationError}</p> : registration && <div className="mt-4 space-y-3">
        <p className="text-sm text-muted-foreground">{registration.confirmedCount} {registration.confirmedCount === 1 ? "presença confirmada" : "presenças confirmadas"}{registration.capacity !== null ? ` de ${registration.capacity} ${registration.capacity === 1 ? "vaga" : "vagas"}` : ""}{registration.waitingCount > 0 ? ` · ${registration.waitingCount} na lista de espera` : ""}</p>
        {registration.registration?.status === "CONFIRMED" || registration.registration?.status === "CHECKED_IN" ? <p role="status" className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300"><PopIcon pulse={registrationPulse}><TicketCheck className="h-4 w-4" /></PopIcon>{registration.registration.status === "CHECKED_IN" ? "Entrada registrada" : "Presença confirmada"}</p> : registration.registration?.status === "WAITLISTED" ? <p role="status" className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-800 dark:text-amber-300">Você está na lista de espera. Avisaremos se surgir uma vaga.</p> : requestNotice}
        {registration.registration?.status === "CONFIRMED" && <p className="text-sm leading-6 text-muted-foreground">{hasExternalTickets && !isFree ? "Próximo passo: confira e adquira seu ingresso no site do organizador. Você pode consultar sua presença e o passe do EventMap nesta página." : "Próximo passo: consulte seu passe abaixo e confira o local e o horário do evento. Volte a esta página para acompanhar sua inscrição."}</p>}
        {status === "authenticated" && registration.registration?.status === "CONFIRMED" && <CheckInPass key={session?.user?.id} eventId={eventId} />}
        {status === "authenticated" ? registration.registration?.status === "CHECKED_IN" || requestStatus === "REJECTED" ? null : requestStatus ? cancelRequestButton : registration.registration && registration.registration.status !== "CANCELLED" ? <button type="button" disabled={registrationPending} onClick={() => void changeRegistration("DELETE")} className={button}>{registrationPending ? "Atualizando..." : "Cancelar inscrição"}</button> : <button type="button" disabled={registrationPending} onClick={() => void changeRegistration("POST")} className={`${button} bg-primary text-primary-foreground hover:bg-primary/90`}>{registrationPending ? joiningLabel : joinLabel}</button> : <Link href={loginHref} className={`${button} bg-primary text-primary-foreground`}>{requiresApproval ? "Entre para pedir para participar" : "Entre para confirmar presença"}</Link>}
        {!activeRegistration && <p className="text-xs leading-5 text-muted-foreground">{privacyNotice ?? <>{registrationPrivacyNotice}</>} <Link href="/privacidade" className="font-medium text-brand underline-offset-4 hover:underline">Saiba mais</Link></p>}
      </div>}
      {registrationError && registration && <p role="alert" className="mt-3 text-sm text-destructive">{registrationError}</p>}
    </section>}
    {eventStatus === "PUBLISHED" && <EventPeoplePreview eventId={eventId} />}
    <div className="flex flex-wrap gap-2">
      {status === "authenticated" ? <button type="button" disabled={pending} aria-pressed={saved} className={tile} onClick={toggleSave}><PopIcon pulse={savePulse}><Bookmark className={saved ? "h-4 w-4 fill-current" : "h-4 w-4"} /></PopIcon><span className="sm:hidden">{saved ? "Salvo" : "Salvar"}</span><span className="hidden sm:inline">{saved ? "Salvo na minha agenda" : "Salvar evento"}</span></button> : <Link className={tile} href={loginHref}><Bookmark className="h-4 w-4 sm:hidden" aria-hidden="true" /><span className="sm:hidden">Salvar<span className="sr-only"> (entrar na conta)</span></span><span className="hidden sm:inline">Entrar para salvar</span></Link>}
      <button type="button" onClick={() => void share()} className={tile}><Share2 className="h-4 w-4" aria-hidden="true" />Compartilhar</button>
      <a className={tile} href={'/api/event-calendar/' + encodeURIComponent(eventId)}><CalendarPlus className="h-4 w-4" aria-hidden="true" /><span className="sm:hidden">Calendário<span className="sr-only"> (arquivo .ics)</span></span><span className="hidden sm:inline">Adicionar ao calendário (.ics)</span></a>
      {googleCalendarUrl && <a className={tile} href={googleCalendarUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" aria-hidden="true" /><span aria-hidden="true"><span className="sm:hidden">Google</span><span className="hidden sm:inline">Google Agenda</span></span><span className="sr-only">Google Agenda (abre em nova aba)</span></a>}
      {ticketUrl && /^https?:\/\//i.test(ticketUrl) && <a className={button + " order-first basis-full bg-primary text-primary-foreground sm:order-none sm:basis-auto"} href={ticketUrl} target="_blank" rel="noopener noreferrer" onClick={trackTicket}>{isFree ? "Consultar acesso no site do organizador ↗" : "Comprar ingresso no site do organizador ↗"}</a>}
    </div>
    {saved && <label className="flex flex-wrap items-center gap-3 text-sm">Lembrete na plataforma<select aria-label="Quando receber o lembrete" className="min-h-11 rounded-xl border bg-background px-3" disabled={pending} value={reminder ?? "none"} onChange={e => { const minutes = e.target.value === "none" ? null : Number(e.target.value); startTransition(async () => { try { const result = await setEventReminder(eventId, minutes); notify(result.message, result.success ? "success" : "error"); if (result.success) setReminder(minutes); } catch { notify("Não foi possível configurar o lembrete.", "error"); } }); }}><option value="none">Sem lembrete</option><option value="60">1 hora antes</option><option value="1440">1 dia antes</option></select><span className="text-xs text-muted-foreground">Acompanhe os avisos ao acessar o site.</span></label>}
    {status === "authenticated" && eventStatus === "PUBLISHED" && <div className="pt-2"><button type="button" aria-expanded={reportOpen} onClick={() => setReportOpen((open) => !open)} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><Flag className="h-4 w-4" />Denunciar informações do evento</button>
      {reportOpen && <div className="mt-3 max-w-xl space-y-3 rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Sua denúncia será analisada pela equipe de moderação.</p><label htmlFor="report-reason" className="block text-sm font-medium">Motivo</label><select id="report-reason" value={reportReason} onChange={(event) => setReportReason(event.target.value)} className="min-h-11 w-full rounded-xl border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><option value="INCORRECT_INFORMATION">Informações incorretas</option><option value="INAPPROPRIATE_CONTENT">Conteúdo inadequado</option><option value="SPAM">Spam ou fraude</option><option value="OTHER">Outro motivo</option></select><label htmlFor="report-details" className="block text-sm font-medium">Descreva o problema</label><textarea id="report-details" value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={1000} rows={3} placeholder="Explique o que precisa ser verificado" className="w-full rounded-xl border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" /><button type="button" disabled={reportPending || reportDetails.trim().length < 5} onClick={() => void submitReport()} className={`${button} bg-primary text-primary-foreground disabled:opacity-50`}>{reportPending ? "Enviando..." : "Enviar denúncia"}</button></div>}
    </div>}
    {showStickyBar && <div role="region" aria-label="Ação rápida do evento" className="fixed inset-x-0 bottom-0 z-30 border-t bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_hsl(var(--foreground)/0.08)] xl:hidden">
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <div className="min-w-0 flex-1">
          {activeRegistration && registrationOpen ? <RegistrationStatusBadge status={activeRegistration.status} /> : priceLabel ? <p className="truncate text-sm font-semibold">{priceLabel}</p> : null}
          {activeRegistration && registrationOpen ? <a href={ticketSale ? "#ticket-title" : "#registration-title"} className="mt-1 block text-xs font-medium text-brand underline-offset-4 hover:underline">{requestStatus ? "Ver meu pedido" : ticketSale ? "Ver meu ingresso" : "Ver minha inscrição"}</a> : registration && registration.capacity !== null ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{waitlistOnly ? "Vagas esgotadas · lista de espera aberta" : `${Math.max(registration.capacity - registration.confirmedCount, 0)} vagas restantes`}</p> : null}
        </div>
        {status === "authenticated" ? <button type="button" disabled={pending} aria-pressed={saved} onClick={toggleSave} aria-label={saved ? "Salvo na minha agenda" : "Salvar evento"} className={iconButton}><Bookmark aria-hidden="true" className={saved ? "h-4 w-4 fill-current" : "h-4 w-4"} /></button> : status === "unauthenticated" ? <Link href={loginHref} aria-label="Entrar para salvar" className={iconButton}><Bookmark aria-hidden="true" className="h-4 w-4" /></Link> : null}
        <button type="button" onClick={() => void share()} aria-label="Compartilhar evento" className={iconButton}><Share2 aria-hidden="true" className="h-4 w-4" /></button>
        {stickyAction}
      </div>
      {canRegister && !ticketSale && <p className="mx-auto mt-2 max-w-xl text-[11px] leading-4 text-muted-foreground">{privacyNotice ?? <>{registrationPrivacyNotice}</>}</p>}
    </div>}
  </div>;
}
export function FollowPromoter({ promoterId, following, count }: { promoterId: string; following: boolean; count: number }) {
  const { status } = useSession();
  const [isFollowing, setFollowing] = useState(following);
  const [followers, setFollowers] = useState(count);
  const [pending, startTransition] = useTransition();
  return <div className="space-y-2"><p className="text-sm text-muted-foreground">{followers} seguidores</p>{status === "authenticated" ? <button type="button" disabled={pending} aria-pressed={isFollowing} className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground" onClick={() => startTransition(async () => { try { const result = await toggleFollow(promoterId); notify(result.message, result.success ? "success" : "error"); if (result.success && typeof result.following === "boolean") { setFollowers(value => value + (result.following === isFollowing ? 0 : result.following ? 1 : -1)); setFollowing(result.following); } } catch { notify("Não foi possível atualizar. Tente novamente.", "error"); } })}>{isFollowing ? "Seguindo · deixar de seguir" : "Seguir organizador"}</button> : <Link href="/login" className="text-brand underline">Entre para seguir este organizador</Link>}</div>;
}
