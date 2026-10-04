"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Evento } from "@/types";
import { getSavedEvents } from "@/app/(actions)/engagement/action";
import { EventCards } from "@/components/MyComponents/TableEventsClient";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { FadeInView } from "@/components/animations/FadeInView";
export default function SavedEvents() {
 const { status, data: session } = useSession();
 const [events,setEvents] = useState<Evento[]>([]);
 const [loading,setLoading] = useState(true);
 const [error,setError] = useState('');
 const [retry,setRetry] = useState(0);
 useEffect(() => { let active=true; if(status==='loading')return; if(status!=='authenticated'){setEvents([]);setLoading(false);return;} setLoading(true); getSavedEvents().then(items => {if(active){setEvents(items);setError('');}}).catch(() => {if(active)setError('Não foi possível carregar sua agenda.');}).finally(() => {if(active)setLoading(false);});return()=>{active=false;}; },[status,session?.user?.id,retry]);
 return <main className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-10"><div className="mx-auto max-w-6xl space-y-6"><header className="flex items-start gap-4"><SidebarTrigger /><FadeInView><p className="text-sm font-semibold text-primary">Suas descobertas</p><h1 className="mt-1 text-3xl font-bold">Minha agenda</h1><p className="mt-2 text-muted-foreground">Eventos que você salvou. Abra um evento para ajustar o lembrete ou removê-lo da agenda.</p></FadeInView></header>{loading ? <p role="status">Carregando sua agenda...</p> : status!=='authenticated' ? <div className="rounded-2xl border p-8"><p>Entre para salvar eventos e montar sua agenda.</p><Link href="/login" className="mt-3 inline-block text-primary underline">Entrar</Link></div> : error ? <div role="alert" className="rounded-2xl border p-6"><p>{error}</p><button type="button" className="mt-3 text-primary underline" onClick={()=>setRetry(value=>value+1)}>Tentar novamente</button></div> : events.length ? <EventCards events={events} /> : <div className="rounded-2xl border border-dashed p-8 text-center"><h2 className="text-xl font-semibold">Sua próxima experiência começa aqui</h2><p className="mt-2 text-muted-foreground">Salve os eventos que chamarem sua atenção.</p><Link href="/EventsCreated" className="mt-4 inline-block rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground">Explorar eventos</Link></div>}</div></main>;
}
