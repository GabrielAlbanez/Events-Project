import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { CalendarDays, Inbox, MapPin, Megaphone, Pencil, QrCode, Ticket, Wallet } from "lucide-react";
import { eventInstant } from "@/lib/eventTime";
import { parseEventDate } from "@/lib/discoveryPeriod";
import { publicSiteUrl } from "@/lib/publicUrl";
import { getPublicEvent, publicEventSelect, toPublicEvent } from "@/lib/eventQueries";
import { canPreviewEvent } from "@/lib/eventPreview";
import { isAccountSuspended } from "@/lib/auth/accountAccess";
import { authOptions } from "@/lib/auth/options";
import prisma from "@/lib/prisma";
import type { Evento } from "@/types";
import { googleCalendarLink } from "@/lib/googleCalendarLink";
import EventPublicActions from "@/components/MyComponents/EventPublicActions";
import EventPromoKit from "@/components/MyComponents/promo/EventPromoKit";
import { EventAiSummary } from "@/components/MyComponents/ai/EventAiSummary";
import TicketCoupons from "@/components/MyComponents/tickets/TicketCoupons";
import { isPromotable } from "@/lib/promoKit";
import { FadeInView } from "@/components/animations/FadeInView";
import { StaggerList } from "@/components/animations/StaggerList";
import { HeroReveal } from "@/components/animations/HeroReveal";
import { animationConfig } from "@/components/animations/config";
import { ProfileAvatar } from "@/components/MyComponents/ProfileAvatar";
import { EventStatusBadge } from "@/components/ui/status-badge";
import ClaimEventCta from "@/components/MyComponents/organizer/ClaimEventCta";
import { SimilarEvents } from "@/components/MyComponents/SimilarEvents";
import { EventArtwork } from "@/components/MyComponents/EventArtwork";
import { getSimilarEvents } from "@/lib/services/recommendations";
import { isTicketSaleActive } from "@/lib/services/tickets";
export const dynamic = "force-dynamic";
type Props = { params: { id: string } };
function siteBase(): URL {
  return publicSiteUrl();
}
function formatEventDate(value: string): string {
  const date = parseEventDate(value);
  return date ? new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" }).format(date) : "Data a confirmar";
}
function absoluteUrl(value: string): string | undefined {
  try { const url = new URL(value, siteBase()); return ["http:", "https:"].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}
function formatPrice(isFree: boolean | undefined, priceCents: number | undefined): string {
  if (isFree) return "Gratuito";
  return priceCents != null && priceCents > 0 ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(priceCents / 100) : "Consulte os ingressos";
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await getPublicEvent(params.id);
  if (!event) return { title: "Evento indisponível" };
  const canonical = new URL("/eventos/" + encodeURIComponent(event.id), siteBase()).href;
  const description = event.descricao.slice(0,160);
  // og:image comes from ./opengraph-image.tsx (works with or without a banner); declaring images here would duplicate it.
  return { metadataBase: siteBase(), title: event.nome, description, alternates: { canonical }, openGraph: { url: canonical, title: event.nome, description }, twitter: { card: "summary_large_image", title: event.nome, description } };
}
/** Publisher role for the claim CTA. Failures only hide the CTA; the event page still renders. */
async function publisherRole(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    return user?.role ?? null;
  } catch {
    return null;
  }
}
/** Evento fora do ar (ex.: importado aguardando validação): só admin ativo ou quem criou. Falhas mantêm o 404. */
async function previewEvent(id: string, viewerId: string | null | undefined) {
  if (!viewerId) return null;
  try {
    const [viewer, row] = await Promise.all([
      prisma.user.findUnique({ where: { id: viewerId }, select: { id: true, role: true, suspendedAt: true, suspendedUntil: true } }),
      prisma.events.findUnique({ where: { id }, select: publicEventSelect }),
    ]);
    if (!viewer || !row || !canPreviewEvent({ id: viewer.id, role: viewer.role, suspended: isAccountSuspended(viewer) }, row)) return null;
    return toPublicEvent(row);
  } catch {
    return null;
  }
}
export default async function PublicEvent({ params }: Props) {
  const [publicEvent, session] = await Promise.all([getPublicEvent(params.id), getServerSession(authOptions).catch(() => null)]);
  const event = publicEvent ?? await previewEvent(params.id, session?.user?.id);
  if (!event) notFound();
  const preview = !publicEvent;
  // Similar events are optional: a failure only hides the block.
  const viewerId = session?.user?.id ?? null;
  // Viewer role only matters for the promotion kit (admins); owners and anonymous visitors skip the query.
  const [role, similar, ticketSaleActive, viewerRole] = await Promise.all([publisherRole(event.userId), preview ? Promise.resolve([]) : getSimilarEvents(event.id, 6).catch(() => []), preview ? Promise.resolve(false) : isTicketSaleActive(event.id), viewerId && viewerId !== event.userId && !preview ? publisherRole(viewerId) : Promise.resolve(null)]);
  // EventMap checkout (Pix) replaces the free registration and the external ticket link; hidden when payments are not configured.
  const ticketSale = ticketSaleActive && event.status === "PUBLISHED" ? { priceCents: event.priceCents ?? 0 } : undefined;
  // Events held by the platform account (admin imports) can be claimed by their real organizer.
  const showClaim = !preview && role === "ADMIN" && viewerId !== event.userId;
  // Promotion kit: published events, for the owner or an admin. Everything in it is already public.
  const canPromote = !preview && isPromotable(event.status) && Boolean(viewerId) && (viewerId === event.userId || viewerRole === "ADMIN");
  // Discount coupons: only the owner of an event that sells tickets through EventMap (the server checks ownership again).
  const canManageCoupons = Boolean(ticketSale) && Boolean(viewerId) && viewerId === event.userId;
  const viewerIsOwner = Boolean(viewerId) && viewerId === event.userId;
  // Optional context: if the count fails, the link to the requests stays available without a number.
  const pendingRequests = viewerIsOwner && event.status === "PUBLISHED" && !event.aiImport ? await prisma.eventRegistration.count({ where: { eventId: event.id, status: "PENDING" } }).catch(() => null) : null;
  const ownerPanel = viewerIsOwner ? <OwnerEventPanel event={event} pendingRequests={pendingRequests} /> : null;
  const officialSource = event.aiImport?.sourceUrl.startsWith("https://") ? absoluteUrl(event.aiImport.sourceUrl) : undefined;
  const verification = event.aiImport?.sourceVerifiedAt;
  const verifiedDate = verification instanceof Date ? verification : verification ? new Date(verification) : null;
  const verifiedAt = verifiedDate && Number.isFinite(verifiedDate.getTime()) ? verifiedDate : null;
  const canonical = new URL("/eventos/" + encodeURIComponent(event.id), siteBase()).href;
  const priceLabel = formatPrice(event.isFree, event.priceCents);
  const registrationOpen = event.status !== "CANCELLED" && event.status !== "ENDED";
  // Template link computed locally: no Google API or credentials involved.
  const googleCalendarUrl = registrationOpen ? googleCalendarLink({ nome: event.nome, descricao: event.descricao, endereco: event.endereco, dataInicio: event.dataInicio, dataFim: event.dataFim, startTime: event.startTime, endTime: event.endTime, timezone: event.timezone, status: event.status }, canonical) : null;
  const dateLabel = `${formatEventDate(event.dataInicio)}${event.dataFim !== event.dataInicio ? " a " + formatEventDate(event.dataFim) : ""}`;
  const timeLabel = event.startTime ? `${event.startTime}${event.endTime ? " às " + event.endTime : ""}` : event.endTime ? "Até " + event.endTime : null;
  const structured = { '@context': 'https://schema.org', '@type': 'Event', name: event.nome, description: event.descricao, startDate: event.startTime ? eventInstant(event.dataInicio, event.startTime, event.timezone || undefined)?.toISOString() || event.dataInicio : event.dataInicio, endDate: event.endTime ? eventInstant(event.dataFim, event.endTime, event.timezone || undefined)?.toISOString() || event.dataFim : event.dataFim, eventStatus: event.status === 'CANCELLED' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled', location: { '@type': 'Place', name: event.endereco, address: event.endereco }, ...(event.banner && absoluteUrl(event.banner) ? { image: [absoluteUrl(event.banner)] } : {}), ...(event.isFree || (event.priceCents != null && event.priceCents > 0) ? { offers: { '@type': 'Offer', price: event.isFree ? 0 : event.priceCents! / 100, priceCurrency: 'BRL', url: absoluteUrl(event.linkParaCompra) || canonical } } : {}), ...(event.organizerName?.trim() ? { organizer: { '@type': 'Organization', name: event.organizerName.trim() } } : {}) };
  const fact = "min-w-0 rounded-[18px] border border-border/85 bg-background/60 p-4";
  const factLabel = "flex items-center gap-2 text-sm text-muted-foreground";
  const factIcon = "h-4 w-4 shrink-0 text-brand";
  // The layout owns the single main landmark (#conteudo) and the footer, which reserves room for the mobile CTA bar.
  return <div className="em-page w-full min-w-0 px-4 pb-10 pt-6 sm:px-6 lg:px-10" data-decor="ring"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g,'\\u003c') }} /><div className="mx-auto max-w-6xl space-y-6"><div className="flex items-center gap-3"><Link href="/EventsCreated" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">← Voltar à agenda</Link></div><article aria-labelledby="event-title" className="em-surface overflow-hidden rounded-[26px]">{event.banner && <div className="aspect-[4/3] max-h-[460px] w-full overflow-hidden bg-muted sm:aspect-[16/7]"><HeroReveal className="h-full w-full"><EventArtwork src={event.banner} fetchPriority="high" className="h-full w-full" /></HeroReveal></div>}<div className="space-y-6 p-5 sm:p-8"><FadeInView>{preview && <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/50 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"><p><span className="font-semibold">Prévia: este evento ainda não está no ar.</span> Só a administração e quem o criou conseguem ver esta página.</p>{session?.user?.role === "ADMIN" && <Link href="/EventsCreated?importados=pendentes" className="inline-flex min-h-11 items-center font-semibold underline-offset-4 hover:underline">Validar na fila →</Link>}</div>}{event.status === "CANCELLED" && <p role="status" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 font-semibold text-destructive">Este evento foi cancelado. Confira as orientações do organizador.</p>}{event.status === "ENDED" && <p className="mb-4 rounded-xl bg-muted p-4">Este evento já foi encerrado.</p>}<div className="flex flex-wrap items-center gap-2"><p className="em-eyebrow">{event.category || 'Evento'}</p>{event.status && event.status !== "PUBLISHED" && <EventStatusBadge status={event.status} />}</div><h1 id="event-title" className="em-title mt-3 break-words">{event.nome}</h1></FadeInView><FadeInView delay={animationConfig.staggerStep * 2}><dl aria-label="Data, local e valor" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><div className={fact}><dt className={factLabel}><CalendarDays aria-hidden="true" className={factIcon} />Quando</dt><dd className="mt-1 font-semibold">{dateLabel}</dd>{timeLabel && <dd className="text-sm text-muted-foreground">{timeLabel}{event.timezone ? ` · fuso ${event.timezone}` : ""}</dd>}</div><div className={fact}><dt className={factLabel}><MapPin aria-hidden="true" className={factIcon} />Onde</dt><dd className="mt-1 break-words font-semibold">{event.endereco}</dd><dd><a href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(event.endereco)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Abrir no Google Maps ↗<span className="sr-only"> (abre em nova aba)</span></a></dd></div><div className={`${fact} sm:col-span-2 lg:col-span-1`}><dt className={factLabel}><Ticket aria-hidden="true" className={factIcon} />Valor</dt><dd className="mt-1 font-semibold">{priceLabel}</dd></div></dl></FadeInView><div className={preview ? "grid items-start gap-8" : "grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_340px]"}>{preview && ownerPanel}{!preview && <aside aria-label={viewerIsOwner ? "Gestão e ações do evento" : "Participação e ações do evento"} className="min-w-0 space-y-5 xl:order-2 xl:sticky xl:top-6 xl:rounded-[22px] xl:border xl:bg-muted/10 xl:p-4">{ownerPanel}{canPromote && <EventPromoKit event={{ id: event.id, nome: event.nome, dataInicio: event.dataInicio, startTime: event.startTime, endTime: event.endTime, timezone: event.timezone, endereco: event.endereco, isFree: event.isFree, priceCents: event.priceCents, capacity: event.capacity, status: event.status }} siteOrigin={siteBase().origin} triggerLabel="Divulgar evento" triggerClassName="min-h-11 w-full justify-center rounded-full" />}{canManageCoupons && <TicketCoupons eventId={event.id} eventName={event.nome} priceCents={event.priceCents} siteOrigin={siteBase().origin} triggerLabel="Cupons de desconto" triggerClassName="min-h-11 w-full justify-center rounded-full" />}<EventPublicActions eventId={event.id} eventStatus={event.status} isFree={event.isFree} priceLabel={priceLabel} googleCalendarUrl={googleCalendarUrl} ticketUrl={event.status === "CANCELLED" || ticketSale ? undefined : event.linkParaCompra} ticketSale={ticketSale} viewerIsOwner={viewerIsOwner} /><nav aria-label="Participar da comunidade" className="space-y-3"><Link href={`/eventos/${event.id}/comunidade`} className="flex min-h-12 items-center justify-between gap-3 rounded-[18px] border border-primary/20 bg-muted/20 p-3.5 hover:border-primary/40 hover:bg-primary/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><span><span className="block font-semibold text-brand">Comunidade do evento</span><span className="mt-1 block text-sm text-muted-foreground">Perguntas, enquetes, programação, filas e achados e perdidos.</span></span><span aria-hidden="true">→</span></Link><Link href={`/eventos/${encodeURIComponent(event.id)}/chat`} className="flex min-h-12 items-center justify-between gap-3 rounded-[18px] border bg-card p-3.5 hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><span><span className="block font-semibold">Chat dos participantes</span><span className="mt-1 block text-sm text-muted-foreground">Conheça quem também vai e combine os detalhes. Acesso para participantes confirmados.</span></span><span aria-hidden="true">→</span></Link><Link href={`/eventos/${encodeURIComponent(event.id)}/conexoes`} className="flex min-h-12 items-center justify-between gap-3 rounded-[18px] border border-primary/20 bg-muted/20 p-3.5 hover:border-primary/40 hover:bg-primary/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><span><span className="block font-semibold text-brand">Conexões da festa</span><span className="mt-1 block text-sm text-muted-foreground">Amizade, companhia ou paquera: você decide participar. Conversa só com interesse mútuo.</span></span><span aria-hidden="true">→</span></Link></nav></aside>}<StaggerList className="min-w-0 space-y-8 xl:order-1">{officialSource && <section aria-labelledby="event-source-title" className="rounded-[22px] border bg-muted/20 p-5"><h2 id="event-source-title" className="text-lg font-bold tracking-[-0.02em]">Fonte do evento</h2><a href={officialSource} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Conferir página oficial ↗</a>{verifiedAt && <p className="mt-1 text-xs leading-5 text-muted-foreground">Dados conferidos em <time dateTime={verifiedAt.toISOString()}>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(verifiedAt)}</time> (horário de Brasília).</p>}<p className="mt-2 text-sm leading-6 text-muted-foreground">Confirme a programação e as condições de participação na fonte oficial antes de ir.</p></section>}<section aria-labelledby="event-about-title">{event.status === "PUBLISHED" && !preview && <EventAiSummary eventId={event.id} />}<h2 id="event-about-title" className="mb-3 text-[22px] font-bold tracking-[-0.025em]">Sobre o evento</h2><p className="whitespace-pre-wrap break-words leading-7 text-muted-foreground">{event.descricao}</p></section><section aria-labelledby="event-practical-title"><h2 id="event-practical-title" className="mb-3 text-[22px] font-bold tracking-[-0.025em]">Antes de participar</h2><p className="mb-4 text-sm text-muted-foreground">Informações fornecidas por quem publicou o evento. Em caso de dúvida, confirme as condições com a organização antes de ir.</p><dl className="space-y-4">{[{ label: "Organização responsável", value: event.organizerName }, { label: "Classificação etária", value: event.ageRating }, { label: "Recursos de acessibilidade", value: event.accessibilityInfo }, { label: "Condições de participação", value: event.participationInfo }].map(({ label, value }) => <div key={label}><dt className="font-medium">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words leading-7 text-muted-foreground">{value || "Não informado por quem publicou o evento."}</dd></div>)}</dl></section>{event.carrossel.length > 0 && <section aria-labelledby="event-gallery-title"><h2 id="event-gallery-title" className="mb-3 text-[22px] font-bold tracking-[-0.025em]">Galeria</h2><StaggerList className="grid gap-3 sm:grid-cols-2" itemClassName="overflow-hidden rounded-[18px]">{event.carrossel.map((image,index) => <EventArtwork key={image+index} src={image} alt={'Foto '+(index+1)+' de '+event.nome} loading="lazy" className="aspect-video w-full rounded-[18px] bg-muted" />)}</StaggerList></section>}{event.user && <Link href={'/promotores/'+event.user.id} className="flex items-center gap-3 rounded-[22px] border p-4 hover:border-primary/40 hover:bg-primary/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10"><ProfileAvatar src={event.user.image} name={event.user.name || "Conta publicadora"} size={48} className="h-full w-full rounded-full object-cover" /></div><div><p className="text-xs text-muted-foreground">Publicado no EventMap por</p><p className="font-semibold">{event.user.name || 'Conta publicadora'}</p><p className="text-sm text-brand">Conhecer e seguir →</p></div></Link>}{showClaim && <ClaimEventCta eventId={event.id} eventName={event.nome} />}</StaggerList></div></div></article><SimilarEvents items={similar} /></div></div>;
}

function OwnerEventPanel({ event, pendingRequests }: { event: Evento; pendingRequests: number | null }) {
  const id = encodeURIComponent(event.id);
  const published = event.status === "PUBLISHED";
  const editable = event.status !== "CANCELLED" && event.status !== "ENDED";
  const pending = pendingRequests ?? 0;
  const showRequests = published && !event.aiImport && (pending > 0 || event.requiresApproval === true);
  const link = "inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-full border bg-background px-3 py-2 text-center text-sm font-semibold hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";
  const icon = "h-4 w-4 shrink-0";
  return <section aria-labelledby="owner-panel-title" className="rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5">
    <h2 id="owner-panel-title" className="font-semibold">Você organiza este evento</h2>
    <p className="mt-1 text-sm leading-6 text-muted-foreground">Acompanhe e gerencie por aqui. A inscrição e a compra ficam disponíveis apenas para o público.</p>
    <nav aria-label="Gerenciar evento" className="mt-4 grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
      {editable && <Link href={`/eventos/${id}/editar`} className={link}><Pencil aria-hidden="true" className={icon} />Editar</Link>}
      {published && <Link href={`/myEvents/${id}/checkin`} className={link}><QrCode aria-hidden="true" className={icon} />Check-in</Link>}
      {showRequests && <Link href={`/myEvents/${id}/checkin#solicitacoes`} aria-label={pending > 0 ? `Solicitações: ${pending} ${pending === 1 ? "pendente" : "pendentes"}` : "Solicitações"} className={pending > 0 ? `${link} border-amber-500/40 bg-amber-500/10 text-amber-900 hover:bg-amber-500/20 dark:text-amber-200` : link}><Inbox aria-hidden="true" className={icon} />Solicitações{pending > 0 && <span aria-hidden="true" className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-600 px-1.5 text-xs font-bold leading-5 text-white dark:bg-amber-400 dark:text-amber-950">{pending}</span>}</Link>}
      {published && <Link href={`/myEvents/${id}/destaque`} className={link}><Megaphone aria-hidden="true" className={icon} />Destacar</Link>}
      {event.ticketsEnabled && <Link href="/myEvents/pagamentos" className={link}><Wallet aria-hidden="true" className={icon} />Pagamentos</Link>}
    </nav>
  </section>;
}
