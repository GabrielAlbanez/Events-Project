"use client";
import { useEffect, useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Bookmark, Share2, CalendarPlus } from "lucide-react";
import { getFavoriteState, toggleFavorite, setEventReminder, toggleFollow } from "@/app/(actions)/engagement/action";

export default function EventPublicActions({ eventId, ticketUrl }: { eventId: string; ticketUrl?: string }) {
  const { status, data: session } = useSession();
  const [saved, setSaved] = useState(false);
  const [reminder, setReminder] = useState<number | null>(null);
  const [message, setMessage] = useState("");
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
  async function share() {
    const url = new URL('/eventos/' + encodeURIComponent(eventId), window.location.origin).href;
    try { if (navigator.share) await navigator.share({ title: "Evento no EventMap", url }); else { await navigator.clipboard.writeText(url); setMessage("Link do evento copiado."); } }
    catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setMessage("Não foi possível compartilhar. Copie o endereço desta página."); }
  }
  const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      {status === "authenticated" ? <button type="button" disabled={pending} aria-pressed={saved} className={button} onClick={() => startTransition(async () => { try { const result = await toggleFavorite(eventId); setMessage(result.message); if (result.success && typeof result.saved === "boolean") { setSaved(result.saved); if (!result.saved) setReminder(null); } } catch { setMessage("Não foi possível salvar. Tente novamente."); } })}><Bookmark className="h-4 w-4" />{saved ? "Salvo na minha agenda" : "Salvar evento"}</button> : <Link className={button} href="/login">Entrar para salvar</Link>}
      <button type="button" onClick={() => void share()} className={button}><Share2 className="h-4 w-4" />Compartilhar</button>
      <a className={button} href={'/api/event-calendar/' + encodeURIComponent(eventId)}><CalendarPlus className="h-4 w-4" />Adicionar ao calendário</a>
      {ticketUrl && /^https?:\/\//i.test(ticketUrl) && <a className={button + " bg-primary text-primary-foreground"} href={ticketUrl} target="_blank" rel="noopener noreferrer" onClick={() => { void fetch('/api/event-engagement/' + encodeURIComponent(eventId), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ticket" }), keepalive: true }).catch(() => undefined); }}>Ingressos no site do organizador ↗</a>}
    </div>
    {saved && <label className="flex flex-wrap items-center gap-3 text-sm">Lembrete na plataforma<select aria-label="Quando receber o lembrete" className="min-h-11 rounded-xl border bg-background px-3" disabled={pending} value={reminder ?? "none"} onChange={e => { const minutes = e.target.value === "none" ? null : Number(e.target.value); startTransition(async () => { try { const result = await setEventReminder(eventId, minutes); setMessage(result.message); if (result.success) setReminder(minutes); } catch { setMessage("Não foi possível configurar o lembrete."); } }); }}><option value="none">Sem lembrete</option><option value="60">1 hora antes</option><option value="1440">1 dia antes</option></select><span className="text-xs text-muted-foreground">Acompanhe os avisos ao acessar o site.</span></label>}
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
