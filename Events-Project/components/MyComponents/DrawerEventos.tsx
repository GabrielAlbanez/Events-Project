"use client";
import { useEffect, useId, useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerBody, DrawerFooter, Button } from "@heroui/react";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import { CalendarDays, Check, Copy, ExternalLink, MapPin, Navigation, Ticket, X } from "lucide-react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { parseEventDate } from "@/lib/discoveryPeriod";
import { googleCalendarLink } from "@/lib/googleCalendarLink";
import { FadeInView } from "@/components/animations/FadeInView";
import { animationConfig } from "@/components/animations/config";
import { EventStatusBadge } from "@/components/ui/status-badge";
import type { Evento } from "@/types";
import EventPublicActions from "./EventPublicActions";
import { EventDateBlock } from "./EventDateBlock";
import { EventArtwork } from "./EventArtwork";

/** Full event from the map plus resolved coordinates; `intialDate`/`finishDate` kept for backward compatibility. */
type DrawerEvento = Evento & { lat: number; lng: number; intialDate?: string; finishDate?: string };
type Props = { evento: DrawerEvento; onClose: () => void; onTraceRoute: () => void; isRouteTracing: boolean };
type WhenLabel = { primary: string; secondary: string | null };

const DESCRIPTION_LIMIT = 280;
const DEFAULT_TIMEZONE = "America/Sao_Paulo";
const COPIED_MESSAGE = "Endereço copiado.";
const longDay = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });
const longDayYear = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortDay = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short" });
const shortDayYear = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1);

/** `YYYY-MM-DD` is read as a local calendar day (parseEventDate), so there is no UTC off-by-one. */
function describeWhen(start: string, end: string, startTime?: string | null, endTime?: string | null, timezone?: string): WhenLabel {
  const startDate = parseEventDate(start);
  if (!startDate) return { primary: "Data a confirmar", secondary: null };
  const endDate = end && end !== start ? parseEventDate(end) : null;
  const thisYear = new Date().getFullYear();
  const withYear = startDate.getFullYear() !== thisYear || (endDate !== null && endDate.getFullYear() !== thisYear);
  const zone = timezone && timezone !== DEFAULT_TIMEZONE ? `Fuso ${timezone}` : null;
  const join = (hours: string | null) => [hours, zone].filter(Boolean).join(" · ") || null;
  if (!endDate) {
    const day = capitalize((withYear ? longDayYear : longDay).format(startDate));
    const until = endTime ? (startTime ? `Termina às ${endTime}` : `Até ${endTime}`) : null;
    return { primary: startTime ? `${day} · ${startTime}` : day, secondary: join(until) };
  }
  const format = withYear ? shortDayYear : shortDay;
  const hours = startTime ? `Começa às ${startTime}${endTime ? ` e termina às ${endTime}` : ""}` : endTime ? `Termina às ${endTime}` : null;
  return { primary: `${capitalize(format.format(startDate))} a ${format.format(endDate)}`, secondary: join(hours) };
}

function formatPrice(isFree: boolean | undefined, priceCents: number | undefined): string {
  if (isFree) return "Gratuito";
  return priceCents != null && priceCents > 0 ? currency.format(priceCents / 100) : "Consulte os ingressos";
}

