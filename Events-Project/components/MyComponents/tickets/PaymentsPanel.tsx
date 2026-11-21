"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import { AlertCircle, CheckCircle2, Link2, Loader2, Unlink, Wallet } from "lucide-react";
import { disconnectMercadoPago, getPaymentsOverview, refundTicketOrder, startMercadoPagoConnect } from "@/app/(actions)/tickets/action";
import type { PaymentsOverview, SellerOrderView } from "@/lib/services/tickets";
import { TICKET_FEE_PERCENT, formatTicketAmount, ticketFeeCents, ticketNetCents, ticketStatusLabels } from "@/lib/tickets";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import TicketCoupons from "./TicketCoupons";

const notify = (text: string, type: "success" | "error" | "info") => { if (text) toast(text, { type, toastId: `payments:${text}` }); };
const connectMessages: Record<string, { text: string; type: "success" | "error" | "info" }> = {
  connected: { text: "Mercado Pago conectado. Agora você pode vender ingressos nos seus eventos pagos.", type: "success" },
  denied: { text: "A conexão foi cancelada no Mercado Pago. Nada foi alterado.", type: "info" },
  invalid: { text: "Não foi possível validar a conexão. Entre na mesma conta e tente de novo.", type: "error" },
  error: { text: "O Mercado Pago não confirmou a conexão agora. Tente novamente em alguns minutos.", type: "error" },
  unavailable: { text: "Os pagamentos ainda não foram configurados no EventMap.", type: "info" },
  account_mismatch: { text: "Essa é outra conta do Mercado Pago. Enquanto houver Pix em andamento ou ingressos pagos, reconecte a mesma conta usada nas vendas.", type: "error" },
};
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const exampleCents = 5000;

