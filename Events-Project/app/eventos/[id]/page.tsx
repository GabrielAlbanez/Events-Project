import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { CalendarDays, MapPin, Ticket } from "lucide-react";
import { eventInstant } from "@/lib/eventTime";
import { parseEventDate } from "@/lib/discoveryPeriod";
import { publicSiteUrl } from "@/lib/publicUrl";
import { getPublicEvent } from "@/lib/eventQueries";
import { authOptions } from "@/lib/auth/options";
import prisma from "@/lib/prisma";
import { googleCalendarLink } from "@/lib/googleCalendarLink";
import EventPublicActions from "@/components/MyComponents/EventPublicActions";
import { FadeInView } from "@/components/animations/FadeInView";
import { StaggerList } from "@/components/animations/StaggerList";
import { ProfileAvatar } from "@/components/MyComponents/ProfileAvatar";
import { EventStatusBadge } from "@/components/ui/status-badge";
import ClaimEventCta from "@/components/MyComponents/organizer/ClaimEventCta";
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
  const image = event.banner ? absoluteUrl(event.banner) : undefined;
  return { metadataBase: siteBase(), title: event.nome, description: event.descricao.slice(0,160), alternates: { canonical }, openGraph: { url: canonical, title: event.nome, description: event.descricao.slice(0,160), ...(image ? { images: [{ url: image }] } : {}) } };
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
export default async function PublicEvent({ params }: Props) {
  const event = await getPublicEvent(params.id);
  if (!event) notFound();
  const [role, session] = await Promise.all([publisherRole(event.userId), getServerSession(authOptions).catch(() => null)]);
  const viewerId = session?.user?.id ?? null;
  // Events held by the platform account (admin imports) can be claimed by their real organizer.
  const showClaim = role === "ADMIN" && viewerId !== event.userId;
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
  const fact = "min-w-0 rounded-2xl border bg-background/60 p-4";
  const factLabel = "flex items-center gap-2 text-sm text-muted-foreground";
  const factIcon = "h-4 w-4 shrink-0 text-brand";
  // The layout owns the single main landmark (#conteudo) and the footer, which reserves room for the mobile CTA bar.
  return <div className="w-full min-w-0 px-4 pb-10 pt-6 sm:px-6 lg:px-10"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g,'\\u003c') }} /><div className="mx-auto max-w-6xl space-y-6"><div className="flex items-center gap-3"><Link href="/EventsCreated" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">← Voltar à agenda</Link></div><article aria-labelledby="event-title" className="overflow-hidden rounded-3xl border bg-card shadow-sm">{event.banner && <div className="aspect-[16/7] max-h-[460px] overflow-hidden bg-muted"><img src={event.banner} alt="" fetchPriority="high" className="h-full w-full object-cover" /></div>}<div className="space-y-6 p-5 sm:p-8"><FadeInView>{event.status === "CANCELLED" && <p role="status" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 font-semibold text-destructive">Este evento foi cancelado. Confira as orientações do organizador.</p>}{event.status === "ENDED" && <p className="mb-4 rounded-xl bg-muted p-4">Este evento já foi encerrado.</p>}<div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-brand">{event.category || 'Evento'}</p>{event.status && event.status !== "PUBLISHED" && <EventStatusBadge status={event.status} />}</div><h1 id="event-title" className="mt-2 break-words text-3xl font-bold tracking-tight sm:text-4xl">{event.nome}</h1></FadeInView><dl aria-label="Data, local e valor" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><div className={fact}><dt className={factLabel}><CalendarDays aria-hidden="true" className={factIcon} />Quando</dt><dd className="mt-1 font-semibold">{dateLabel}</dd>{timeLabel && <dd className="text-sm text-muted-foreground">{timeLabel}{event.timezone ? ` · fuso ${event.timezone}` : ""}</dd>}</div><div className={fact}><dt className={factLabel}><MapPin aria-hidden="true" className={factIcon} />Onde</dt><dd className="mt-1 break-words font-semibold">{event.endereco}</dd><dd><a href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(event.endereco)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Abrir no Google Maps ↗<span className="sr-only"> (abre em nova aba)</span></a></dd></div><div className={`${fact} sm:col-span-2 lg:col-span-1`}><dt className={factLabel}><Ticket aria-hidden="true" className={factIcon} />Valor</dt><dd className="mt-1 font-semibold">{priceLabel}</dd></div></dl><div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_340px]"><aside aria-label="Participação e ações do evento" className="min-w-0 space-y-5 rounded-2xl border bg-muted/10 p-4 xl:order-2 xl:sticky xl:top-6"><EventPublicActions eventId={event.id} eventStatus={event.status} isFree={event.isFree} priceLabel={priceLabel} googleCalendarUrl={googleCalendarUrl} ticketUrl={event.status === "CANCELLED" ? undefined : event.linkParaCompra} /><nav aria-label="Participar da comunidade" className="space-y-3"><Link href={`/eventos/${event.id}/comunidade`} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-primary/20 bg-muted/20 p-3 hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><span><span className="block font-semibold text-brand">Comunidade do evento</span><span className="mt-1 block text-sm text-muted-foreground">Perguntas, enquetes, programação, filas e achados e perdidos.</span></span><span aria-hidden="true">→</span></Link><Link href={`/eventos/${encodeURIComponent(event.id)}/chat`} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border bg-card p-3 hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><span><span className="block font-semibold">Chat dos participantes</span><span className="mt-1 block text-sm text-muted-foreground">Conheça quem também vai e combine os detalhes. Acesso para participantes confirmados.</span></span><span aria-hidden="true">→</span></Link><Link href={`/eventos/${encodeURIComponent(event.id)}/conexoes`} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-primary/20 bg-muted/20 p-3 hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><span><span className="block font-semibold text-brand">Conexões da festa</span><span className="mt-1 block text-sm text-muted-foreground">Amizade, companhia ou paquera: você decide participar. Conversa só com interesse mútuo.</span></span><span aria-hidden="true">→</span></Link></nav></aside><div className="min-w-0 space-y-8 xl:order-1">{officialSource && <section aria-labelledby="event-source-title" className="rounded-2xl border bg-muted/20 p-5"><h2 id="event-source-title" className="text-lg font-semibold">Fonte do evento</h2><a href={officialSource} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Conferir página oficial ↗</a>{verifiedAt && <p className="mt-1 text-xs leading-5 text-muted-foreground">Dados conferidos em <time dateTime={verifiedAt.toISOString()}>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(verifiedAt)}</time> (horário de Brasília).</p>}<p className="mt-2 text-sm leading-6 text-muted-foreground">Confirme a programação e as condições de participação na fonte oficial antes de ir.</p></section>}<section aria-labelledby="event-about-title"><h2 id="event-about-title" className="mb-3 text-xl font-semibold">Sobre o evento</h2><p className="whitespace-pre-wrap break-words leading-7 text-muted-foreground">{event.descricao}</p></section><section aria-labelledby="event-practical-title"><h2 id="event-practical-title" className="mb-3 text-xl font-semibold">Antes de participar</h2><p className="mb-4 text-sm text-muted-foreground">Informações fornecidas por quem publicou o evento. Em caso de dúvida, confirme as condições com a organização antes de ir.</p><dl className="space-y-4">{[{ label: "Organização responsável", value: event.organizerName }, { label: "Classificação etária", value: event.ageRating }, { label: "Recursos de acessibilidade", value: event.accessibilityInfo }, { label: "Condições de participação", value: event.participationInfo }].map(({ label, value }) => <div key={label}><dt className="font-medium">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words leading-7 text-muted-foreground">{value || "Não informado por quem publicou o evento."}</dd></div>)}</dl></section>{event.carrossel.length > 0 && <section aria-labelledby="event-gallery-title"><h2 id="event-gallery-title" className="mb-3 text-xl font-semibold">Galeria</h2><StaggerList className="grid gap-3 sm:grid-cols-2" itemClassName="overflow-hidden rounded-xl">{event.carrossel.map((image,index) => <img key={image+index} src={image} alt={'Foto '+(index+1)+' de '+event.nome} loading="lazy" className="aspect-video w-full rounded-xl object-cover" />)}</StaggerList></section>}{event.user && <Link href={'/promotores/'+event.user.id} className="flex items-center gap-3 rounded-2xl border p-4 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10"><ProfileAvatar src={event.user.image} name={event.user.name || "Conta publicadora"} size={48} className="h-full w-full rounded-full object-cover" /></div><div><p className="text-xs text-muted-foreground">Publicado no EventMap por</p><p className="font-semibold">{event.user.name || 'Conta publicadora'}</p><p className="text-sm text-brand">Conhecer e seguir →</p></div></Link>}{showClaim && <ClaimEventCta eventId={event.id} eventName={event.nome} />}</div></div></div></article></div></div>;
}