export default function DrawerEventos({ evento, onClose, onTraceRoute, isRouteTracing }: Props) {
  const desktop = useMediaQuery('(min-width: 768px)');
  const reduceMotion = useReducedMotion();
  const descriptionId = useId();
  const galleryTitleId = useId();
  // Keyed by event so switching markers while the drawer is open resets these UI states.
  const eventKey = evento.id || evento.nome;
  const [failedBanner, setFailedBanner] = useState<string | null>(null);
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    if (!copyStatus) return;
    const timer = window.setTimeout(() => setCopyStatus(""), 4000);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);
  useEffect(() => { setCopyStatus(""); }, [eventKey]);

  const startDate = evento.dataInicio || evento.intialDate || "";
  const endDate = evento.dataFim || evento.finishDate || startDate;
  const when = describeWhen(startDate, endDate, evento.startTime, evento.endTime, evento.timezone);
  const status = evento.status;
  const closed = status === "CANCELLED" || status === "ENDED";
  const priceLabel = formatPrice(evento.isFree, evento.priceCents);
  const address = evento.endereco?.trim() ?? "";
  const hasCoordinates = Number.isFinite(evento.lat) && Number.isFinite(evento.lng);
  const mapsQuery = hasCoordinates ? `${evento.lat},${evento.lng}` : address;
  const mapsUrl = mapsQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}` : null;
  const showBanner = Boolean(evento.banner) && failedBanner !== evento.banner;
  const description = evento.descricao?.trim() ?? "";
  const longDescription = description.length > DESCRIPTION_LIMIT || description.split("\n").length > 4;
  const expanded = expandedFor === eventKey;
  const organizer = evento.organizerName?.trim() || evento.user?.name?.trim() || "";
  const gallery = (evento.carrossel ?? []).filter(Boolean);
  const eventHref = evento.id ? '/eventos/' + encodeURIComponent(evento.id) : null;
  // Template link computed locally (no Google API or credentials); only while the event is open.
  const googleCalendarUrl = eventHref && !closed && typeof window !== "undefined"
    ? googleCalendarLink({ nome: evento.nome, descricao: evento.descricao, endereco: evento.endereco, dataInicio: startDate, dataFim: endDate, startTime: evento.startTime, endTime: evento.endTime, timezone: evento.timezone, status }, new URL(eventHref, window.location.origin).href)
    : null;

  async function copyAddress() {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(address);
      setCopyStatus(COPIED_MESSAGE);
    } catch {
      setCopyStatus("Não foi possível copiar. Selecione o endereço e copie manualmente.");
    }
  }

  const factRow = "flex gap-3 p-4";
  const factIcon = "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-brand";
  const factLabel = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";
  const inlineAction = "em-motion-press inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
  const step = animationConfig.staggerStep;

  return <Drawer
    isOpen={Boolean(evento)}
    onOpenChange={open => { if (!open) onClose(); }}
    placement={desktop ? 'right' : 'bottom'}
    size="lg"
    backdrop="opaque"
    hideCloseButton
    disableAnimation={reduceMotion === true}
    classNames={{ base: `overflow-hidden bg-card text-card-foreground ${desktop ? "" : "max-h-[88dvh] rounded-t-3xl"}` }}
  >
    <DrawerContent>{close => <>
      {/* Own close button: HeroUI's default one is labelled in English and sits unreadable over the banner. */}
      <button type="button" onClick={close} aria-label="Fechar detalhes do evento" className="absolute right-3 top-3 z-20 grid h-11 w-11 place-items-center rounded-full border border-border bg-card/90 text-foreground shadow-surface backdrop-blur hover:bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <X aria-hidden="true" className="h-5 w-5" />
      </button>
      <DrawerBody className="min-h-0 gap-0 overflow-y-auto overscroll-contain p-0">
        <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden bg-primary/10">
          {showBanner
            ? <EventArtwork src={evento.banner} onError={() => setFailedBanner(evento.banner)} className="h-full w-full" />
            : <div className="grid h-full w-full place-items-center bg-gradient-to-br from-primary/25 via-primary/10 to-card"><CalendarDays aria-hidden="true" className="h-12 w-12 text-brand" /></div>}
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/25 to-transparent" />
          {/* Decorative: the full date is announced in the facts list below. */}
          <div aria-hidden="true" className="absolute left-4 top-4"><EventDateBlock date={startDate} size="md" /></div>
        </div>
        <div className="space-y-5 px-5 pb-6 pt-5 sm:px-6">
          <FadeInView className="space-y-2" stationary>
            {(evento.category || closed) && <div className="flex flex-wrap items-center gap-2">
              {evento.category && <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-brand">{evento.category}</span>}
              {status && closed && <EventStatusBadge status={status} />}
            </div>}
            <DrawerHeader as="h2" className="block break-words p-0 text-2xl font-bold leading-tight tracking-tight">{evento.nome}</DrawerHeader>
            {organizer && <p className="text-sm text-muted-foreground">Por <span className="font-medium text-foreground">{organizer}</span></p>}
            {status === "CANCELLED" && <p role="status" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm font-semibold text-destructive">Este evento foi cancelado. Confira as orientações do organizador.</p>}
            {status === "ENDED" && <p className="rounded-xl bg-muted p-3 text-sm">Este evento já foi encerrado.</p>}
          </FadeInView>

          <FadeInView delay={step}>
            <dl aria-label="Data, local e valor" className="divide-y divide-border overflow-hidden rounded-2xl border bg-muted/20">
              <div className={factRow}>
                <span aria-hidden="true" className={factIcon}><CalendarDays className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <dt className={factLabel}>Quando</dt>
                  <dd className="mt-0.5 font-semibold">{when.primary}</dd>
                  {when.secondary && <dd className="text-sm text-muted-foreground">{when.secondary}</dd>}
                </div>
              </div>
              {address && <div className={factRow}>
                <span aria-hidden="true" className={factIcon}><MapPin className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <dt className={factLabel}>Onde</dt>
                  <dd className="mt-0.5 break-words font-semibold">{address}</dd>
                  <dd className="mt-2 flex flex-wrap gap-2">
                    {mapsUrl && <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={inlineAction}><ExternalLink aria-hidden="true" className="h-4 w-4" />Abrir no Google Maps<span className="sr-only"> (abre em nova aba)</span></a>}
                    <button type="button" onClick={() => void copyAddress()} className={inlineAction}>{copyStatus === COPIED_MESSAGE ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}Copiar endereço</button>
                  </dd>
                </div>
              </div>}
              <div className={factRow}>
                <span aria-hidden="true" className={factIcon}><Ticket className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <dt className={factLabel}>Valor</dt>
                  <dd className="mt-1">{evento.isFree
                    ? <span className="inline-flex rounded-full border border-cta-foreground/15 bg-cta px-2.5 py-1 text-xs font-semibold text-cta-foreground">Entrada gratuita</span>
                    : <span className="font-semibold">{priceLabel}</span>}</dd>
                </div>
              </div>
            </dl>
            <p role="status" className="mt-2 text-sm text-muted-foreground empty:hidden">{copyStatus}</p>
          </FadeInView>

          {description && <FadeInView delay={step * 2}>
            <section aria-labelledby={descriptionId + "-title"}>
              <h3 id={descriptionId + "-title"} className="mb-2 text-base font-semibold">Sobre o evento</h3>
              <p id={descriptionId} className={`whitespace-pre-wrap break-words leading-7 text-muted-foreground ${longDescription && !expanded ? "line-clamp-4" : ""}`}>{description}</p>
              {longDescription && <button type="button" aria-expanded={expanded} aria-controls={descriptionId} onClick={() => setExpandedFor(expanded ? null : eventKey)} className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{expanded ? "Ler menos" : "Ler mais"}</button>}
            </section>
          </FadeInView>}

          {evento.id && <FadeInView delay={step * 3}>
            <EventPublicActions ownerId={evento.userId} eventId={evento.id} ticketUrl={status === "CANCELLED" ? undefined : evento.linkParaCompra} eventStatus={status} isFree={evento.isFree} priceLabel={priceLabel} googleCalendarUrl={googleCalendarUrl} stickyBar={false} />
          </FadeInView>}

          {gallery.length > 0 && <section aria-labelledby={galleryTitleId}>
            <h3 id={galleryTitleId} className="mb-2 text-base font-semibold">Galeria <span className="font-normal text-muted-foreground">· {gallery.length} {gallery.length === 1 ? "foto" : "fotos"}</span></h3>
            <div role="region" aria-label="Fotos do evento, role para o lado" tabIndex={0} className="-mx-5 overflow-x-auto px-5 pb-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:-mx-6 sm:px-6">
              <ul className="flex snap-x snap-mandatory gap-3">
                {gallery.map((image, index) => <li key={image + index} className="w-40 shrink-0 snap-start sm:w-48">
                  <img src={image} loading="lazy" decoding="async" alt={'Foto ' + (index + 1) + ' de ' + evento.nome} className="aspect-[4/3] w-full rounded-xl bg-muted object-cover" />
                </li>)}
              </ul>
            </div>
          </section>}
        </div>
      </DrawerBody>
      <DrawerFooter className={`grid gap-2 border-t border-border bg-card px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 ${eventHref ? "grid-cols-2" : "grid-cols-1"}`}>
        {eventHref && <Button as={Link} href={eventHref} variant="bordered" className="min-h-11 font-semibold">Ver página completa</Button>}
        <Button onPress={onTraceRoute} color="primary" isDisabled={isRouteTracing} aria-busy={isRouteTracing} startContent={<Navigation aria-hidden="true" className="h-4 w-4" />} className="min-h-11 font-semibold">{isRouteTracing ? "Calculando rota…" : "Traçar rota"}</Button>
      </DrawerFooter>
    </>}</DrawerContent>
  </Drawer>;
}
