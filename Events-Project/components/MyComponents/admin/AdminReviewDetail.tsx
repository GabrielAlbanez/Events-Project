"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { AlertTriangle, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronUp, ExternalLink, Flag, ImageOff, MapPin, Tag, Ticket, Trash2, UserRound } from "lucide-react";
import { EventArtwork } from "@/components/MyComponents/EventArtwork";
import { Button } from "@/components/ui/button";
import { EventStatusBadge } from "@/components/ui/status-badge";
import { importedBadge } from "@/lib/aiEvents/sources";
import { effectiveStatus, formatPrice, formatSchedule, organizerOf, reviewProblems, safeHref } from "@/lib/adminReviewQueue";
import { cn } from "@/lib/utils";
import type { Evento } from "@/types";
import { reviewEase, reviewSpring, statusAccent } from "./adminReviewTheme";
import { TriagePanel } from "./AdminTriageBadge";

const EventPublicActions = dynamic(() => import("@/components/MyComponents/EventPublicActions"), { ssr: false, loading: () => <p role="status" className="text-sm text-muted-foreground">Carregando...</p> });

export type AdminReviewDetailProps = {
  event: Evento;
  now: Date;
  position: number;
  total: number;
  busy: boolean;
  error: string;
  /** Set only after the server confirmed the decision on this event. */
  success: { label: string; nextName: string | null } | null;
  onStep: (direction: -1 | 1) => void;
  onPublish: (event: Evento) => void;
  onRequestCorrection: (event: Evento) => void;
  onDelete: (event: Evento) => void;
};

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return <div className="flex gap-3 py-2.5"><span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground" aria-hidden="true">{icon}</span><div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words text-sm font-medium">{children}</dd></div></div>;
}

