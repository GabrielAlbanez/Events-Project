import type { Metadata } from "next";
import Link from "next/link";
import { Ban, CheckCircle2, Ticket } from "lucide-react";
import { listMyTickets } from "@/app/(actions)/tickets/action";
import type { MyTicketView } from "@/lib/services/tickets";
import { formatTicketAmount, ticketStatusLabels, type TicketOrderStatusValue } from "@/lib/tickets";
import { parseEventDate } from "@/lib/discoveryPeriod";
import CheckInPass from "@/components/MyComponents/CheckInPass";
import TicketsLiveRefresh from "@/components/MyComponents/tickets/TicketsLiveRefresh";

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

const ticketCount = (quantity: number) => `${quantity} ${quantity === 1 ? "ingresso" : "ingressos"}`;

/** Ticket 1 is the buyer's registration QR; tickets 2..N are passes with their own QR and status. */
function OrderTickets({ ticket }: { ticket: MyTicketView }) {
  const positions = Array.from({ length: ticket.quantity }, (_, index) => index + 1);
  return <ul aria-label={`QR Codes do pedido ${ticket.code}`} className="mt-4 divide-y border-t">{positions.map((position) => {
    const pass = ticket.passes.find((item) => item.position === position);
    const label = `Ingresso ${position} de ${ticket.quantity}`;
    const status = position === 1 ? ticket.ownTicketStatus : pass?.status ?? "CANCELLED";
    return <li key={position} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
      <p className="flex min-h-11 items-center text-sm font-semibold">{label}{position === 1 && ticket.quantity > 1 && <span className="ml-2 text-xs font-normal text-muted-foreground">seu ingresso</span>}</p>
      {status === "USED" ? <p className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300"><CheckCircle2 aria-hidden="true" className="size-4" />Já utilizado na entrada</p>
        : status === "CANCELLED" ? <p className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground"><Ban aria-hidden="true" className="size-4" />Cancelado</p>
          : <CheckInPass eventId={ticket.eventId} passId={pass?.id} label={label} />}
    </li>;
  })}</ul>;
}

/** Refunds go through the organizer (who receives the payment); the 7-day withdrawal right is explained in the Terms. */
function RefundNote({ tickets }: { tickets: MyTicketView[] }) {
  const organizers = Array.from(new Map(tickets.map((ticket) => [ticket.organizerId, ticket.organizerName])).entries());
  return <section aria-labelledby="refund-title" className="rounded-2xl border bg-muted/20 p-5 text-sm leading-6">
    <h2 id="refund-title" className="text-base font-semibold">Precisa de reembolso?</h2>
    <p className="mt-1 text-muted-foreground">Fale com quem organiza o evento: é o organizador quem recebe o pagamento e faz o estorno pelo EventMap, com devolução integral pelo Mercado Pago. Em compras on-line você pode desistir em até 7 dias após a compra (direito de arrependimento, art. 49 do Código de Defesa do Consumidor). <Link href="/termos#ingressos" className="font-medium text-brand underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Regras de venda</Link></p>
    <ul className="mt-3 flex flex-wrap gap-2" aria-label="Organizadores dos seus ingressos">{organizers.map(([id, name]) => <li key={id}><Link href={`/promotores/${encodeURIComponent(id)}`} className="inline-flex min-h-11 items-center rounded-xl border bg-card px-3 font-medium hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{name} <span aria-hidden="true" className="ml-1 text-brand">→</span><span className="sr-only"> (perfil do organizador)</span></Link></li>)}</ul>
  </section>;
}

/** Tickets bought through EventMap. Each paid ticket opens its own entry QR here (CheckInPass). */
export default async function MyTicketsPage() {
  const result = await listMyTickets();
  return <div className="w-full min-w-0 px-4 py-8 sm:px-6 lg:px-10">
    <TicketsLiveRefresh />
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Meus ingressos</h1>
        <p className="text-sm leading-6 text-muted-foreground sm:text-base">Ingressos comprados pelo EventMap. Cada ingresso tem o próprio QR Code para a entrada.</p>
      </header>
      {!result.success ? <p role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm">Não foi possível carregar seus ingressos agora. Atualize a página em alguns instantes.</p>
        : result.data.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center">
          <Ticket className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 font-medium">Você ainda não comprou ingressos pelo EventMap.</p>
          <Link href="/EventsCreated" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Explorar eventos</Link>
        </div>
          : <ul className="space-y-3">{result.data.map((ticket) => <li key={ticket.id}>
            <article className="rounded-2xl border bg-card p-4 shadow-surface sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-words font-semibold"><Link href={`/eventos/${encodeURIComponent(ticket.eventId)}#ticket-title`} className="inline-flex min-h-11 items-center underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{ticket.eventName} <span aria-hidden="true" className="ml-1 text-brand">→</span></Link></h2>
                  <p className="text-sm text-muted-foreground">{eventDate(ticket.dataInicio, ticket.startTime)}</p>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums"><span className="font-mono">{ticket.code}</span> · {ticketCount(ticket.quantity)} · Total <span className="font-semibold text-foreground">{formatTicketAmount(ticket.totalCents)}</span>{ticket.quantity > 1 ? ` (${formatTicketAmount(ticket.unitCents)} cada)` : ""}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone[ticket.status]}`}>{ticketStatusLabels[ticket.status]}</span>
              </div>
              {ticket.status === "PAID" && <OrderTickets ticket={ticket} />}
            </article>
          </li>)}</ul>}
      {result.success && result.data.length > 0 && <RefundNote tickets={result.data} />}
    </div>
  </div>;
}
