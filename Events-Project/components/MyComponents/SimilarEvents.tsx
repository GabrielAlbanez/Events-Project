import Link from "next/link";
import { CalendarDays, MapPin, Sparkles } from "lucide-react";
import type { RecommendedEvent } from "@/lib/eventRecommendations";
import { eventInstant } from "@/lib/eventTime";

function formatStart(event: RecommendedEvent["event"]): string {
  const start = eventInstant(event.dataInicio, event.startTime, event.timezone ?? undefined);
  if (!start) return "Data a confirmar";
  const timeZone = event.timezone || "America/Sao_Paulo";
  const day = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone }).format(start);
  return event.startTime ? `${day} às ${event.startTime}` : day;
}

function formatPrice(event: RecommendedEvent["event"]): string {
  if (event.isFree) return "Entrada gratuita";
  return typeof event.priceCents === "number" && event.priceCents > 0
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(event.priceCents / 100)
    : "Consulte ingressos";
}

/**
 * Presentational "Eventos parecidos" block for the event page. Renders nothing without items,
 * so the page never shows an empty or invented section. Works as a Server Component.
 */
export function SimilarEvents({ items, title = "Eventos parecidos" }: { items: RecommendedEvent[]; title?: string }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="similar-events-title" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-1 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
        <div className="min-w-0">
          <h2 id="similar-events-title" className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Próximos eventos ligados a este pela categoria, pelo organizador, pela distância ou por quem também salvou. Cada cartão mostra o motivo.</p>
        </div>
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {items.map(({ event, reason }) => (
          <li key={event.id} className="min-w-0">
            <Link href={"/eventos/" + encodeURIComponent(event.id)} className="flex h-full min-w-0 flex-col rounded-xl border border-border p-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
              <p className="text-xs font-medium leading-5 text-brand">{reason}</p>
              <h3 className="mt-2 line-clamp-2 break-words font-semibold leading-6">{event.nome}</h3>
              <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />{formatStart(event)}</p>
              <p className="mt-1 flex items-start gap-2 text-sm text-muted-foreground"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span className="line-clamp-2 break-words">{event.endereco || "Local a confirmar"}</span></p>
              <p className="mt-3 text-sm font-medium">{formatPrice(event)}</p>
              <span className="mt-auto inline-flex min-h-11 items-end pt-3 text-sm font-semibold text-brand">Ver detalhes</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
