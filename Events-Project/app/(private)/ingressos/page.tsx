import type { Metadata } from "next";
import Link from "next/link";
import { Ticket } from "lucide-react";
import { listMyTickets } from "@/app/(actions)/tickets/action";
import { formatTicketAmount, ticketStatusLabels, type TicketOrderStatusValue } from "@/lib/tickets";
import { parseEventDate } from "@/lib/discoveryPeriod";

export const metadata: Metadata = { title: "Meus ingressos" };
export const dynamic = "force-dynamic";

const tone: Record<TicketOrderStatusValue, string> = {
  PAID: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200",
  PENDING: "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200",
  REFUNDED: "bg-muted text-muted-foreground",
  EXPIRED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-muted text-muted-foreground",
};

function eventDate(value: string, time: string | null): string {
  const date = parseEventDate(value);
  if (!date) return "Data a confirmar";
  return `${new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" }).format(date)}${time ? ` · ${time}` : ""}`;
}

/** Tickets bought through EventMap. The entry QR lives on the event page (CheckInPass), so each item links there. */
export default async function MyTicketsPage() {
  const result = await listMyTickets();
  return <div className="w-full min-w-0 px-4 py-8 sm:px-6 lg:px-10">
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Meus ingressos</h1>
        <p className="text-sm leading-6 text-muted-foreground sm:text-base">Ingressos comprados pelo EventMap. Abra o evento para mostrar o QR Code na entrada.</p>
      </header>
      {!result.success ? <p role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm">Não foi possível carregar seus ingressos agora. Atualize a página em alguns instantes.</p>
        : result.data.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center">
          <Ticket className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 font-medium">Você ainda não comprou ingressos pelo EventMap.</p>
          <Link href="/EventsCreated" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Explorar eventos</Link>
        </div>
          : <ul className="space-y-3">{result.data.map((ticket) => <li key={ticket.id}>
            <Link href={`/eventos/${encodeURIComponent(ticket.eventId)}#ticket-title`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4 shadow-surface hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:p-5">
              <span className="min-w-0">
                <span className="block break-words font-semibold">{ticket.eventName}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{eventDate(ticket.dataInicio, ticket.startTime)}</span>
                <span className="mt-1 block text-xs text-muted-foreground"><span className="font-mono">{ticket.code}</span> · {formatTicketAmount(ticket.unitCents)}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone[ticket.status]}`}>{ticketStatusLabels[ticket.status]}</span>
                <span aria-hidden="true" className="text-brand">→</span>
              </span>
            </Link>
          </li>)}</ul>}
    </div>
  </div>;
}
