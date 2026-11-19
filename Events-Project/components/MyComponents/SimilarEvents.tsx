import Link from "next/link";
import { CalendarDays, Clock, MapPin, Navigation, Sparkles, Tag, UserRound, Users, type LucideIcon } from "lucide-react";
import type { RecommendedEvent } from "@/lib/eventRecommendations";
import { EventDateBlock } from "@/components/MyComponents/EventDateBlock";

function formatPrice(event: RecommendedEvent["event"]): string {
  if (event.isFree) return "Entrada gratuita";
  return typeof event.priceCents === "number" && event.priceCents > 0
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(event.priceCents / 100)
    : "Consulte ingressos";
}

/** Icon for the reason strings produced by `rankSimilarEvents`; unknown reasons fall back to Sparkles. */
function reasonIcon(reason: string): LucideIcon {
  if (/organizador/i.test(reason)) return UserRound;
  if (/^Mesma categoria/i.test(reason)) return Tag;
  if (/^(No mesmo local|A cerca de|Perto de)/i.test(reason)) return Navigation;
  if (/salv/i.test(reason)) return Users;
  return Sparkles;
}

/** Decorative header tile: two four-point stars with a brand-to-CTA gradient. Server-safe; the id is fixed because the section renders once per page. */
function SparkTile() {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/20" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="similar-events-spark" x1="2" y1="22" x2="22" y2="2" gradientUnits="userSpaceOnUse">
            <stop offset="0.35" style={{ stopColor: "hsl(var(--brand))" }} />
            <stop offset="1" style={{ stopColor: "hsl(var(--cta))" }} />
          </linearGradient>
        </defs>
        <path fill="url(#similar-events-spark)" d="M10 3c.5 4.2 2.3 6 6.5 6.5-4.2.5-6 2.3-6.5 6.5-.5-4.2-2.3-6-6.5-6.5C7.7 9 9.5 7.2 10 3Z" />
        <path fill="url(#similar-events-spark)" d="M18 13.5c.3 2.2 1.2 3.1 3.5 3.5-2.3.4-3.2 1.3-3.5 3.5-.3-2.2-1.2-3.1-3.5-3.5 2.3-.4 3.2-1.3 3.5-3.5Z" />
      </svg>
    </span>
  );
}

/**
 * Presentational "Eventos parecidos" block for the event page. Renders nothing without items,
 * so the page never shows an empty or invented section. Works as a Server Component.
 * Mobile shows a scroll-snap carousel; from `sm` it becomes a grid.
 */
export function SimilarEvents({ items, title = "Eventos parecidos" }: { items: RecommendedEvent[]; title?: string }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="similar-events-title" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <SparkTile />
          <div className="min-w-0">
            <h2 id="similar-events-title" className="text-lg font-semibold tracking-tight">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">Selecionados pela categoria, pelo organizador, pela distância ou por quem também salvou.</p>
          </div>
        </div>
        <Link href="/EventsCreated" className="inline-flex min-h-11 items-center rounded-lg text-sm font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">Ver agenda completa <span aria-hidden="true">&nbsp;→</span></Link>
      </div>
      <ul aria-label={title} className="-mx-5 mt-3 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
        {items.map(({ event, reason }) => {
          const ReasonIcon = reasonIcon(reason);
          return (
            <li key={event.id} className="em-motion-lift w-[80%] min-w-0 shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card shadow-surface hover:shadow-highlight sm:w-auto">
              <Link href={"/eventos/" + encodeURIComponent(event.id)} className="group flex h-full min-w-0 flex-col rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <div className="relative aspect-[16/10] shrink-0 overflow-hidden bg-primary/10">
                  {event.banner
                    ? <img src={event.banner} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out motion-safe:group-focus-visible:scale-[1.04] [@media(hover:hover)_and_(pointer:fine)]:motion-safe:group-hover:scale-[1.04]" />
                    : <div className="flex h-full items-center justify-center text-brand/70"><CalendarDays className="h-10 w-10" aria-hidden="true" /></div>}
                  <EventDateBlock date={event.dataInicio} size="sm" className="absolute left-3 top-3" />
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <p className="inline-flex max-w-full items-center gap-1.5 self-start rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium leading-4 text-brand">
                    <ReasonIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="line-clamp-1 break-words">{reason}</span>
                  </p>
                  <h3 className="line-clamp-2 min-h-12 break-words font-semibold leading-6">{event.nome}</h3>
                  <p className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4 shrink-0" aria-hidden="true" />{event.startTime ? "Às " + event.startTime : "Horário a confirmar"}</p>
                  <p className="flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="line-clamp-1 break-words">{event.endereco || "Local a confirmar"}</span></p>
                  <div className="mt-auto flex min-h-11 flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    {event.isFree
                      ? <span className="inline-flex rounded-full border border-cta-foreground/15 bg-cta px-2.5 py-1 text-xs font-semibold text-cta-foreground">{formatPrice(event)}</span>
                      : <span className="text-sm font-medium">{formatPrice(event)}</span>}
                    <span className="text-sm font-semibold text-brand group-hover:underline">Ver evento <span aria-hidden="true">→</span></span>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
