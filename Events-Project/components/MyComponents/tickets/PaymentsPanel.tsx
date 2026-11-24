"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import { AlertCircle, ArrowRight, CheckCircle2, Download, Link2, Loader2, ReceiptText, Unlink, Wallet } from "lucide-react";
import { disconnectMercadoPago, getPaymentsOverview, refundTicketOrder, startMercadoPagoConnect } from "@/app/(actions)/tickets/action";
import type { PaymentsOverview, SellerOrderView } from "@/lib/services/tickets";
import { TICKET_FEE_PERCENT, formatTicketAmount, ticketFeeCents, ticketNetCents, ticketStatusLabels } from "@/lib/tickets";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MERCADOPAGO_CHANNEL, MERCADOPAGO_CONNECTED_MESSAGE } from "./MercadoPagoConnectCard";
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
const ticketCount = (quantity: number) => `${quantity} ${quantity === 1 ? "ingresso" : "ingressos"}`;
const netNote = "antes da tarifa do Mercado Pago";
const RECENT_ORDERS = 5;
const orderMoment = (order: SellerOrderView) => new Date(order.refundedAt ?? order.paidAt ?? 0).getTime();
const metricClass = "rounded-2xl border bg-card p-4 shadow-surface";
const salesExportError = "Não foi possível exportar as vendas. Tente novamente.";

