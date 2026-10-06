"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, Eye, Heart, MousePointerClick } from "lucide-react";
import { getPromoterStats } from "@/app/(actions)/engagement/action";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { eventStatusLabels, type EventStatus } from "@/types/features";
import { FadeInView } from "@/components/animations/FadeInView";
import { StaggerList } from "@/components/animations/StaggerList";

type Stats = Awaited<ReturnType<typeof getPromoterStats>>;

export default function Resultados() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    void getPromoterStats().then((result) => { if (active) { setStats(result); setError(""); } }).catch(() => { if (active) setError("Não foi possível carregar os resultados."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);

  return <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10"><div className="mx-auto max-w-6xl space-y-7">
    <header className="flex items-start gap-4"><SidebarTrigger className="mt-1 shrink-0" /><FadeInView><p className="mb-2 text-sm font-semibold uppercase tracking-widest text-primary">Painel de eventos</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Resultados</h1><p className="mt-2 max-w-2xl text-muted-foreground">Veja como as pessoas descobriram e interagiram com seus eventos.</p></FadeInView></header>
    {loading ? <p role="status" className="rounded-2xl border bg-card p-8 text-muted-foreground">Carregando resultados...</p> : error ? <div role="alert" className="rounded-2xl border bg-card p-8"><p>{error}</p><button type="button" onClick={() => { setLoading(true); setRetry((value) => value + 1); }} className="mt-3 font-semibold text-primary underline">Tentar novamente</button></div> : stats && <>
      <StaggerList className="grid gap-4 sm:grid-cols-3" itemClassName="h-full"><Metric icon={Eye} label="Visualizações" value={stats.totals.views} /><Metric icon={MousePointerClick} label="Cliques em ingressos" value={stats.totals.ticketClicks} /><Metric icon={Heart} label="Favoritos" value={stats.totals.favorites} /></StaggerList>
      <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7" aria-labelledby="results-events-title"><div className="flex items-start gap-3"><BarChart3 className="mt-1 h-5 w-5 text-primary" /><div><h2 id="results-events-title" className="text-xl font-semibold">Por evento</h2><p className="mt-1 text-sm text-muted-foreground">Esses números indicam interesse. Cliques em ingressos não representam vendas confirmadas.</p></div></div>
        {stats.events.length === 0 ? <div className="mt-8 rounded-xl border border-dashed p-8 text-center"><p className="font-medium">Ainda não há eventos para analisar.</p><Link href="/CriarEvento" className="mt-3 inline-block font-semibold text-primary underline underline-offset-4">Criar evento</Link></div> : <div className="mt-6 grid gap-4 md:grid-cols-2">{stats.events.map((event) => {
          const recent = [...event.daily].reverse().slice(-7);
          const maxViews = Math.max(1, ...recent.map((day) => day.views));
          return <article key={event.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 break-words font-semibold">{event.nome}</h3><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{eventStatusLabels[event.status as EventStatus] ?? event.status}</span></div><dl className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-muted/50 p-2"><dt className="text-xs text-muted-foreground">Visualizações</dt><dd className="mt-1 font-bold">{event.views}</dd></div><div className="rounded-lg bg-muted/50 p-2"><dt className="text-xs text-muted-foreground">Cliques</dt><dd className="mt-1 font-bold">{event.ticketClicks}</dd></div><div className="rounded-lg bg-muted/50 p-2"><dt className="text-xs text-muted-foreground">Favoritos</dt><dd className="mt-1 font-bold">{event.favorites}</dd></div></dl>{recent.length > 0 && <div className="mt-5"><p className="mb-2 text-xs font-medium text-muted-foreground">Visualizações recentes</p><div className="flex h-20 items-end gap-2" role="img" aria-label={recent.map((day) => `${new Date(day.day).toLocaleDateString("pt-BR")}: ${day.views} visualizações`).join("; ")}>{recent.map((day) => <div key={String(day.day)} className="min-w-0 flex-1 rounded-t bg-primary/70" style={{ height: `${Math.max(5, day.views / maxViews * 100)}%` }} title={`${new Date(day.day).toLocaleDateString("pt-BR")}: ${day.views} visualizações`} />)}</div></div>}</article>;
        })}</div>}
      </section>
    </>}
  </div></main>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: number }) {
  return <div className="rounded-2xl border bg-card p-5 shadow-sm"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" aria-hidden="true" /></span><p className="mt-4 text-sm text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-bold">{value.toLocaleString("pt-BR")}</p></div>;
}
