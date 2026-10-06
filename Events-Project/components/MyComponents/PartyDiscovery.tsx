"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, LazyMotion, m, useReducedMotion } from "framer-motion";
import { Heart, MessageCircle, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { PartyConnectionsSnapshot } from "@/types/partyConnections";
import { partyButton, PartySafetyActions } from "./PartyActions";
import { partyIntents } from "./PartyProfileForm";
import PartyAvatar from "./PartyAvatar";
const features = () => import("framer-motion").then(module => module.domMax);
type Match = PartyConnectionsSnapshot["matches"][number];
export default function PartyDiscovery({ data, busy, act, eventId }: { data: PartyConnectionsSnapshot; busy: boolean; act: (payload: Record<string, unknown>) => Promise<boolean>; eventId: string }) {
  const reduced = useReducedMotion();
  const router = useRouter();
  const [skipped, setSkipped] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [celebration, setCelebration] = useState<Match | null>(null);
  const baseline = useRef(new Set(data.matches.map(match => match.id)));
  const lock = useRef(false);
  const discovery = useRef<HTMLElement>(null);
  const current = data.profiles.find(profile => !profile.liked && !skipped.includes(profile.userId));
  const openChat = (match: Match) => router.push(`/eventos/${encodeURIComponent(eventId)}/conexoes/${encodeURIComponent(match.id)}`);
  useEffect(() => {
    const fresh = data.matches.find(match => !baseline.current.has(match.id));
    data.matches.forEach(match => baseline.current.add(match.id));
    if (fresh) setCelebration(fresh);
  }, [data.matches]);
  useEffect(() => { if (!celebration) return; const timer = setTimeout(() => router.push(`/eventos/${encodeURIComponent(eventId)}/conexoes/${encodeURIComponent(celebration.id)}`), reduced ? 900 : 2400); return () => clearTimeout(timer); }, [celebration, eventId, reduced, router]);
  const connect = async () => {
    if (!current || busy || lock.current) return;
    const id = current.userId; lock.current = true; setPending(true); setFeedback("Registrando seu interesse…");
    try { if (await act({ action: "like", userId: id })) { setSkipped(previous => [...previous, id]); setFeedback("Interesse enviado! Quando for mútuo, a conversa abre aqui."); } else setFeedback("Não foi possível conectar. Tente novamente."); }
    finally { lock.current = false; setPending(false); }
  };
  const skip = () => { if (!current || busy || pending) return; setSkipped(previous => [...previous, current.userId]); setFeedback("Perfil pulado. Você pode rever os perfis depois."); };
  return <LazyMotion features={features} strict><section ref={discovery} tabIndex={-1} className="mx-auto max-w-lg space-y-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Quem você quer conhecer?</h2><span className="text-xs text-muted-foreground">Arraste ou use os botões</span></div><AnimatePresence mode="wait" initial={false}>{current ? <m.article key={current.userId} drag={!busy && !pending && !reduced ? "x" : false} dragConstraints={{ left: 0, right: 0 }} dragElastic={.22} onDragEnd={(_, info) => { if (info.offset.x > 90) void connect(); else if (info.offset.x < -90) skip(); }} initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : -40 }} transition={{ duration: reduced ? 0 : .2 }} className="overflow-hidden rounded-3xl border bg-card shadow-surface" style={{ touchAction: "pan-y" }}><div className="relative grid aspect-[5/4] place-items-center overflow-hidden bg-muted bg-decoration-brand"><span className="grid size-full place-items-center text-6xl font-bold text-primary/70"><PartyAvatar key={current.photoUrl} url={current.photoUrl} name={current.displayName} /></span><span className="absolute bottom-4 left-4 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-semibold">{partyIntents[current.intent].label}</span></div><div className="space-y-4 p-5"><h3 className="break-words text-2xl font-semibold">{current.displayName}</h3>{current.bio && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{current.bio}</p>}<div className="flex flex-wrap gap-2">{current.interests.map(interest => <span key={interest} className="rounded-full bg-muted px-3 py-1 text-xs">{interest}</span>)}</div><div className="grid grid-cols-2 gap-3"><m.button type="button" disabled={busy || pending} whileTap={{ scale: reduced ? 1 : .96 }} className={`${partyButton} border`} onClick={skip}><X size={18} aria-hidden="true" />Pular</m.button><m.button type="button" disabled={busy || pending} whileTap={{ scale: reduced ? 1 : .96 }} className={`${partyButton} bg-primary text-primary-foreground`} onClick={() => void connect()}><Heart size={18} aria-hidden="true" />{pending ? "Conectando…" : "Conectar"}</m.button></div><PartySafetyActions userId={current.userId} displayName={current.displayName} busy={busy || pending} act={act} /></div></m.article> : <m.div key="empty" initial={{ opacity: reduced ? 1 : 0 }} animate={{ opacity: 1 }} className="grid min-h-64 place-content-center gap-3 rounded-3xl border border-dashed p-7 text-center"><Heart className="mx-auto text-primary" aria-hidden="true" /><h3 className="text-xl font-semibold">Sua turma está chegando</h3><p className="text-sm leading-6 text-muted-foreground">Você viu os perfis desta página. Explore a próxima ou volte mais tarde.</p>{skipped.length > 0 && <button type="button" className={`${partyButton} border`} onClick={() => { setSkipped([]); setFeedback(""); }}>Rever perfis pulados</button>}</m.div>}</AnimatePresence>{feedback && <p role="status" className="rounded-xl bg-muted/40 p-3 text-sm">{feedback}</p>}</section><Dialog open={!!celebration} onOpenChange={open => { if (!open) setCelebration(null); }}><DialogContent onCloseAutoFocus={event => { event.preventDefault(); discovery.current?.focus(); }} className="max-w-[calc(100%_-_2rem)] rounded-3xl border bg-card p-0 sm:max-w-md data-[state=open]:animate-none data-[state=closed]:animate-none">{celebration && <m.div initial={{ opacity: reduced ? 1 : 0, scale: reduced ? 1 : .92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: reduced ? 1 : 0 }} transition={{ duration: reduced ? 0 : .3 }} className="relative w-full overflow-hidden rounded-3xl p-8 text-center shadow-surface">{!reduced && <div aria-hidden="true" className="pointer-events-none absolute inset-0">{Array.from({ length: 12 }, (_, index) => <m.span key={index} className="absolute left-1/2 top-1/3 size-2 rounded-full bg-primary" initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: Math.cos(index * Math.PI / 6) * 150, y: Math.sin(index * Math.PI / 6) * 160, opacity: 0 }} transition={{ duration: 1.4, delay: index * .025 }} />)}</div>}<Heart className="mx-auto mb-5 size-12 fill-primary text-primary" aria-hidden="true" /><DialogTitle className="text-3xl font-bold">Deu match!</DialogTitle><DialogDescription className="mt-4 text-sm leading-6 text-muted-foreground">Você e {celebration.profile.displayName} querem se conhecer. Vamos abrir sua conversa privada.</DialogDescription><button autoFocus type="button" onClick={() => openChat(celebration)} className={`${partyButton} mt-6 w-full bg-primary text-primary-foreground`}><MessageCircle size={18} aria-hidden="true" />Conversar agora</button></m.div>}</DialogContent></Dialog></LazyMotion>;
}
