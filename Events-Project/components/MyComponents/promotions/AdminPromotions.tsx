"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import { AlertCircle, CheckCircle2, Inbox, Loader2, Sparkles } from "lucide-react";
import { listPromotionReview, reviewPromotion } from "@/app/(actions)/promotions/action";
import type { PromotionActiveItem, PromotionQueueItem } from "@/lib/services/promotions";
import { PROMOTION_REASON_MAX, STALE_PROMOTION_ORDER_HOURS, formatPromotionAmount, formatPromotionDate, isStalePromotionOrder } from "@/lib/promotions";
import { useSocket } from "@/context/SocketContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const loadError = "Não foi possível carregar os destaques. Confira suas permissões e tente novamente.";
const dateTime = (value: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value));

export default function AdminPromotions() {
  const socket = useSocket();
  const [queue, setQueue] = useState<PromotionQueueItem[]>([]);
  const [unpaid, setUnpaid] = useState<PromotionQueueItem[]>([]);
  const [active, setActive] = useState<PromotionActiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<PromotionQueueItem | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState("");
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true); setError("");
    try {
      const result = await listPromotionReview();
      if (id !== request.current) return;
      if (!result.success) { setError(result.message === "Acesso negado." ? loadError : result.message); return; }
      setQueue(result.data.queue); setUnpaid(result.data.unpaid); setActive(result.data.active);
    } catch {
      if (id === request.current) setError(loadError);
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const decide = async (item: PromotionQueueItem, decision: "confirm" | "reject") => {
    if (busyId) return;
    setBusyId(item.id); setActionError("");
    try {
      const result = await reviewPromotion(decision === "confirm" ? { promotionId: item.id, decision } : { promotionId: item.id, decision, reason: reason.trim() });
      if (!result.success) { setActionError(result.message); return; }
      toast.success(result.message, { role: "status" });
      setConfirming(null); setRejectingId(null); setReason("");
      // Catalog, home and map refresh in real time when a highlight starts.
      if (decision === "confirm") socket.emit("create-event");
      await load();
    } catch {
      setActionError("Não foi possível registrar a decisão. Tente novamente.");
    } finally {
      setBusyId(null);
    }
  };

  const submitReject = (event: FormEvent<HTMLFormElement>, item: PromotionQueueItem) => {
    event.preventDefault();
    if (reason.trim().length < 3) { setActionError("Informe o motivo da recusa (3 a 300 caracteres)."); return; }
    void decide(item, "reject");
  };

  const renderOrder = (item: PromotionQueueItem) => {
    const unpaidOrder = item.status === "PENDING_PAYMENT";
    const stale = unpaidOrder && isStalePromotionOrder(item.createdAt, new Date());
    return (
      <li key={item.id} className="rounded-2xl border bg-card p-5 shadow-surface">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/eventos/${encodeURIComponent(item.event.id)}`} className="break-words text-lg font-semibold hover:text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{item.event.nome}</Link>
            <p className="mt-1 break-words text-sm text-muted-foreground">{item.organizer.name || "Organizador sem nome"}{item.organizer.email ? ` · ${item.organizer.email}` : ""}</p>
          </div>
          <p className="text-right"><span className="block text-2xl font-semibold tracking-tight">{formatPromotionAmount(item.amountCents)}</span><span className="text-sm text-muted-foreground">{item.days} dias</span></p>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Pedido</dt><dd className="font-mono font-semibold tracking-wider">{item.code}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Criado em</dt><dd>{dateTime(item.createdAt)}{stale && <span className="ml-2 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">Pedido antigo</span>}</dd></div>
          {unpaidOrder ? (
            <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Pacote</dt><dd>{item.days} dias</dd></div>
          ) : (
            <div className="sm:col-span-3"><dt className="text-xs uppercase tracking-wide text-muted-foreground">Observação do organizador</dt><dd className="break-words">{item.payerNote || <span className="text-muted-foreground">Sem observação</span>}</dd></div>
          )}
        </dl>
        {rejectingId === item.id ? (
          <form className="mt-4 space-y-2" onSubmit={(event) => submitReject(event, item)}>
            <label htmlFor={`reason-${item.id}`} className="block text-sm font-medium">Motivo da recusa</label>
            <Textarea id={`reason-${item.id}`} value={reason} required minLength={3} maxLength={PROMOTION_REASON_MAX} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: Pix não localizado com este identificador" className="min-h-20" autoFocus />
            <p className="text-xs text-muted-foreground">O organizador recebe este motivo por notificação.</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="min-h-11 rounded-xl" disabled={busyId === item.id} onClick={() => { setRejectingId(null); setReason(""); setActionError(""); }}>Voltar</Button>
              <Button type="submit" variant="destructive" className="min-h-11 rounded-xl" disabled={busyId === item.id}>{busyId === item.id ? <><Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Recusando...</> : "Confirmar recusa"}</Button>
            </div>
          </form>
        ) : (
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="min-h-11 rounded-xl" disabled={Boolean(busyId)} onClick={() => { setRejectingId(item.id); setReason(""); setActionError(""); }}>Recusar</Button>
            <Button type="button" variant="cta" className="min-h-11 rounded-xl" disabled={Boolean(busyId)} onClick={() => { setActionError(""); setConfirming(item); }}>Confirmar pagamento</Button>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Link href="/admin" className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">← Administração</Link>
            <p className="mt-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand"><Sparkles className="size-4" aria-hidden="true" />Receita</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Destaques pagos</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Confira o Pix pelo identificador do pedido antes de confirmar. A decisão fica registrada com seu usuário e horário.</p>
          </div>
          <Button type="button" variant="outline" className="min-h-11 rounded-xl" disabled={loading} onClick={() => void load()}>Atualizar</Button>
        </header>

        {actionError && !confirming && <p role="alert" className="break-words rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-red-700 dark:text-red-300">{actionError}</p>}

        {loading && !queue.length && !unpaid.length && !active.length ? (
          <div role="status" aria-busy="true" className="space-y-3"><span className="sr-only">Carregando destaques...</span>{[0, 1].map((index) => <div key={index} aria-hidden="true" className="h-36 animate-pulse rounded-2xl border bg-card motion-reduce:animate-none" />)}</div>
        ) : error ? (
          <div role="alert" className="flex flex-col items-center gap-4 rounded-2xl border bg-card p-8 text-center shadow-surface">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"><AlertCircle className="size-6" aria-hidden="true" /></span>
            <p className="max-w-md text-sm leading-6">{error}</p>
            <Button type="button" className="min-h-11 rounded-xl" onClick={() => void load()}>Tentar novamente</Button>
          </div>
        ) : (
          <>
            <section aria-labelledby="queue-title" aria-busy={loading} className="space-y-3">
              <h2 id="queue-title" className="text-xl font-semibold">Aguardando confirmação <span className="font-normal text-muted-foreground">· {queue.length}</span></h2>
              {queue.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-card p-8 text-center"><Inbox className="size-8 text-brand" aria-hidden="true" /><p className="font-medium">Nenhum pagamento para conferir</p><p className="text-sm text-muted-foreground">Quando um organizador avisar que pagou, o pedido aparece aqui.</p></div>
              ) : (
                <ul className="space-y-3">
                  {queue.map((item) => renderOrder(item))}
                </ul>
              )}
            </section>

            <section aria-labelledby="unpaid-title" aria-busy={loading} className="space-y-3">
              <div>
                <h2 id="unpaid-title" className="text-xl font-semibold">Aguardando o organizador marcar o pagamento <span className="font-normal text-muted-foreground">· {unpaid.length}</span></h2>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">O organizador ainda não clicou em &ldquo;Já paguei&rdquo;. Verifique se chegou um Pix com o identificador e o valor do pedido: se chegou, você pode confirmar daqui; se não, aguarde ou recuse. Pedidos com mais de {STALE_PROMOTION_ORDER_HOURS} horas aparecem como &ldquo;Pedido antigo&rdquo;.</p>
              </div>
              {unpaid.length === 0 ? (
                <p className="rounded-2xl border border-dashed bg-card p-5 text-sm text-muted-foreground">Nenhum pedido aguardando pagamento.</p>
              ) : (
                <ul className="space-y-3">
                  {unpaid.map((item) => renderOrder(item))}
                </ul>
              )}
            </section>

            <section aria-labelledby="active-title" className="rounded-2xl border bg-card p-5 shadow-surface sm:p-6">
              <h2 id="active-title" className="text-xl font-semibold">Destaques ativos e agendados <span className="font-normal text-muted-foreground">· {active.length}</span></h2>
              {active.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nenhum destaque ativo no momento.</p> : (
                <ul className="mt-3 divide-y">
                  {active.map((item) => {
                    const scheduled = item.startsAt != null && new Date(item.startsAt).getTime() > Date.now();
                    return (
                      <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                        <div className="min-w-0"><Link href={`/eventos/${encodeURIComponent(item.event.id)}`} className="break-words font-medium hover:text-brand hover:underline">{item.event.nome}</Link><p className="text-xs text-muted-foreground"><span className="font-mono">{item.code}</span> · {item.days} dias</p></div>
                        <span className={"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold " + (scheduled ? "bg-primary/10 text-brand" : "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200")}>
                          {!scheduled && <CheckCircle2 className="size-3.5" aria-hidden="true" />}
                          {scheduled && item.startsAt ? `De ${formatPromotionDate(item.startsAt)} ` : ""}{item.endsAt ? `até ${formatPromotionDate(item.endsAt)}` : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      <Dialog open={Boolean(confirming)} onOpenChange={(open) => { if (!open && !busyId) { setConfirming(null); setActionError(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar pagamento?</DialogTitle>
            <DialogDescription className="break-words">
              {confirming && <>Você conferiu o Pix de <strong className="text-foreground">{formatPromotionAmount(confirming.amountCents)}</strong> com o identificador <strong className="font-mono text-foreground">{confirming.code}</strong>?{confirming.status === "PENDING_PAYMENT" && <> O organizador ainda não marcou o pagamento, então confirme só se o Pix já estiver na conta.</>} <strong className="text-foreground">{confirming.event.nome}</strong> fica em destaque por {confirming.days} dias, começando agora ou ao fim do destaque atual.</>}
            </DialogDescription>
          </DialogHeader>
          {actionError && confirming && <p role="alert" className="break-words rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-red-700 dark:text-red-300">{actionError}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="min-h-11 rounded-xl" disabled={Boolean(busyId)} onClick={() => { setConfirming(null); setActionError(""); }}>Voltar</Button>
            <Button type="button" variant="cta" className="min-h-11 rounded-xl" disabled={Boolean(busyId)} onClick={() => { if (confirming) void decide(confirming, "confirm"); }}>{busyId ? <><Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Confirmando...</> : "Confirmar e ativar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
