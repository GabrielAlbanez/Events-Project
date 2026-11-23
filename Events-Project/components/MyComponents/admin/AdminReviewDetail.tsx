"use client";

import { useState, type ReactNode, type Ref } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, ChevronUp, ExternalLink, Flag, ImageOff, MapPin, Tag, Ticket, Trash2, UserRound } from "lucide-react";
import { EventArtwork } from "@/components/MyComponents/EventArtwork";
import { Button } from "@/components/ui/button";
import { EventStatusBadge } from "@/components/ui/status-badge";
import { importedBadge } from "@/lib/aiEvents/sources";
import { effectiveStatus, formatPrice, formatSchedule, organizerOf, reviewProblems, safeHref } from "@/lib/adminReviewQueue";
import type { Evento } from "@/types";

const EventPublicActions = dynamic(() => import("@/components/MyComponents/EventPublicActions"), { ssr: false, loading: () => <p role="status" className="text-sm text-muted-foreground">Carregando...</p> });

export type AdminReviewDetailProps = {
  event: Evento;
  now: Date;
  position: number;
  total: number;
  busy: boolean;
  error: string;
  headingRef: Ref<HTMLHeadingElement>;
  onStep: (direction: -1 | 1) => void;
  onPublish: (event: Evento) => void;
  onRequestCorrection: (event: Evento) => void;
  onDelete: (event: Evento) => void;
};

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return <div className="flex gap-2.5 py-2"><span className="mt-0.5 text-muted-foreground" aria-hidden="true">{icon}</span><div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words text-sm font-medium">{children}</dd></div></div>;
}

