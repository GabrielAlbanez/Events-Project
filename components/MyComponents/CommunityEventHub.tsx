"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, ClipboardList, ListOrdered, MessageCircle, PackageSearch, Megaphone, Star, UsersRound } from "lucide-react";
import { useCommunityChanges } from "@/hooks/useCommunityChanges";
import type { CommunitySection } from "@/lib/community/liveChanges";
import type { CommunityEventSnapshot } from "@/types/community";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useCommunityRealtime } from "@/hooks/useCommunityRealtime";
import { useCommunityResource } from "./CommunityResource";
import { CommunityAction, CommunityCard, CommunitySyncStatus, CommunityInteractionBoundary, CommunityStaleBanner } from "./CommunityUI";
import { CommunityAnnouncements, CommunityFeedback, CommunityLostFound, CommunityPolls, CommunityProgram, CommunityQuestions, CommunityQueues, CommunityTeam } from "./CommunityEventSections";

const sections = [
  { id: "announcements", label: "Avisos", icon: Megaphone, component: CommunityAnnouncements },
  { id: "questions", label: "Perguntas", icon: MessageCircle, component: CommunityQuestions },
  { id: "polls", label: "Enquetes", icon: ClipboardList, component: CommunityPolls },
  { id: "program", label: "Programação", icon: CalendarDays, component: CommunityProgram },
  { id: "queues", label: "Filas", icon: ListOrdered, component: CommunityQueues },
  { id: "team", label: "Equipe", icon: UsersRound, component: CommunityTeam },
  { id: "lost", label: "Achados", icon: PackageSearch, component: CommunityLostFound },
  { id: "feedback", label: "Avaliação", icon: Star, component: CommunityFeedback },
] as const;

export default function CommunityEventHub({ eventId }: { eventId: string }) {
  const resource = useCommunityResource<CommunityEventSnapshot>(`/api/community/events/${encodeURIComponent(eventId)}`);
  const [selected, setSelected] = useState<CommunitySection>("announcements");
  useEffect(() => { setSelected("announcements"); }, [resource.identity]);
  const realtime = useCommunityRealtime({ eventId }, resource.refresh);
  const available = sections.filter(section => section.id !== "team" || resource.data?.permissions.manage || resource.data?.permissions.team);
  const section = available.find(item => item.id === selected) ?? available[0];
  const Section = section.component;
  const panel = useRef<HTMLDivElement>(null);
  const changes = useCommunityChanges({ data: resource.data, identity: resource.identity, revision: resource.revision, source: resource.lastChangeSource, selected: section.id, panel });
  return <CommunityInteractionBoundary online={resource.online}><main className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-10"><div className="mx-auto max-w-5xl space-y-6">
    <header className="flex items-start gap-3"><SidebarTrigger /><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-primary">Comunidade do evento</p><h1 className="mt-1 break-words text-3xl font-bold tracking-tight">{resource.data?.event.name ?? "Tudo para aproveitar seu evento"}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Leia os avisos oficiais, tire dúvidas e acompanhe as atividades em um só lugar.</p><div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground"><CommunitySyncStatus refreshing={resource.refreshing} error={resource.error} realtime={realtime} lastSuccessfulAt={resource.lastSuccessfulAt} /><CommunityAction busy={resource.loading || resource.refreshing} onClick={() => void resource.refresh()}>Atualizar agora</CommunityAction></div></div></header>
    <div className="flex flex-wrap gap-4 text-sm font-semibold text-primary"><Link href={`/eventos/${encodeURIComponent(eventId)}`} className="inline-flex min-h-11 items-center hover:underline">← Detalhes do evento</Link><Link href={`/eventos/${encodeURIComponent(eventId)}/chat`} className="inline-flex min-h-11 items-center hover:underline">Chat dos participantes →</Link><Link href={`/eventos/${encodeURIComponent(eventId)}/conexoes`} className="inline-flex min-h-11 items-center hover:underline">Conexões da festa →</Link><Link href="/salas" className="inline-flex min-h-11 items-center hover:underline">Combinar com amigos →</Link></div>
    <CommunityStaleBanner error={resource.error} hasData={!!resource.data} online={resource.online} refreshing={resource.refreshing} refresh={() => void resource.refresh()} />
    {resource.loading ? <CommunityCard><p role="status">Carregando a comunidade...</p></CommunityCard> : resource.error && !resource.data ? <CommunityCard><p role="alert" className="text-sm">{resource.error}</p><CommunityAction busy={false} onClick={() => void resource.refresh()}>Tentar novamente</CommunityAction></CommunityCard> : resource.data && <>
      {!resource.data.permissions.authenticated && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4"><p className="text-sm">Você pode acompanhar a comunidade. Entre para perguntar, votar e participar.</p><Link href="/login" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Entrar</Link></div>}
      {resource.message && <p role="status" className="rounded-xl border bg-muted/40 p-3 text-sm">{resource.message}</p>}
      <div aria-live="polite" className="space-y-2">{changes.notices.map(notice => {
        const snapshot = resource.data;
        if (!snapshot) return null;
        const queue = notice.kind === "queue-called" ? snapshot.queues.find(item => item.id === notice.id) : null;
        const activity = notice.kind === "activity-live" ? snapshot.program.find(item => item.id === notice.id) : null;
        if (queue && (queue.state === "CLOSED" || queue.mine?.status !== "CALLED") || activity && activity.status !== "LIVE" || !queue && !activity) return null;
        return <aside key={notice.kind + notice.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4"><p className="min-w-0 break-words text-sm font-medium">{queue ? `Chegou sua vez em ${queue.title}. Confira as orientações da fila.` : `${activity?.title} começou. Confira a programação.`}</p><div className="flex flex-wrap gap-3"><button type="button" className="min-h-10 text-sm font-semibold text-primary underline underline-offset-4" onClick={() => setSelected(queue ? "queues" : "program")}>{queue ? "Ver fila" : "Ver programação"}</button><button type="button" className="min-h-10 text-sm text-muted-foreground underline underline-offset-4" onClick={() => changes.dismiss(notice)}>Dispensar aviso</button></div></aside>;
      })}</div>
      <nav aria-label="Seções da comunidade" className="grid grid-cols-2 gap-2 rounded-2xl border bg-card p-2 sm:grid-cols-4">{available.map(item => { const Icon = item.icon; return <button key={item.id} type="button" aria-current={section.id === item.id ? "page" : undefined} onClick={() => setSelected(item.id)} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${section.id === item.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><Icon className="size-4 shrink-0" aria-hidden="true" />{item.label}{!!changes.counts[item.id] && <span className="grid size-5 shrink-0 place-items-center rounded-full bg-foreground/10 text-[11px]" aria-label={`${changes.counts[item.id] === 9 ? "9 ou mais" : changes.counts[item.id]} mudanças desde a última leitura`}>{changes.counts[item.id] === 9 ? "9+" : changes.counts[item.id]}</span>}</button>; })}</nav>
      <div ref={panel} key={section.id + ":" + resource.identity}><Section data={resource.data} busy={resource.busy} act={resource.act} userId={resource.userId} /></div>
    </>}
  </div></main></CommunityInteractionBoundary>;
}
