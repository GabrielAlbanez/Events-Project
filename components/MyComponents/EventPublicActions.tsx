"use client";
import { useEffect, useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Bookmark, Share2, CalendarPlus, Flag, TicketCheck, Users } from "lucide-react";
import { getFavoriteState, toggleFavorite, setEventReminder, toggleFollow } from "@/app/(actions)/engagement/action";
import CheckInPass from "./CheckInPass";

type Registration = { id: string; status: "CONFIRMED" | "WAITLISTED" | "CHECKED_IN" | "CANCELLED"; createdAt: string; checkedInAt: string | null };
type RegistrationState = { capacity: number | null; confirmedCount: number; waitingCount: number; registration: Registration | null };
type ApiError = { message?: string };

export default function EventPublicActions({ eventId, ticketUrl, eventStatus }: { eventId: string; ticketUrl?: string; eventStatus?: string }) {
  const { status, data: session } = useSession();
  const [saved, setSaved] = useState(false);
  const [reminder, setReminder] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [registration, setRegistration] = useState<RegistrationState | null>(null);
  const [registrationLoading, setRegistrationLoading] = useState(true);
  const [registrationPending, setRegistrationPending] = useState(false);
  const [registrationError, setRegistrationError] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("INCORRECT_INFORMATION");
  const [reportDetails, setReportDetails] = useState("");
  const [reportPending, setReportPending] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    void fetch('/api/event-engagement/' + encodeURIComponent(eventId), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "view" }), keepalive: true }).catch(() => undefined);
  }, [eventId]);
  useEffect(() => {
    let active = true;
    if (status !== "authenticated") { setSaved(false); setReminder(null); return; }
    getFavoriteState(eventId).then(result => { if (active) { setSaved(result.saved); setReminder(result.reminderMinutes); } }).catch(() => { if (active) setMessage("Não foi possível consultar sua agenda."); });
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
    setRegistrationError("");
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/registration`, { method });
      const result = await response.json() as ApiError;
      if (!response.ok) throw new Error(result.message || "Não foi possível atualizar sua inscrição.");
      const latest = await fetch(`/api/events/${encodeURIComponent(eventId)}/registration`);
      if (!latest.ok) throw new Error("Inscrição alterada. Atualize a página para conferir o estado.");
      setRegistration(await latest.json() as RegistrationState);
    } catch (error) {
      setRegistrationError(error instanceof Error ? error.message : "Não foi possível atualizar sua inscrição.");
    } finally {
      setRegistrationPending(false);
    }
  }
  async function submitReport() {
    setReportPending(true);
    setReportMessage("");
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reportReason, details: reportDetails.trim() }),
      });
      const result = await response.json() as ApiError;
      if (!response.ok) throw new Error(result.message || "Não foi possível enviar a denúncia.");
      setReportMessage("Denúncia enviada para análise. Obrigado por nos avisar.");
      setReportDetails("");
      setReportOpen(false);
    } catch (error) {
      setReportMessage(error instanceof Error ? error.message : "Não foi possível enviar a denúncia.");
    } finally {
      setReportPending(false);
    }
  }
  async function share() {
    const url = new URL('/eventos/' + encodeURIComponent(eventId), window.location.origin).href;
    try { if (navigator.share) await navigator.share({ title: "Evento no EventMap", url }); else { await navigator.clipboard.writeText(url); setMessage("Link do evento copiado."); } }
    catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setMessage("Não foi possível compartilhar. Copie o endereço desta página."); }
  }
  const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";
  return <div className="space-y-3">
    {eventStatus !== "CANCELLED" && eventStatus !== "ENDED" && <section aria-labelledby="registration-title" className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
      <div className="flex items-start gap-3"><Users aria-hidden="true" className="mt-0.5 h-5 w-5 text-primary" /><div><h2 id="registration-title" className="font-semibold">Participar deste evento</h2><p className="mt-1 text-sm text-muted-foreground">Confirme sua presença aqui e acompanhe sua inscrição.</p></div></div>
      {registrationLoading ? <p role="status" className="mt-4 text-sm text-muted-foreground">Consultando vagas...</p> : registrationError && !registration ? <p role="alert" className="mt-4 text-sm text-destructive">{registrationError}</p> : registration && <div className="mt-4 space-y-3">
        <p className="text-sm text-muted-foreground">{registration.confirmedCount} presenças confirmadas{registration.capacity !== null ? ` de ${registration.capacity} vagas` : ""}{registration.waitingCount > 0 ? ` · ${registration.waitingCount} na lista de espera` : ""}</p>
        {registration.registration?.status === "CONFIRMED" || registration.registration?.status === "CHECKED_IN" ? <p role="status" className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300"><TicketCheck className="h-4 w-4" />{registration.registration.status === "CHECKED_IN" ? "Entrada registrada" : "Presença confirmada"}</p> : registration.registration?.status === "WAITLISTED" ? <p role="status" className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-800 dark:text-amber-300">Você está na lista de espera. Avisaremos se surgir uma vaga.</p> : null}
        {status === "authenticated" && registration.registration?.status === "CONFIRMED" && <CheckInPass key={session?.user?.id} eventId={eventId} />}
        {status === "authenticated" ? registration.registration?.status === "CHECKED_IN" ? null : registration.registration && registration.registration.status !== "CANCELLED" ? <button type="button" disabled={registrationPending} onClick={() => void changeRegistration("DELETE")} className={button}>{registrationPending ? "Atualizando..." : "Cancelar inscrição"}</button> : <button type="button" disabled={registrationPending} onClick={() => void changeRegistration("POST")} className={`${button} bg-primary text-primary-foreground hover:bg-primary/90`}>{registrationPending ? "Confirmando..." : registration.capacity !== null && registration.confirmedCount >= registration.capacity ? "Entrar na lista de espera" : "Confirmar presença"}</button> : <Link href="/login" className={`${button} bg-primary text-primary-foreground`}>Entre para confirmar presença</Link>}
      </div>}
      {registrationError && registration && <p role="alert" className="mt-3 text-sm text-destructive">{registrationError}</p>}
    </section>}
    <div className="flex flex-wrap gap-2">
      {status === "authenticated" ? <button type="button" disabled={pending} aria-pressed={saved} className={button} onClick={() => startTransition(async () => { try { const result = await toggleFavorite(eventId); setMessage(result.message); if (result.success && typeof result.saved === "boolean") { setSaved(result.saved); if (!result.saved) setReminder(null); } } catch { setMessage("Não foi possível salvar. Tente novamente."); } })}><Bookmark className="h-4 w-4" />{saved ? "Salvo na minha agenda" : "Salvar evento"}</button> : <Link className={button} href="/login">Entrar para salvar</Link>}
      <button type="button" onClick={() => void share()} className={button}><Share2 className="h-4 w-4" />Compartilhar</button>
      <a className={button} href={'/api/event-calendar/' + encodeURIComponent(eventId)}><CalendarPlus className="h-4 w-4" />Adicionar ao calendário</a>
      {ticketUrl && /^https?:\/\//i.test(ticketUrl) && <a className={button + " bg-primary text-primary-foreground"} href={ticketUrl} target="_blank" rel="noopener noreferrer" onClick={() => { void fetch('/api/event-engagement/' + encodeURIComponent(eventId), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ticket" }), keepalive: true }).catch(() => undefined); }}>Ingressos no site do organizador ↗</a>}
    </div>
    {saved && <label className="flex flex-wrap items-center gap-3 text-sm">Lembrete na plataforma<select aria-label="Quando receber o lembrete" className="min-h-11 rounded-xl border bg-background px-3" disabled={pending} value={reminder ?? "none"} onChange={e => { const minutes = e.target.value === "none" ? null : Number(e.target.value); startTransition(async () => { try { const result = await setEventReminder(eventId, minutes); setMessage(result.message); if (result.success) setReminder(minutes); } catch { setMessage("Não foi possível configurar o lembrete."); } }); }}><option value="none">Sem lembrete</option><option value="60">1 hora antes</option><option value="1440">1 dia antes</option></select><span className="text-xs text-muted-foreground">Acompanhe os avisos ao acessar o site.</span></label>}
    {status === "authenticated" && eventStatus === "PUBLISHED" && <div className="pt-2"><button type="button" aria-expanded={reportOpen} onClick={() => setReportOpen((open) => !open)} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><Flag className="h-4 w-4" />Denunciar informações do evento</button>
      {reportOpen && <div className="mt-3 max-w-xl space-y-3 rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Sua denúncia será analisada pela equipe de moderação.</p><label htmlFor="report-reason" className="block text-sm font-medium">Motivo</label><select id="report-reason" value={reportReason} onChange={(event) => setReportReason(event.target.value)} className="min-h-11 w-full rounded-xl border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><option value="INCORRECT_INFORMATION">Informações incorretas</option><option value="INAPPROPRIATE_CONTENT">Conteúdo inadequado</option><option value="SPAM">Spam ou fraude</option><option value="OTHER">Outro motivo</option></select><label htmlFor="report-details" className="block text-sm font-medium">Descreva o problema</label><textarea id="report-details" value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={1000} rows={3} placeholder="Explique o que precisa ser verificado" className="w-full rounded-xl border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" /><button type="button" disabled={reportPending || reportDetails.trim().length < 5} onClick={() => void submitReport()} className={`${button} bg-primary text-primary-foreground disabled:opacity-50`}>{reportPending ? "Enviando..." : "Enviar denúncia"}</button></div>}
      {reportMessage && <p role="status" className="mt-2 text-sm">{reportMessage}</p>}
    </div>}
    <p role="status" className="text-sm text-muted-foreground">{message}</p>
  </div>;
}
export function FollowPromoter({ promoterId, following, count }: { promoterId: string; following: boolean; count: number }) {
  const { status } = useSession();
  const [isFollowing, setFollowing] = useState(following);
  const [followers, setFollowers] = useState(count);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  return <div className="space-y-2"><p className="text-sm text-muted-foreground">{followers} seguidores</p>{status === "authenticated" ? <button type="button" disabled={pending} aria-pressed={isFollowing} className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground" onClick={() => startTransition(async () => { try { const result = await toggleFollow(promoterId); setMessage(result.message); if (result.success && typeof result.following === "boolean") { setFollowers(value => value + (result.following === isFollowing ? 0 : result.following ? 1 : -1)); setFollowing(result.following); } } catch { setMessage("Não foi possível atualizar. Tente novamente."); } })}>{isFollowing ? "Seguindo · deixar de seguir" : "Seguir organizador"}</button> : <Link href="/login" className="text-primary underline">Entre para seguir este organizador</Link>}<p role="status" className="text-sm">{message}</p></div>;
}
