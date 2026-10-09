"use client";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useSocket } from "@/context/SocketContext";
import Link from "next/link";
import { Evento } from "@/types";
import { getSavedEvents } from "@/app/(actions)/engagement/action";
import { PersonalAgenda } from "@/components/MyComponents/PersonalAgenda";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { FadeInView } from "@/components/animations/FadeInView";
export default function SavedEvents() {
 const { status, data: session } = useSession();
 const socket = useSocket();
 const [events,setEvents] = useState<Evento[]>([]);
 const [loading,setLoading] = useState(true);
 const [error,setError] = useState('');
 const [retry,setRetry] = useState(0);
 const loadedUser = useRef<string | undefined>();
 const inFlight = useRef(false);
 const queuedRefresh = useRef(false);
 useEffect(() => {
  let active = true;
  if (status === 'loading') return;
  if (status !== 'authenticated') {
   loadedUser.current = undefined; inFlight.current = false; queuedRefresh.current = false;
   setEvents([]); setLoading(false); setError(''); return;
  }
  if (loadedUser.current !== session?.user?.id) { setEvents([]); setLoading(true); }
  inFlight.current = true;
  getSavedEvents().then(items => {
   if (active) { setEvents(items); loadedUser.current = session?.user?.id; setError(''); }
  }).catch(() => { if (active) setError('Não foi possível carregar sua agenda.'); }).finally(() => {
   if (!active) return;
   inFlight.current = false; setLoading(false);
   if (queuedRefresh.current) { queuedRefresh.current = false; setRetry(value => value + 1); }
  });
  return () => { active = false; };
 }, [status, session?.user?.id, retry]);
 useEffect(() => {
  if (status !== 'authenticated') return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = () => {
   if (document.visibilityState !== 'visible' || timer) return;
   if (inFlight.current) { queuedRefresh.current = true; return; }
   timer = setTimeout(() => { timer = undefined; setRetry(value => value + 1); }, 250);
  };
  const visible = () => { if (document.visibilityState === 'visible') refresh(); };
  socket.on('notification-updated', refresh);
  socket.on('connect', refresh);
  document.addEventListener('visibilitychange', visible);
  return () => {
   if (timer) clearTimeout(timer);
   socket.off('notification-updated', refresh);
   socket.off('connect', refresh);
   document.removeEventListener('visibilitychange', visible);
  };
 }, [socket, status, session?.user?.id]);
 return <main className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-10"><div className="mx-auto max-w-6xl space-y-6"><header className="flex items-start gap-4"><SidebarTrigger /><FadeInView><p className="text-sm font-semibold text-primary">Suas descobertas</p><h1 className="mt-1 text-3xl font-bold">Minha agenda</h1><p className="mt-2 text-muted-foreground">Seus próximos planos, lembretes e eventos salvos em um só lugar.</p></FadeInView></header>{loading ? <p role="status">Carregando sua agenda...</p> : status!=='authenticated' ? <div className="rounded-2xl border p-8"><p>Entre para salvar eventos e montar sua agenda.</p><Link href="/login" className="mt-3 inline-block text-primary underline">Entrar</Link></div> : error ? <div role="alert" className="rounded-2xl border p-6"><p>{error}</p><button type="button" className="mt-3 text-primary underline" onClick={()=>setRetry(value=>value+1)}>Tentar novamente</button></div> : <PersonalAgenda key={session?.user?.id} events={events} />}</div></main>;
}
