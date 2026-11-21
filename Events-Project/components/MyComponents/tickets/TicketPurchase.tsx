"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { toast } from "react-toastify";
import { CheckCircle2, Clock3, Copy, Loader2, Ticket, TicketCheck } from "lucide-react";
import { createTicketOrder, getTicketOrderStatus, getTicketPurchaseState } from "@/app/(actions)/tickets/action";
import type { TicketOrderView, TicketPurchaseState } from "@/lib/services/tickets";
import { formatTicketAmount } from "@/lib/tickets";
import CheckInPass from "../CheckInPass";

const POLL_MS = 4000;
const notify = (text: string, type: "success" | "error" | "info") => { if (text) toast(text, { type, toastId: `tickets:${text}` }); };
const button = "em-motion-press inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-60";
const primary = `${button} w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto`;
const secondary = `${button} border border-border hover:bg-muted`;

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** EventMap checkout: Pix QR + copy-and-paste, 30-minute countdown and automatic confirmation (status polled every ~4s). */
export default function TicketPurchase({ eventId, priceCents }: { eventId: string; priceCents: number }) {
  const { status: sessionStatus, data: session } = useSession();
  const [purchase, setPurchase] = useState<TicketPurchaseState | null>(null);
  const [order, setOrder] = useState<TicketOrderView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const checking = useRef(false);
  const price = formatTicketAmount(purchase?.priceCents ?? priceCents);
  const loginHref = `/login?callbackUrl=${encodeURIComponent(`/eventos/${eventId}`)}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getTicketPurchaseState(eventId);
      if (!result.success) throw new Error(result.message);
      setPurchase(result.data);
      setOrder(result.data.order);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (sessionStatus === "loading") return;
    void load();
  }, [load, sessionStatus, session?.user?.id]);

  const refreshOrder = useCallback(async (orderId: string) => {
    if (checking.current) return;
    checking.current = true;
    try {
      const result = await getTicketOrderStatus({ orderId });
      if (!result.success) return;
      setOrder((previous) => {
        if (previous?.status === "PENDING" && result.data.status === "PAID") notify("Pagamento confirmado! Seu ingresso está pronto.", "success");
        return result.data;
      });
      if (result.data.status === "PAID") setPurchase((current) => (current ? { ...current, state: "owned", order: result.data } : current));
    } catch {
      // Transient failure: the next poll tries again.
    } finally {
      checking.current = false;
    }
  }, []);

  const pendingId = order?.status === "PENDING" ? order.id : null;
  useEffect(() => {
    if (!pendingId) return;
    const poll = window.setInterval(() => { if (document.visibilityState === "visible") void refreshOrder(pendingId); }, POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(poll); window.clearInterval(tick); };
  }, [pendingId, refreshOrder]);

  const remaining = order ? new Date(order.expiresAt).getTime() - now : 0;
  const expiredLocally = order?.status === "PENDING" && remaining <= 0;
  useEffect(() => {
    // At the deadline, ask the server once more: it confirms a last-second payment or marks the order expired.
    if (expiredLocally && pendingId) void refreshOrder(pendingId);
  }, [expiredLocally, pendingId, refreshOrder]);

  async function buy() {
    setBusy(true);
    try {
      const result = await createTicketOrder({ eventId });
      notify(result.message, result.success ? "info" : "error");
      if (result.success) { setNow(Date.now()); setOrder(result.data); }
      else void load();
    } catch {
      notify("Não foi possível gerar o Pix agora. Tente novamente.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!order?.pixCopyPaste) return;
    try {
      await navigator.clipboard.writeText(order.pixCopyPaste);
      notify("Código Pix copiado. Cole no app do seu banco.", "success");
    } catch {
      notify("Não foi possível copiar. Selecione o código e copie manualmente.", "error");
    }
  }

  const paid = order?.status === "PAID" || purchase?.state === "owned";
  const ended = order && (order.status === "EXPIRED" || order.status === "CANCELLED");

  return <section aria-labelledby="ticket-title" className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
    <div className="flex items-start gap-3">
      <Ticket aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
      <div className="min-w-0 flex-1">
        <h2 id="ticket-title" className="font-semibold">Ingresso</h2>
        <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{price}</p>
        <p className="mt-1 text-sm text-muted-foreground">Pagamento por Pix, processado pelo Mercado Pago. O ingresso é confirmado automaticamente e vira seu QR Code de entrada.</p>
      </div>
    </div>

    <div className="mt-4 space-y-3">
      {loading && !purchase ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />Consultando ingressos...</p>
        : loadError && !purchase ? <div className="space-y-2"><p role="alert" className="text-sm text-destructive">Não foi possível consultar os ingressos agora.</p><button type="button" onClick={() => void load()} className={secondary}>Tentar novamente</button></div>
          : paid ? <div className="space-y-3">
            <p role="status" className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300"><TicketCheck aria-hidden="true" className="h-4 w-4" />Ingresso confirmado</p>
            <p className="text-sm leading-6 text-muted-foreground">Mostre o QR Code abaixo na entrada. Ele também fica em Meus ingressos.</p>
            {sessionStatus === "authenticated" && <CheckInPass key={session?.user?.id} eventId={eventId} />}
            <Link href="/ingressos" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Ver meus ingressos →</Link>
          </div>
            : order?.status === "PENDING" ? <Checkout order={order} remaining={remaining} onCopy={() => void copyCode()} />
              : purchase && <PurchaseAction purchase={purchase} ended={Boolean(ended)} busy={busy} price={price} loginHref={loginHref} onBuy={() => void buy()} />}
    </div>
  </section>;
}

function PurchaseAction({ purchase, ended, busy, price, loginHref, onBuy }: { purchase: TicketPurchaseState; ended: boolean; busy: boolean; price: string; loginHref: string; onBuy: () => void }) {
  const seats = purchase.seatsLeft;
  const seatsText = seats != null && seats > 0 ? <p className="text-xs text-muted-foreground">{seats === 1 ? "Último ingresso disponível" : `${seats} ingressos disponíveis`}</p> : null;
  switch (purchase.state) {
    case "login":
      return <div className="space-y-2"><Link href={loginHref} className={primary}>Entre para comprar — {price}</Link>{seatsText}</div>;
    case "available":
    case "pending":
      return <div className="space-y-2">
        {ended && <p role="status" className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">O Pix anterior expirou sem pagamento. Gere um novo para continuar.</p>}
        <button type="button" disabled={busy} onClick={onBuy} className={primary}>{busy ? <><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />Gerando Pix...</> : `Comprar ingresso — ${price}`}</button>
        {purchase.message && <p className="text-sm text-muted-foreground">{purchase.message} <Link href="/Profile" className="font-medium text-brand underline-offset-4 hover:underline">Ir para minha conta</Link></p>}
        {seatsText}
        <p className="text-xs leading-5 text-muted-foreground">Ao comprar, seu nome e e-mail ficam visíveis para a organização do evento. Reembolsos são feitos pelo organizador, inclusive no prazo de 7 dias para desistência. <Link href="/termos#ingressos" className="font-medium text-brand underline-offset-4 hover:underline">Ver regras</Link></p>
      </div>;
    case "sold_out":
      return <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm font-semibold">Ingressos esgotados</p>;
    case "own_event":
      return <p className="text-sm text-muted-foreground">Este é o seu evento. Acompanhe as vendas em <Link href="/myEvents/pagamentos" className="font-medium text-brand underline-offset-4 hover:underline">Pagamentos</Link>.</p>;
    default:
      return <p role="status" className="text-sm text-muted-foreground">{purchase.message || "A venda de ingressos não está disponível agora."}</p>;
  }
}

function Checkout({ order, remaining, onCopy }: { order: TicketOrderView; remaining: number; onCopy: () => void }) {
  const ready = Boolean(order.pixCopyPaste && order.pixQrBase64);
  return <div className="space-y-4 border-t border-primary/15 pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p role="status" className="flex items-center gap-2 text-sm font-semibold"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-brand motion-reduce:animate-none" />Aguardando pagamento</p>
      <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-sm font-semibold tabular-nums text-amber-800 dark:text-amber-300"><Clock3 aria-hidden="true" className="h-4 w-4" /><span className="sr-only">Tempo restante para pagar:</span>{formatRemaining(remaining)}</p>
    </div>
    {ready ? <>
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URI from Mercado Pago, not optimizable */}
      <img src={`data:image/png;base64,${order.pixQrBase64}`} alt={`QR Code do Pix para o pedido ${order.code}`} width={220} height={220} className="mx-auto block h-[220px] w-[220px] rounded-xl bg-white p-2" />
      <div className="space-y-2">
        <label htmlFor={`pix-code-${order.id}`} className="block text-sm font-medium">Pix copia e cola</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input id={`pix-code-${order.id}`} readOnly value={order.pixCopyPaste ?? ""} onFocus={(event) => event.currentTarget.select()} className="min-h-11 min-w-0 flex-1 rounded-xl border bg-background px-3 font-mono text-xs" />
          <button type="button" onClick={onCopy} className={primary}><Copy aria-hidden="true" className="h-4 w-4" />Copiar código</button>
        </div>
      </div>
    </> : <p className="text-sm text-muted-foreground">Gerando o QR Code do Pix...</p>}
    <ol className="space-y-1.5 text-sm text-muted-foreground">
      <li className="flex gap-2"><span aria-hidden="true" className="font-semibold text-foreground">1.</span>Abra o app do seu banco e escolha pagar com Pix.</li>
      <li className="flex gap-2"><span aria-hidden="true" className="font-semibold text-foreground">2.</span>Leia o QR Code ou cole o código copiado.</li>
      <li className="flex gap-2"><CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Pronto: esta página confirma sozinha em alguns segundos.</li>
    </ol>
    <p className="text-xs text-muted-foreground">Pedido <span className="font-mono">{order.code}</span> · o Pix vale por 30 minutos.</p>
  </div>;
}