function ReviewBody({ event, now }: { event: Evento; now: Date }) {
  const [showParticipantActions, setShowParticipantActions] = useState(false);
  const status = effectiveStatus(event);
  const problems = reviewProblems(event, now);
  const sourceUrl = safeHref(event.aiImport?.sourceUrl);
  const ticketUrl = safeHref(event.linkParaCompra);
  const ambient = event.banner?.trim() || "";
  const gallery = Array.from(new Set((event.carrossel ?? []).filter(image => image && image !== event.banner))).flatMap(image => { const href = safeHref(image); return href ? [href] : []; });
  const verifiedAt = event.aiImport?.sourceVerifiedAt ? new Date(event.aiImport.sourceVerifiedAt) : null;
  const extras = [["Classificação", event.ageRating], ["Acessibilidade", event.accessibilityInfo], ["Participação", event.participationInfo]] as const;

  return <div className={cn(statusAccent[status], "relative isolate")}>
    {/* Ambient tint: a blurred copy of the artwork (no canvas, so remote images are safe) over the status color. */}
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 overflow-hidden bg-[hsl(var(--status)/0.12)] [mask-image:linear-gradient(to_bottom,black_35%,transparent)]">
      {ambient && <img src={ambient} alt="" decoding="async" className="h-full w-full scale-125 object-cover opacity-45 blur-3xl dark:opacity-40" />}
    </div>
    <div className="space-y-5 p-4">
      <div data-review-hero={event.id} className="overflow-hidden rounded-2xl shadow-[0_18px_40px_-22px_hsl(var(--foreground)/0.55)] ring-1 ring-black/5 dark:shadow-[0_18px_40px_-20px_hsl(0_0%_0%/0.8)] dark:ring-white/10">
        <EventArtwork src={event.banner} alt={`Capa de ${event.nome}`} className="aspect-video w-full bg-muted" fallback={<span className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground"><ImageOff className="h-5 w-5" aria-hidden="true" />Sem imagem de capa</span>} />
      </div>
      {gallery.length > 0 && <ul aria-label="Imagens do evento" className="flex gap-2 overflow-x-auto pb-1">{gallery.map((image, index) => <li key={image} className="shrink-0"><a href={image} target="_blank" rel="noopener noreferrer" aria-label={`Abrir imagem ${index + 1} em nova aba`} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><img src={image} alt="" loading="lazy" className="h-14 w-20 rounded-lg bg-muted object-cover ring-1 ring-black/5 dark:ring-white/10" /></a></li>)}</ul>}

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5"><EventStatusBadge status={status} />{event.aiImport && <span className="inline-flex min-h-7 items-center rounded-full border border-border bg-card/70 px-2.5 text-xs font-medium text-muted-foreground">{importedBadge(event.aiImport.sourceUrl)}</span>}</div>
        <h2 data-review-heading={event.id} tabIndex={-1} className="break-words text-2xl font-semibold leading-tight tracking-tight focus:outline-none">{event.nome}</h2>
      </header>

      {event.reviewNote && <section className="border-l-[3px] border-amber-500 pl-3"><h3 className="text-xs font-semibold text-amber-900 dark:text-amber-300">Correção pedida ao promotor</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm">{event.reviewNote}</p></section>}

      {event.triage && <TriagePanel triage={event.triage} eventId={event.id} />}

      <section aria-labelledby={`review-checks-${event.id}`}>
        <h3 id={`review-checks-${event.id}`} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conferência dos dados</h3>
        {problems.length ? <ul className="mt-2 space-y-1.5">{problems.map(problem => <li key={problem.id} className="flex items-start gap-2 text-sm font-medium text-amber-900 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{problem.label}</li>)}</ul> : <p className="mt-2 flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />Nenhuma lacuna encontrada</p>}
      </section>

      <dl className="grid divide-y divide-border border-y border-border">
        <Fact icon={<CalendarDays className="h-4 w-4" />} label="Quando">{formatSchedule(event)}{event.endTime ? ` às ${event.endTime}` : ""}</Fact>
        <Fact icon={<MapPin className="h-4 w-4" />} label="Local">{event.endereco || "Não informado"}</Fact>
        <Fact icon={<UserRound className="h-4 w-4" />} label="Organização">{event.user ? <Link href={`/promotores/${event.user.id}`} className="text-brand underline-offset-4 hover:underline">{organizerOf(event)}</Link> : organizerOf(event)}</Fact>
        <Fact icon={<Ticket className="h-4 w-4" />} label="Preço">{formatPrice(event)}{ticketUrl && <> · <a href={ticketUrl} target="_blank" rel="noopener noreferrer" className="text-brand underline-offset-4 hover:underline">link de compra</a></>}</Fact>
        <Fact icon={<Tag className="h-4 w-4" />} label="Categoria">{event.category || "Não informada"}</Fact>
        {event.aiImport && <Fact icon={<ExternalLink className="h-4 w-4" />} label="Fonte da importação">{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-brand underline-offset-4 hover:underline">Abrir página original</a> : "Link indisponível"}{verifiedAt && !Number.isNaN(verifiedAt.getTime()) ? ` · conferida em ${verifiedAt.toLocaleDateString("pt-BR")}` : ""}</Fact>}
      </dl>

      <section aria-labelledby={`review-description-${event.id}`}>
        <h3 id={`review-description-${event.id}`} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Descrição</h3>
        <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6">{event.descricao || "Sem descrição."}</p>
      </section>

      {extras.some(([, value]) => value) && <dl className="space-y-2 text-sm">{extras.map(([label, value]) => value ? <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap break-words">{value}</dd></div> : null)}</dl>}

      {event.validate && <section className="space-y-3">
        <Button asChild variant="outline" className="w-full"><Link href={`/eventos/${event.id}`}>Abrir página do evento<ExternalLink className="h-4 w-4" aria-hidden="true" /></Link></Button>
        <Button type="button" variant="ghost" className="w-full" aria-expanded={showParticipantActions} onClick={() => setShowParticipantActions(value => !value)}>{showParticipantActions ? "Ocultar ações de participante" : "Mostrar ações de participante"}</Button>
        {showParticipantActions && <EventPublicActions eventId={event.id} ticketUrl={event.linkParaCompra} stickyBar={false} />}
      </section>}
    </div>
  </div>;
}

export function AdminReviewDetail({ event, now, position, total, busy, error, success, onStep, onPublish, onRequestCorrection, onDelete }: AdminReviewDetailProps) {
  const reduced = useReducedMotion();
  const scroller = useRef<HTMLDivElement>(null);
  const pending = effectiveStatus(event) === "PENDING";
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [event.id]);

  return <div className="relative flex h-full min-h-0 flex-col">
    <div className="flex items-center justify-between gap-2 border-b border-border py-1 pl-4 pr-14 lg:pr-2">
      <p className="text-xs font-semibold tabular-nums text-muted-foreground"><span className="text-foreground">{position}</span> de {total}</p>
      <div className="flex items-center">
        <Button type="button" variant="ghost" size="icon" aria-label="Evento anterior" disabled={total < 2} onClick={() => onStep(-1)}><ChevronUp className="h-4 w-4" aria-hidden="true" /></Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Próximo evento" disabled={total < 2} onClick={() => onStep(1)}><ChevronDown className="h-4 w-4" aria-hidden="true" /></Button>
      </div>
    </div>

    <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
      <AnimatePresence initial={false} mode="popLayout">
        <m.div key={event.id} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transition: { duration: 0.14 } }} transition={{ duration: 0.26, ease: reviewEase }}>
          <ReviewBody event={event} now={now} />
        </m.div>
      </AnimatePresence>
    </div>

    <div className="sticky bottom-0 z-10 border-t border-border bg-card/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-sheet)] backdrop-blur">
      {error && <p role="alert" className="mb-2 text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        {pending && <Button type="button" variant="cta" className="min-w-0 flex-1 font-semibold transition-transform active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none" disabled={busy} onClick={() => onPublish(event)}><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{busy && !success ? "Publicando..." : "Publicar"}</Button>}
        {pending && <Button type="button" variant="outline" className="min-w-0 flex-1 transition-transform active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none" disabled={busy} onClick={() => onRequestCorrection(event)}><Flag className="h-4 w-4" aria-hidden="true" />Pedir correção</Button>}
        {!pending && <p className="min-w-0 flex-1 text-sm text-muted-foreground">Sem decisão pendente.</p>}
        <Button type="button" variant="ghost" size="icon" className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy} aria-label={`Excluir ${event.nome}`} title="Excluir evento" onClick={() => onDelete(event)}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
      </div>
    </div>

    <AnimatePresence>
      {success && <m.div data-review-success initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transition: { duration: 0.16 } }} className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-card/85 p-6 text-center backdrop-blur-sm">
        <m.span initial={reduced ? false : { scale: 0.55, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={reviewSpring} className="flex size-16 items-center justify-center rounded-full bg-cta text-cta-foreground shadow-[0_12px_28px_-10px_hsl(var(--cta))]"><Check className="h-8 w-8" strokeWidth={2.75} aria-hidden="true" /></m.span>
        <p className="text-lg font-semibold tracking-tight">{success.label}</p>
        <p className="max-w-full truncate text-sm text-muted-foreground">{success.nextName ? `Próximo: ${success.nextName}` : "Último pendente desta lista"}</p>
      </m.div>}
    </AnimatePresence>
  </div>;
}