export function AdminReviewDetail({ event, now, position, total, busy, error, headingRef, onStep, onPublish, onRequestCorrection, onDelete }: AdminReviewDetailProps) {
  const [showParticipantActions, setShowParticipantActions] = useState(false);
  const status = effectiveStatus(event);
  const pending = status === "PENDING";
  const problems = reviewProblems(event, now);
  const sourceUrl = safeHref(event.aiImport?.sourceUrl);
  const ticketUrl = safeHref(event.linkParaCompra);
  const gallery = Array.from(new Set((event.carrossel ?? []).filter(image => image && image !== event.banner))).flatMap(image => { const href = safeHref(image); return href ? [href] : []; });
  const verifiedAt = event.aiImport?.sourceVerifiedAt ? new Date(event.aiImport.sourceVerifiedAt) : null;

  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex items-center justify-between gap-2 border-b border-border py-1 pl-4 pr-14 lg:pr-2">
      <p className="text-xs font-medium tabular-nums text-muted-foreground">{position} de {total}</p>
      <div className="flex items-center">
        <Button type="button" variant="ghost" size="icon" aria-label="Evento anterior" disabled={total < 2} onClick={() => onStep(-1)}><ChevronUp className="h-4 w-4" aria-hidden="true" /></Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Próximo evento" disabled={total < 2} onClick={() => onStep(1)}><ChevronDown className="h-4 w-4" aria-hidden="true" /></Button>
      </div>
    </div>

    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4">
      <EventArtwork src={event.banner} alt={`Capa de ${event.nome}`} className="aspect-video w-full rounded-xl bg-muted" fallback={<span className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground"><ImageOff className="h-5 w-5" aria-hidden="true" />Sem imagem de capa</span>} />
      {gallery.length > 0 && <ul aria-label="Imagens do evento" className="flex gap-2 overflow-x-auto pb-1">{gallery.map((image, index) => <li key={image} className="shrink-0"><a href={image} target="_blank" rel="noopener noreferrer" aria-label={`Abrir imagem ${index + 1} em nova aba`} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><img src={image} alt="" loading="lazy" className="h-14 w-20 rounded-lg bg-muted object-cover" /></a></li>)}</ul>}

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5"><EventStatusBadge status={status} />{event.aiImport && <span className="inline-flex min-h-7 items-center rounded-full border border-border px-2.5 text-xs font-medium text-muted-foreground">{importedBadge(event.aiImport.sourceUrl)}</span>}</div>
        <h2 ref={headingRef} tabIndex={-1} className="break-words text-xl font-semibold leading-snug tracking-tight focus:outline-none">{event.nome}</h2>
      </header>

      {event.reviewNote && <section className="border-l-2 border-amber-500 pl-3"><h3 className="text-xs font-semibold text-amber-900 dark:text-amber-300">Correção pedida ao promotor</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm">{event.reviewNote}</p></section>}

      <section aria-labelledby="review-checks">
        <h3 id="review-checks" className="text-xs font-semibold text-muted-foreground">Conferência dos dados</h3>
        {problems.length ? <ul className="mt-2 space-y-1.5">{problems.map(problem => <li key={problem.id} className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{problem.label}</li>)}</ul> : <p className="mt-2 flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />Nenhuma lacuna encontrada</p>}
      </section>

      <dl className="grid divide-y divide-border border-y border-border">
        <Fact icon={<CalendarDays className="h-4 w-4" />} label="Quando">{formatSchedule(event)}{event.endTime ? ` às ${event.endTime}` : ""}</Fact>
        <Fact icon={<MapPin className="h-4 w-4" />} label="Local">{event.endereco || "Não informado"}</Fact>
        <Fact icon={<UserRound className="h-4 w-4" />} label="Organização">{event.user ? <Link href={`/promotores/${event.user.id}`} className="text-brand underline-offset-4 hover:underline">{organizerOf(event)}</Link> : organizerOf(event)}</Fact>
        <Fact icon={<Ticket className="h-4 w-4" />} label="Preço">{formatPrice(event)}{ticketUrl && <> · <a href={ticketUrl} target="_blank" rel="noopener noreferrer" className="text-brand underline-offset-4 hover:underline">link de compra</a></>}</Fact>
        <Fact icon={<Tag className="h-4 w-4" />} label="Categoria">{event.category || "Não informada"}</Fact>
        {event.aiImport && <Fact icon={<ExternalLink className="h-4 w-4" />} label="Fonte da importação">{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-brand underline-offset-4 hover:underline">Abrir página original</a> : "Link indisponível"}{verifiedAt && !Number.isNaN(verifiedAt.getTime()) ? ` · conferida em ${verifiedAt.toLocaleDateString("pt-BR")}` : ""}</Fact>}
      </dl>

      <section aria-labelledby="review-description">
        <h3 id="review-description" className="text-xs font-semibold text-muted-foreground">Descrição</h3>
        <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6">{event.descricao || "Sem descrição."}</p>
      </section>

      {[["Classificação", event.ageRating], ["Acessibilidade", event.accessibilityInfo], ["Participação", event.participationInfo]].some(([, value]) => value) && <dl className="space-y-2 text-sm">{[["Classificação", event.ageRating], ["Acessibilidade", event.accessibilityInfo], ["Participação", event.participationInfo]].map(([label, value]) => value ? <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap break-words">{value}</dd></div> : null)}</dl>}

      {event.validate && <section className="space-y-3">
        <Button asChild variant="outline" className="w-full"><Link href={`/eventos/${event.id}`}>Abrir página do evento<ExternalLink className="h-4 w-4" aria-hidden="true" /></Link></Button>
        <Button type="button" variant="ghost" className="w-full" aria-expanded={showParticipantActions} onClick={() => setShowParticipantActions(value => !value)}>{showParticipantActions ? "Ocultar ações de participante" : "Mostrar ações de participante"}</Button>
        {showParticipantActions && <EventPublicActions eventId={event.id} ticketUrl={event.linkParaCompra} stickyBar={false} />}
      </section>}
    </div>

    <div className="border-t border-border bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {error && <p role="alert" className="mb-2 text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        {pending && <Button type="button" className="min-w-0 flex-1" disabled={busy} onClick={() => onPublish(event)}><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{busy ? "Publicando..." : "Publicar"}</Button>}
        {pending && <Button type="button" variant="outline" className="min-w-0 flex-1" disabled={busy} onClick={() => onRequestCorrection(event)}><Flag className="h-4 w-4" aria-hidden="true" />Pedir correção</Button>}
        {!pending && <p className="min-w-0 flex-1 text-sm text-muted-foreground">Sem decisão pendente.</p>}
        <Button type="button" variant="ghost" size="icon" className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy} aria-label={`Excluir ${event.nome}`} title="Excluir evento" onClick={() => onDelete(event)}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
      </div>
    </div>
  </div>;
}
