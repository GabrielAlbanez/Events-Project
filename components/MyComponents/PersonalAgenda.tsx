"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BellRing, CalendarDays, Download, ArrowUpRight } from "lucide-react";
import type { Evento } from "@/types";
import { groupSavedEvents } from "@/lib/personalAgenda";
import { EventCards } from "@/components/MyComponents/TableEventsClient";

import { PlanInvite } from "@/components/MyComponents/PlanInvite";
import { EventRecommendations } from "@/components/MyComponents/EventRecommendations";

type Section = "upcoming" | "past" | "cancelled";
const sections: { key: Section; label: string; empty: string }[] = [
  { key: "upcoming", label: "Próximos", empty: "Nenhum evento próximo na sua agenda." },
  { key: "past", label: "Histórico", empty: "Seus eventos anteriores aparecerão aqui." },
  { key: "cancelled", label: "Cancelados", empty: "Nenhum evento cancelado na sua agenda." },
];

export function PersonalAgenda({ events }: { events: Evento[] }) {
  const [section, setSection] = useState<Section>("upcoming");
  const groups = useMemo(() => groupSavedEvents(events), [events]);
  const selected = sections.find(item => item.key === section)!;
  const next = groups.upcoming[0];
  return <div className="space-y-6">
    <section aria-label="Organize sua agenda" className="overflow-hidden rounded-2xl border bg-card shadow-surface">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0"><p className="text-sm text-muted-foreground">Sua próxima experiência</p><h2 className="mt-2 break-words text-xl font-semibold tracking-tight">{next?.nome || "Escolha o que vem a seguir"}</h2>{next ? <Link href={"/eventos/" + next.id} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Ver evento e ajustar lembrete <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link> : <Link href="/EventsCreated" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary">Explorar eventos</Link>}</div>
        {events.length > 0 && <a href="/api/my-calendar" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"><Download className="h-4 w-4" aria-hidden="true" />Exportar agenda</a>}
      </div>
      <div className="border-t bg-muted/30 px-5 py-4 sm:px-6"><p className="text-xs leading-5 text-muted-foreground">A exportação gera um arquivo de calendário. Após alterações, baixe e importe novamente para atualizar seu calendário.</p></div>
    </section>
    <aside className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4"><BellRing className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><div className="min-w-0"><h2 className="text-sm font-semibold">Mudanças nos seus eventos</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Confira os avisos de alterações e cancelamentos nas <Link href="/notificacoes" className="font-medium text-primary underline underline-offset-4">notificações</Link>. Abra os detalhes de um evento para escolher um lembrete antes de começar.</p></div></aside>
    <PlanInvite events={groups.upcoming} />
    <div role="tablist" aria-label="Eventos da agenda" className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1">{sections.map((item, index) => <button key={item.key} id={"agenda-tab-" + item.key} type="button" role="tab" aria-selected={section === item.key} aria-controls="agenda-panel" tabIndex={section === item.key ? 0 : -1} onClick={() => setSection(item.key)} onKeyDown={event => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const target = event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + sections.length) % sections.length; setSection(sections[target].key); document.getElementById("agenda-tab-" + sections[target].key)?.focus(); }} className={"flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary " + (section === item.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{item.label}<span className="rounded-md bg-current/10 px-1.5 text-xs tabular-nums">{groups[item.key].length}</span></button>)}</div>
    <section id="agenda-panel" role="tabpanel" aria-labelledby={"agenda-tab-" + section} tabIndex={0} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{groups[section].length ? <EventCards events={groups[section]} /> : <div className="rounded-2xl border border-dashed p-8 text-center"><CalendarDays className="mx-auto h-8 w-8 text-primary" aria-hidden="true" /><h2 className="mt-4 text-lg font-semibold">{selected.empty}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{section === "upcoming" ? "Salve os eventos que chamarem sua atenção para reunir seus próximos planos aqui." : "Você pode consultar os outros eventos nas abas da sua agenda."}</p><Link href="/EventsCreated" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Explorar eventos</Link></div>}</section>
    <EventRecommendations events={events} />
  </div>;
}