export default function PaymentsPanel({ connectStatus }: { connectStatus?: string }) {
  const [overview, setOverview] = useState<PaymentsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<"connect" | "disconnect" | "refund" | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [refundTarget, setRefundTarget] = useState<(SellerOrderView & { eventName: string }) | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportingRef = useRef(false);

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
    if (connectStatus === "connected" && typeof BroadcastChannel !== "undefined") {
      // Tells the event form in the other tab to re-check the server; it carries no account data.
      try { const channel = new BroadcastChannel(MERCADOPAGO_CHANNEL); channel.postMessage(MERCADOPAGO_CONNECTED_MESSAGE); channel.close(); } catch { /* the form also re-checks on focus */ }
    }
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

  async function exportSales() {
    if (exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true);
    try {
      const response = await fetch("/api/tickets/sales-export", { cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { message?: string } | null;
        notify(data?.message || salesExportError, "error");
        return;
      }
      // An expired session can be redirected to an HTML page with status 200: never save that as the spreadsheet.
      if (!(response.headers.get("Content-Type") ?? "").toLowerCase().includes("text/csv")) {
        notify("Não foi possível gerar o arquivo. Atualize a página, confira se você está conectado e tente novamente.", "error");
        return;
      }
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "vendas-eventmap.csv";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("Vendas exportadas. Confira o arquivo baixado.", "success");
    } catch (cause) {
      notify(cause instanceof TypeError ? "Sem conexão. Verifique sua internet e tente novamente." : salesExportError, "error");
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  }

  const connectButton = (label: string) => <Button type="button" className="w-full sm:w-auto" onClick={() => void connect()} disabled={busy !== null}>{busy === "connect" ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Link2 className="size-4" aria-hidden="true" />}{label}</Button>;
  const recentOrders = overview ? overview.events.flatMap((event) => event.orders.map((order) => ({ ...order, eventName: event.eventName }))).sort((a, b) => orderMoment(b) - orderMoment(a)).slice(0, RECENT_ORDERS) : [];
  const hasSales = Boolean(overview && (overview.totals.sold > 0 || overview.totals.refunded > 0));

  return <div className="w-full min-w-0 px-4 py-8 sm:px-6 lg:px-10">
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <Link href="/myEvents" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">← Meus eventos</Link>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Pagamentos</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">Conecte o Mercado Pago para vender por Pix e acompanhe aqui as vendas dos seus eventos. Quem compra só escaneia o QR Code ou copia o código Pix.</p>
      </header>

      {connectStatus === "connected" && <p role="status" className="flex items-start gap-2 rounded-2xl border border-emerald-600/30 bg-emerald-500/10 p-4 text-sm leading-6"><CheckCircle2 className="mt-1 size-4 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" /><span><strong className="font-semibold">Mercado Pago conectado.</strong> Se você estava criando um evento, pode fechar esta aba e voltar: seus dados continuam lá.</span></p>}

      {loading && !overview ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />Carregando pagamentos...</p>
        : failed && !overview ? <div role="alert" className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5"><p className="text-sm">Não foi possível carregar seus pagamentos agora.</p><Button type="button" variant="outline" onClick={() => void load()}>Tentar novamente</Button></div>
          : overview && <>
            <section aria-labelledby="mp-account-title" className="rounded-2xl border bg-card p-4 shadow-surface sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-brand"><Wallet className="size-5" aria-hidden="true" /></span>
                  <div className="min-w-0">
                    <h2 id="mp-account-title" className="text-lg font-semibold">Conta do Mercado Pago</h2>
                    {!overview.configured ? <p className="mt-1 text-sm leading-6 text-muted-foreground">Pagamentos ainda não configurados no EventMap. Assim que forem ativados, você poderá conectar sua conta aqui.</p>
                      : overview.account?.needsReconnect ? <p role="alert" className="mt-1 flex items-start gap-1.5 text-sm leading-6 text-amber-800 dark:text-amber-300"><AlertCircle className="mt-1 size-4 shrink-0" aria-hidden="true" />Reconecte sua conta: o Mercado Pago encerrou a autorização do EventMap. Até lá, as vendas e os estornos ficam pausados.</p>
                      : overview.account ? <>
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />Conectada em {dateTime.format(new Date(overview.account.connectedAt))}</p>
                        {overview.account.label && <p className="mt-0.5 break-all text-sm text-muted-foreground">Conectada como <span className="font-medium text-foreground">{overview.account.label}</span></p>}
                      </>
                        : <p className="mt-1 text-sm leading-6 text-muted-foreground">Conecte a conta que vai receber o dinheiro dos ingressos. Você autoriza no próprio site do Mercado Pago; o EventMap nunca vê sua senha. Quem compra paga só com Pix, sem precisar de conta.</p>}
                  </div>
                </div>
                {overview.configured && (overview.account?.needsReconnect
                  ? connectButton("Reconectar Mercado Pago")
                  : overview.account
                  ? <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setConfirmDisconnect(true)} disabled={busy !== null}><Unlink className="size-4" aria-hidden="true" />Desconectar</Button>
                  : connectButton("Conectar Mercado Pago"))}
              </div>
              {overview.configured && overview.account && !overview.account.needsReconnect && overview.account.feeRefused && <div role="alert" className="mt-4 flex items-start gap-3 rounded-xl border border-amber-600/30 bg-amber-500/10 p-4 text-sm leading-6">
                <AlertCircle className="mt-1 size-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
                <div className="min-w-0 space-y-2">
                  <p className="font-semibold text-amber-900 dark:text-amber-200">O Mercado Pago recusou suas vendas por Pix</p>
                  <p className="text-foreground/90">O Mercado Pago não aceitou a taxa do EventMap nesta conta, por isso o Pix não foi gerado para quem tentou comprar. Isso acontece quando a conta conectada é a mesma conta da plataforma. Desconecte e conecte outra conta do Mercado Pago.</p>
                  <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={() => setConfirmDisconnect(true)} disabled={busy !== null}><Unlink className="size-4" aria-hidden="true" />Desconectar e trocar de conta</Button>
                </div>
              </div>}
            </section>

            <section aria-labelledby="sales-title" className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 id="sales-title" className="text-xl font-semibold">Resumo das vendas</h2>
                {hasSales && <Button type="button" variant="outline" aria-busy={exporting} className="min-h-11 w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:w-auto" disabled={exporting} onClick={() => void exportSales()}>{exporting ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}{exporting ? "Exportando..." : "Exportar vendas (CSV)"}</Button>}
              </div>
              {!hasSales ? <div className="rounded-2xl border border-dashed p-6 text-center">
                <ReceiptText className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
                <p className="mt-2 font-semibold">Nenhum ingresso vendido ainda</p>
                <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">{!overview.configured ? "As vendas aparecem aqui quando os pagamentos estiverem ativos." : !overview.account || overview.account.needsReconnect ? "Conecte o Mercado Pago acima e ative a venda em um evento pago. As vendas aparecem aqui assim que o primeiro Pix for confirmado." : "Abra um evento pago e marque \"Vender ingressos pelo EventMap\". As vendas aparecem aqui assim que o primeiro Pix for confirmado."}</p>
                <Link href="/myEvents" className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Ir para Meus eventos<ArrowRight className="size-4" aria-hidden="true" /></Link>
              </div> : <>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className={`${metricClass} col-span-2 border-primary/25 bg-primary/5 sm:col-span-4`}><dt className="text-sm font-medium text-muted-foreground">Líquido das vendas</dt><dd className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-emerald-700 dark:text-emerald-300 sm:text-4xl">{formatTicketAmount(overview.totals.netCents)}</dd><dd className="mt-1 text-xs text-muted-foreground">{netNote}</dd></div>
                  <div className={metricClass}><dt className="text-sm text-muted-foreground">Faturamento bruto</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{formatTicketAmount(overview.totals.grossCents)}</dd></div>
                  <div className={metricClass}><dt className="text-sm text-muted-foreground">Comissão EventMap ({overview.feePercent}%)</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{formatTicketAmount(overview.totals.feeCents)}</dd></div>
                  <div className={metricClass}><dt className="text-sm text-muted-foreground">Ingressos vendidos</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{overview.totals.sold}</dd></div>
                  <div className={metricClass}><dt className="text-sm text-muted-foreground">Estornos</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{formatTicketAmount(overview.totals.refundedCents)}</dd><dd className="text-xs text-muted-foreground">{ticketCount(overview.totals.refunded)}</dd></div>
                </dl>
                <p className="text-xs leading-5 text-muted-foreground">Bruto, comissão e líquido consideram só pedidos pagos; estornos já ficam de fora. Este resumo não é saldo disponível: confira recebimentos e saques no Mercado Pago.</p>
              </>}
            </section>

            {hasSales && <section aria-labelledby="events-title" className="space-y-4">
              <h2 id="events-title" className="text-xl font-semibold">Por evento</h2>
              <ul className="space-y-4">{overview.events.map((event) => <li key={event.eventId} className="rounded-2xl border bg-card p-5 shadow-surface">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="min-w-0 break-words font-semibold"><Link href={`/eventos/${encodeURIComponent(event.eventId)}`} className="hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{event.eventName}</Link></h3>
                  <div className="flex flex-wrap items-center gap-2"><TicketCoupons eventId={event.eventId} eventName={event.eventName} /></div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
                  <div><dt className="text-muted-foreground">Vendidos</dt><dd className="text-lg font-semibold tabular-nums">{event.sold}</dd></div>
                  <div><dt className="text-muted-foreground">Bruto</dt><dd className="text-lg font-semibold tabular-nums">{formatTicketAmount(event.grossCents)}</dd></div>
                  <div><dt className="text-muted-foreground">Comissão ({overview.feePercent}%)</dt><dd className="text-lg font-semibold tabular-nums">{formatTicketAmount(event.feeCents)}</dd></div>
                  <div><dt className="text-muted-foreground">Líquido</dt><dd className="text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{formatTicketAmount(event.netCents)}</dd><dd className="text-xs text-muted-foreground">{netNote}</dd></div>
                  <div><dt className="text-muted-foreground">Estornos</dt><dd className="text-lg font-semibold tabular-nums">{formatTicketAmount(event.refundedCents)}</dd><dd className="text-xs text-muted-foreground">{ticketCount(event.refunded)}</dd></div>
                </dl>
                <details className="mt-4 border-t pt-3">
                  <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-brand">Ver pedidos ({event.orders.length})</summary>
                  <ul className="divide-y">{event.orders.map((order) => <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="break-words font-medium">{order.buyerName}</p>
                      <p className="text-xs text-muted-foreground"><span className="font-mono">{order.code}</span> · {ticketCount(order.quantity)} · Total {formatTicketAmount(order.totalCents)} · comissão {formatTicketAmount(order.feeCents)}{order.paidAt ? ` · pago em ${dateTime.format(new Date(order.paidAt))}` : ""}</p>
                    </div>
                    {order.status === "PAID"
                      ? <Button type="button" size="sm" variant="outline" onClick={() => setRefundTarget({ ...order, eventName: event.eventName })} disabled={busy !== null}>Estornar<span className="sr-only"> pedido {order.code}</span></Button>
                      : <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{ticketStatusLabels[order.status]}</span>}
                  </li>)}</ul>
                </details>
              </li>)}</ul>
            </section>}

            {recentOrders.length > 0 && <section aria-labelledby="recent-title" className="space-y-4">
              <h2 id="recent-title" className="text-xl font-semibold">Pedidos recentes</h2>
              <ul className="divide-y rounded-2xl border bg-card px-4 shadow-surface sm:px-5">{recentOrders.map((order) => <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="break-words font-medium">{order.buyerName}</p>
                  <p className="break-words text-xs leading-5 text-muted-foreground">{order.eventName} · <span className="font-mono">{order.code}</span> · {ticketCount(order.quantity)}{order.refundedAt ? ` · estornado em ${dateTime.format(new Date(order.refundedAt))}` : order.paidAt ? ` · pago em ${dateTime.format(new Date(order.paidAt))}` : ""}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums">{formatTicketAmount(order.totalCents)}</span>
                  {order.status === "PAID"
                    ? <Button type="button" size="sm" variant="outline" onClick={() => setRefundTarget(order)} disabled={busy !== null}>Estornar<span className="sr-only"> pedido {order.code}</span></Button>
                    : <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{ticketStatusLabels[order.status]}</span>}
                </div>
              </li>)}</ul>
            </section>}

            <details className="rounded-2xl border bg-card px-4 shadow-surface sm:px-5">
              <summary className="flex min-h-11 cursor-pointer items-center py-2 text-sm font-semibold">Como funciona a taxa de {TICKET_FEE_PERCENT}%</summary>
              <div className="border-t py-4">
                <p className="text-sm leading-6 text-muted-foreground">Quem compra paga o preço anunciado. Na hora do Pix, o Mercado Pago divide o valor: {100 - TICKET_FEE_PERCENT}% vai para a sua conta e {TICKET_FEE_PERCENT}% fica com o EventMap. O Mercado Pago também desconta do seu valor a tarifa do Pix.</p>
                <p className="mt-3 text-xs font-medium text-muted-foreground">Exemplo de um ingresso</p>
                <dl className="mt-1 grid grid-cols-3 gap-3 text-sm">
                  <div><dt className="text-muted-foreground">Ingresso</dt><dd className="font-semibold tabular-nums">{formatTicketAmount(exampleCents)}</dd></div>
                  <div><dt className="text-muted-foreground">Taxa EventMap</dt><dd className="font-semibold tabular-nums">−{formatTicketAmount(ticketFeeCents(exampleCents))}</dd></div>
                  <div><dt className="text-muted-foreground">Líquido <span className="block text-xs">{netNote}</span></dt><dd className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{formatTicketAmount(ticketNetCents(exampleCents))}</dd></div>
                </dl>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">Para ativar a venda, abra um evento pago em Meus eventos e marque &quot;Vender ingressos pelo EventMap&quot;. Cupons de desconto ficam em cada evento acima e na página do evento (botão Cupons de desconto). Reembolsos são feitos aqui e devolvem o valor integral a quem comprou. <Link href="/termos#ingressos" className="inline-flex min-h-11 items-center font-medium text-brand underline-offset-4 hover:underline">Regras de venda</Link></p>
              </div>
            </details>
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
          <DialogTitle className="flex items-center gap-2 pr-6"><AlertCircle className="size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />Estornar este pedido?</DialogTitle>
          <DialogDescription>{refundTarget ? `${refundTarget.buyerName} recebe ${formatTicketAmount(refundTarget.totalCents)} de volta pelo Mercado Pago e ${refundTarget.quantity === 1 ? "o ingresso" : `os ${refundTarget.quantity} ingressos do pedido`} de ${refundTarget.eventName} ${refundTarget.quantity === 1 ? "deixa" : "deixam"} de valer. A taxa do EventMap também é devolvida. Esta ação não pode ser desfeita.` : ""}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => setRefundTarget(null)} disabled={busy === "refund"}>Voltar</Button>
          <Button type="button" variant="destructive" onClick={() => void refund()} disabled={busy === "refund"}>{busy === "refund" && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}Estornar pedido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
