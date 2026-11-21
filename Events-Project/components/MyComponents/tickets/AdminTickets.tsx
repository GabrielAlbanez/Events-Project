"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import { AlertCircle, Loader2 } from "lucide-react";
import { getAdminTicketOverview, refundTicketOrder } from "@/app/(actions)/tickets/action";
import type { AdminTicketOverview } from "@/lib/services/tickets";
import { TICKET_FEE_PERCENT, formatTicketAmount, ticketStatusLabels } from "@/lib/tickets";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Sale = AdminTicketOverview["recent"][number];
const notify = (text: string, type: "success" | "error") => { if (text) toast(text, { type, toastId: `admin-tickets:${text}` }); };
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/** Platform fee totals and the latest sales; admins may refund on behalf of an organizer. */
export default function AdminTickets() {
  const [data, setData] = useState<AdminTicketOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [target, setTarget] = useState<Sale | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAdminTicketOverview();
      if (!result.success) throw new Error(result.message);
      setData(result.data);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function refund() {
    if (!target) return;
    setBusy(true);
    try {
      const result = await refundTicketOrder({ orderId: target.id });
      notify(result.message, result.success ? "success" : "error");
      if (result.success) { setTarget(null); await load(); }
    } catch {
      notify("Não foi possível estornar agora. Tente novamente.", "error");
    } finally {
      setBusy(false);
    }
  }

  return <div className="w-full min-w-0 px-4 py-8 sm:px-6 lg:px-10">
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Ingressos vendidos</h1>
        <p className="text-sm leading-6 text-muted-foreground sm:text-base">Taxa da plataforma ({TICKET_FEE_PERCENT}%) arrecadada nas vendas por Pix via Mercado Pago.</p>
      </header>
      {loading && !data ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />Carregando...</p>
        : failed && !data ? <div role="alert" className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5"><p className="text-sm">Não foi possível carregar as vendas agora.</p><Button type="button" variant="outline" onClick={() => void load()}>Tentar novamente</Button></div>
          : data && <>
            <dl className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border bg-card p-5 shadow-surface"><dt className="text-sm text-muted-foreground">Taxa arrecadada</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{formatTicketAmount(data.paid.feeCents)}</dd></div>
              <div className="rounded-2xl border bg-card p-5 shadow-surface"><dt className="text-sm text-muted-foreground">Ingressos pagos</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{data.paid.count}</dd><dd className="text-xs text-muted-foreground">Bruto {formatTicketAmount(data.paid.grossCents)}</dd></div>
              <div className="rounded-2xl border bg-card p-5 shadow-surface"><dt className="text-sm text-muted-foreground">Estornados</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{data.refunded.count}</dd><dd className="text-xs text-muted-foreground">Devolvido {formatTicketAmount(data.refunded.grossCents)}</dd></div>
            </dl>
            <section aria-labelledby="recent-sales-title" className="rounded-2xl border bg-card p-5 shadow-surface sm:p-6">
              <h2 id="recent-sales-title" className="text-xl font-semibold">Vendas recentes</h2>
              {data.recent.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nenhuma venda ainda.</p>
                : <ul className="mt-3 divide-y">{data.recent.map((sale) => <li key={sale.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="break-words font-medium"><Link href={`/eventos/${encodeURIComponent(sale.eventId)}`} className="hover:underline">{sale.eventName}</Link></p>
                    <p className="text-xs text-muted-foreground">{sale.buyerName} · organizador {sale.sellerName} · <span className="font-mono">{sale.code}</span> · {formatTicketAmount(sale.unitCents)} (taxa {formatTicketAmount(sale.feeCents)}){sale.paidAt ? ` · ${dateTime.format(new Date(sale.paidAt))}` : ""}</p>
                  </div>
                  {sale.status === "PAID"
                    ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setTarget(sale)}>Estornar</Button>
                    : <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{ticketStatusLabels[sale.status]}</span>}
                </li>)}</ul>}
            </section>
          </>}
    </div>
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open && !busy) setTarget(null); }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6"><AlertCircle className="size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />Estornar este ingresso?</DialogTitle>
          <DialogDescription>{target ? `${target.buyerName} recebe ${formatTicketAmount(target.unitCents)} de volta e o ingresso de ${target.eventName} deixa de valer. O estorno usa a conta do organizador no Mercado Pago e não pode ser desfeito.` : ""}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => setTarget(null)} disabled={busy}>Voltar</Button>
          <Button type="button" variant="destructive" onClick={() => void refund()} disabled={busy}>{busy && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}Estornar ingresso</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
