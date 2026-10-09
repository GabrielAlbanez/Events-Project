"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { Evento } from "@/types";
import { getRecommendedEvents } from "@/app/(actions)/engagement/action";

type Recommendation = { event: Evento; reason: string };
export function EventRecommendations({ events }: { events: Evento[] }) {
 const [items,setItems] = useState<Recommendation[]>([]);
 const [loading,setLoading] = useState(true);
 const [error,setError] = useState(false);
 const [retry,setRetry] = useState(0);
 useEffect(() => {
  let active = true;
  setLoading(true); setError(false);
  getRecommendedEvents().then(result => { if(active) setItems(result); }).catch(() => { if(active) { setItems([]); setError(true); } }).finally(() => { if(active) setLoading(false); });
  return () => { active = false; };
 }, [events,retry]);
 return <section aria-labelledby="recommendations-title" className="rounded-2xl border bg-card p-5 sm:p-6"><div className="flex items-start gap-3"><Sparkles className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><div><h2 id="recommendations-title" className="text-lg font-semibold tracking-tight">Mais experiências para sua agenda</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Descobertas a partir dos eventos que você salvou, sem repetir sua agenda.</p></div></div>
 {loading ? <div role="status" className="mt-4 grid gap-3 sm:grid-cols-3"><span className="sr-only">Buscando eventos recomendados</span>{[0,1,2].map(item => <div key={item} aria-hidden="true" className="h-36 rounded-xl bg-muted motion-safe:animate-pulse" />)}</div> : error ? <div role="alert" className="mt-4"><p className="text-sm text-muted-foreground">Não foi possível carregar as sugestões.</p><button type="button" onClick={() => setRetry(value => value+1)} className="mt-2 min-h-11 text-sm font-semibold text-primary underline underline-offset-4">Tentar novamente</button></div> : items.length ? <div className="mt-4 grid gap-3 sm:grid-cols-3">{items.map(({event,reason}) => <Link key={event.id} href={"/eventos/"+event.id} className="flex min-w-0 flex-col rounded-xl border p-4 transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><p className="text-xs leading-5 text-primary">{reason}</p><h3 className="mt-2 break-words font-semibold">{event.nome}</h3><p className="mt-2 text-sm text-muted-foreground">{event.dataInicio.split("-").reverse().join("/")}{event.startTime ? " às "+event.startTime : ""}</p><p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">{event.endereco}</p><span className="mt-auto pt-4 text-sm font-semibold text-primary">Ver detalhes</span></Link>)}</div> : <p className="mt-4 text-sm leading-6 text-muted-foreground">Nenhuma nova sugestão por enquanto. Explore a agenda para encontrar outras experiências.</p>}
 </section>;
}