export default function PaymentsPanel({ connectStatus }: { connectStatus?: string }) {
  const [overview, setOverview] = useState<PaymentsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<"connect" | "disconnect" | "refund" | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [refundTarget, setRefundTarget] = useState<(SellerOrderView & { eventName: string }) | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getPaymentsOverview();
      if (!result.success) throw new Error(result.message);
      setOverview(result.data);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const message = connectStatus ? connectMessages[connectStatus] : undefined;
    if (!message) return;
    notify(message.text, message.type);
    // Keep the URL clean so a refresh does not repeat the notice.
    window.history.replaceState(window.history.state, "", "/myEvents/pagamentos");
  }, [connectStatus]);

  async function connect() {
    setBusy("connect");
    try {
      const result = await startMercadoPagoConnect();
      if (!result.success) { notify(result.message, "error"); setBusy(null); return; }
      window.location.assign(result.data.url);
    } catch {
      notify("Não foi possível iniciar a conexão. Tente novamente.", "error");
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    try {
      const result = await disconnectMercadoPago();
      notify(result.message, result.success ? "success" : "error");
      if (result.success) { setConfirmDisconnect(false); await load(); }
    } catch {
      notify("Não foi possível desconectar agora. Tente novamente.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function refund() {
    if (!refundTarget) return;
    setBusy("refund");
    try {
      const result = await refundTicketOrder({ orderId: refundTarget.id });
      notify(result.message, result.success ? "success" : "error");
      if (result.success) { setRefundTarget(null); await load(); }
    } catch {
      notify("Não foi possível estornar agora. Tente novamente.", "error");
    } finally {
      setBusy(null);
    }
  }

  return <div className="w-full min-w-0 px-4 py-8 sm:px-6 lg:px-10">
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <Link href="/myEvents" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">← Meus eventos</Link>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Pagamentos</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">Venda ingressos por Pix nos seus eventos pagos. O dinheiro cai direto na sua conta do Mercado Pago e o ingresso é confirmado sozinho.</p>
      </header>

      {loading && !overview ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />Carregando pagamentos...</p>
        : failed && !overview ? <div role="alert" className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5"><p className="text-sm">Não foi possível carregar seus pagamentos agora.</p><Button type="button" variant="outline" onClick={() => void load()}>Tentar novamente</Button></div>
          : overview && <>
            <section aria-labelledby="mp-account-title" className="rounded-2xl border bg-card p-5 shadow-surface sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-brand"><Wallet className="size-5" aria-hidden="true" /></span>
                  <div className="min-w-0">
                    <h2 id="mp-account-title" className="text-xl font-semibold">Conta do Mercado Pago</h2>
                    {!overview.configured ? <p className="mt-1 text-sm text-muted-foreground">Pagamentos ainda não configurados no EventMap. Assim que forem ativados, você poderá conectar sua conta aqui.</p>
                      : overview.account?.needsReconnect ? <p role="alert" className="mt-1 flex items-start gap-1.5 text-sm text-amber-800 dark:text-amber-300"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />Reconecte sua conta: o Mercado Pago encerrou a autorização do EventMap. Até lá, as vendas e os estornos ficam pausados.</p>
                      : overview.account ? <p className="mt-1 flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />Conectada em {dateTime.format(new Date(overview.account.connectedAt))}</p>
                        : <p className="mt-1 text-sm text-muted-foreground">Conecte a conta que vai receber o dinheiro dos ingressos. Você autoriza no próprio site do Mercado Pago; o EventMap nunca vê sua senha.</p>}
                  </div>
                </div>
                {overview.configured && (overview.account?.needsReconnect
                  ? <Button type="button" onClick={() => void connect()} disabled={busy !== null}>{busy === "connect" ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Link2 className="size-4" aria-hidden="true" />}Reconectar Mercado Pago</Button>
                  : overview.account
                  ? <Button type="button" variant="outline" onClick={() => setConfirmDisconnect(true)} disabled={busy !== null}><Unlink className="size-4" aria-hidden="true" />Desconectar</Button>
                  : <Button type="button" onClick={() => void connect()} disabled={busy !== null}>{busy === "connect" ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Link2 className="size-4" aria-hidden="true" />}Conectar Mercado Pago</Button>)}
              </div>
              <div className="mt-5 border-t pt-5">
                <h3 className="text-sm font-semibold">Como funciona a taxa de {TICKET_FEE_PERCENT}%</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">Quem compra paga o preço anunciado. Na hora do Pix, o Mercado Pago divide o valor: {100 - TICKET_FEE_PERCENT}% vai para a sua conta e {TICKET_FEE_PERCENT}% fica com o EventMap. O Mercado Pago também desconta do seu valor a tarifa do Pix.</p>
                <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <div><dt className="text-muted-foreground">Ingresso</dt><dd className="font-semibold tabular-nums">{formatTicketAmount(exampleCents)}</dd></div>
                  <div><dt className="text-muted-foreground">Taxa EventMap</dt><dd className="font-semibold tabular-nums">−{formatTicketAmount(ticketFeeCents(exampleCents))}</dd></div>
                  <div><dt className="text-muted-foreground">Você recebe</dt><dd className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{formatTicketAmount(ticketNetCents(exampleCents))}</dd></div>
                </dl>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">Para ativar a venda, abra um evento pago em Meus eventos e marque &quot;Vender ingressos pelo EventMap&quot;. Cupons de desconto ficam em cada evento abaixo e na página do evento (botão Cupons de desconto). Reembolsos são feitos aqui e devolvem o valor integral a quem comprou. <Link href="/termos#ingressos" className="font-medium text-brand underline-offset-4 hover:underline">Regras de venda</Link></p>
              </div>
            </section>

            <section aria-labelledby="sales-title" className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <h2 id="sales-title" className="text-xl font-semibold">Vendas</h2>
                {overview.totals.sold > 0 && <p className="text-sm text-muted-foreground"><span className="font-semibold text-foreground tabular-nums">{overview.totals.sold}</span> {overview.totals.sold === 1 ? "ingresso pago" : "ingressos pagos"} · você recebe <span className="font-semibold text-foreground tabular-nums">{formatTicketAmount(overview.totals.netCents)}</span></p>}
              </div>
              {overview.events.length === 0 ? <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum ingresso vendido ainda. As vendas aparecem aqui assim que o primeiro Pix for confirmado.</p>
                : <ul className="space-y-4">{overview.events.map((event) => <li key={event.eventId} className="rounded-2xl border bg-card p-5 shadow-surface">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="min-w-0 break-words font-semibold"><Link href={`/eventos/${encodeURIComponent(event.eventId)}`} className="hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{event.eventName}</Link></h3>
                    <div className="flex flex-wrap items-center gap-2">{event.refunded > 0 && <span className="text-xs text-muted-foreground">{event.refunded} {event.refunded === 1 ? "estornado" : "estornados"}</span>}<TicketCoupons eventId={event.eventId} eventName={event.eventName} /></div>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div><dt className="text-muted-foreground">Vendidos</dt><dd className="text-lg font-semibold tabular-nums">{event.sold}</dd></div>
                    <div><dt className="text-muted-foreground">Bruto</dt><dd className="text-lg font-semibold tabular-nums">{formatTicketAmount(event.grossCents)}</dd></div>
                    <div><dt className="text-muted-foreground">Taxa ({TICKET_FEE_PERCENT}%)</dt><dd className="text-lg font-semibold tabular-nums">{formatTicketAmount(event.feeCents)}</dd></div>
                    <div><dt className="text-muted-foreground">Líquido</dt><dd className="text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{formatTicketAmount(event.netCents)}</dd></div>
                  </dl>
                  <details className="mt-4 border-t pt-3">
                    <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-brand">Ver compradores ({event.orders.length})</summary>
                    <ul className="divide-y">{event.orders.map((order) => <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="break-words font-medium">{order.buyerName}</p>
                        <p className="text-xs text-muted-foreground"><span className="font-mono">{order.code}</span> · {formatTicketAmount(order.unitCents)}{order.paidAt ? ` · pago em ${dateTime.format(new Date(order.paidAt))}` : ""}</p>
                      </div>
                      {order.status === "PAID"
                        ? <Button type="button" size="sm" variant="outline" onClick={() => setRefundTarget({ ...order, eventName: event.eventName })} disabled={busy !== null}>Estornar</Button>
                        : <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{ticketStatusLabels[order.status]}</span>}
                    </li>)}</ul>
                  </details>
                </li>)}</ul>}
            </section>
          </>}
    </div>

    <Dialog open={confirmDisconnect} onOpenChange={(open) => { if (!open && busy !== "disconnect") setConfirmDisconnect(false); }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-6">Desconectar o Mercado Pago?</DialogTitle>
          <DialogDescription>As vendas pelo EventMap serão pausadas em todos os seus eventos. Ingressos já vendidos continuam válidos; para estornar depois de desconectar, use o painel do Mercado Pago.</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => setConfirmDisconnect(false)} disabled={busy === "disconnect"}>Manter conectado</Button>
          <Button type="button" variant="destructive" onClick={() => void disconnect()} disabled={busy === "disconnect"}>{busy === "disconnect" && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}Desconectar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={refundTarget !== null} onOpenChange={(open) => { if (!open && busy !== "refund") setRefundTarget(null); }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6"><AlertCircle className="size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />Estornar este ingresso?</DialogTitle>
          <DialogDescription>{refundTarget ? `${refundTarget.buyerName} recebe ${formatTicketAmount(refundTarget.unitCents)} de volta pelo Mercado Pago e o ingresso de ${refundTarget.eventName} deixa de valer. A taxa do EventMap também é devolvida. Esta ação não pode ser desfeita.` : ""}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => setRefundTarget(null)} disabled={busy === "refund"}>Voltar</Button>
          <Button type="button" variant="destructive" onClick={() => void refund()} disabled={busy === "refund"}>{busy === "refund" && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}Estornar ingresso</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
