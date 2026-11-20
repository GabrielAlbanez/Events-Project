"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import { AlertCircle, BarChart3, CheckCircle2, Clock3, Copy, Loader2, MapPin, Minus, Sparkles, TrendingDown, TrendingUp, XCircle } from "lucide-react";
import { cancelPromotionOrder, createPromotionOrder, getPromotionOverview, markPromotionPaid } from "@/app/(actions)/promotions/action";
import type { PromotionHighlightResult, PromotionOverview, PromotionView } from "@/lib/services/promotions";
import { PROMOTION_NOTE_MAX, formatPromotionAmount, formatPromotionDate, promotionStatusLabels, type PromotionPackageId } from "@/lib/promotions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FeaturedBadge } from "@/components/MyComponents/FeaturedBadge";

type Busy = "create" | "paid" | "cancel" | null;
const loadError = "Não foi possível carregar o destaque deste evento. Tente novamente.";
const actionError = "Não foi possível concluir agora. Tente novamente.";

const statusTone: Record<PromotionView["status"], string> = {
  PENDING_PAYMENT: "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200",
  AWAITING_REVIEW: "bg-primary/10 text-brand",
  ACTIVE: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200",
  REJECTED: "bg-destructive/10 text-red-700 dark:text-red-300",
  CANCELLED: "bg-muted text-muted-foreground",
};

/** ACTIVE rows read as "Agendado" before they start and "Encerrado" after they end (computed on read, like the catalog). */
function StatusPill({ item }: { item: Pick<PromotionView, "status" | "startsAt" | "endsAt"> }) {
  const now = Date.now();
  const ended = item.status === "ACTIVE" && item.endsAt != null && new Date(item.endsAt).getTime() <= now;
  const scheduled = item.status === "ACTIVE" && !ended && item.startsAt != null && new Date(item.startsAt).getTime() > now;
  const label = ended ? "Encerrado" : scheduled ? "Agendado" : promotionStatusLabels[item.status];
  const tone = ended ? statusTone.CANCELLED : scheduled ? statusTone.AWAITING_REVIEW : statusTone[item.status];
  return <span className={"inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold " + tone}>{label}</span>;
}

const paymentSteps = ["Pague o Pix", "Clique em “Já paguei”", "Aprovação"] as const;

/** Where the order is in the manual Pix flow. Step 2 is easy to forget, so it stays visible until the admin decides. */
function PaymentSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol aria-label="Etapas do pagamento" className="mt-5 grid gap-2 sm:grid-cols-3">
      {paymentSteps.map((label, index) => {
        const step = index + 1;
        const done = step < current;
        const active = step === current;
        return (
          <li key={label} aria-current={active ? "step" : undefined} className={"flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm " + (active ? "border-primary bg-primary/5 font-semibold text-foreground" : done ? "border-emerald-500/30 text-emerald-800 dark:text-emerald-200" : "text-muted-foreground")}>
            <span aria-hidden="true" className={"flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold " + (active ? "bg-primary text-primary-foreground" : done ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground")}>{done ? <CheckCircle2 className="size-4" /> : step}</span>
            <span className="min-w-0 break-words">{label}</span>
            <span className="sr-only">{done ? " (concluída)" : active ? " (etapa atual)" : " (próxima)"}</span>
          </li>
        );
      })}
    </ol>
  );
}

const numberFormat = new Intl.NumberFormat("pt-BR");
/** EventMetric day keys are already calendar days (YYYY-MM-DD): format them without timezone conversion. */
const formatDayKey = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;

function ChangeBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-muted-foreground">Sem base de comparação</span>;
  const up = value > 0, down = value < 0;
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
  const tone = up ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200" : down ? "bg-destructive/10 text-red-700 dark:text-red-300" : "bg-muted text-muted-foreground";
  const label = `${up ? "+" : down ? "−" : ""}${numberFormat.format(Math.abs(value))}%`;
  return (
    <span className={"inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold " + tone}>
      <Icon className="size-3.5" aria-hidden="true" />{label}
      <span className="sr-only">{up ? "de aumento" : down ? "de queda" : "sem variação"} em relação ao período anterior</span>
    </span>
  );
}

function HighlightResult({ result, unavailable }: { result: PromotionHighlightResult | null; unavailable: boolean }) {
  const rows = result ? [
    { label: "Visualizações", during: result.during.views, before: result.before.views, change: result.change.views },
    { label: "Cliques em ingressos", during: result.during.ticketClicks, before: result.before.ticketClicks, change: result.change.ticketClicks },
  ] : [];
  return (
    <section aria-labelledby="result-title" className="rounded-2xl border bg-card p-5 shadow-surface sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-brand"><BarChart3 className="size-5" aria-hidden="true" /></span>
          <div className="min-w-0">
            <h2 id="result-title" className="text-xl font-semibold">Resultado do destaque</h2>
            {result && <p className="mt-1 text-sm text-muted-foreground">Pedido <span className="font-mono">{result.code}</span> · {formatPromotionDate(result.startsAt)} a {formatPromotionDate(result.endsAt)}{result.running ? ` · dia ${result.daysElapsed} de ${result.totalDays}` : ""}</p>}
          </div>
        </div>
        {result && <span className={"inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold " + (result.running ? statusTone.ACTIVE : statusTone.CANCELLED)}>{result.running ? "Em andamento" : "Encerrado"}</span>}
      </div>
      {unavailable || !result ? (
        <p role="status" className="mt-4 rounded-xl border border-amber-300/50 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">Não foi possível carregar o resultado agora. Tente novamente em alguns minutos.</p>
      ) : !result.hasData ? (
        <p className="mt-4 text-sm leading-6 text-muted-foreground">Ainda não há visualizações nem cliques registrados neste período ou nos dias anteriores ao destaque. Os números aparecem aqui conforme o público interage com o evento.</p>
      ) : (
        <>
          <dl className="mt-5 divide-y border-y">
            {rows.map((row) => (
              <div key={row.label} className="grid grid-cols-2 items-center gap-x-4 gap-y-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
                <dt className="col-span-2 text-sm font-medium sm:col-span-1">{row.label}</dt>
                <dd className="min-w-0"><span className="block text-xs text-muted-foreground">Durante</span><span className="text-2xl font-semibold tracking-tight tabular-nums">{numberFormat.format(row.during)}</span></dd>
                <dd className="min-w-0 sm:min-w-20"><span className="block text-xs text-muted-foreground">Antes</span><span className="text-2xl font-semibold tracking-tight tabular-nums text-muted-foreground">{numberFormat.format(row.before)}</span></dd>
                <dd className="col-span-2 sm:col-span-1 sm:min-w-24 sm:text-right"><ChangeBadge value={row.change} /></dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {result.running ? "Destaque em andamento: comparamos os dias até hoje" : "Comparamos os dias do destaque"} ({formatDayKey(result.during.from)} a {formatDayKey(result.during.to)}) com os {result.comparedDays} {result.comparedDays === 1 ? "dia imediatamente anterior" : "dias imediatamente anteriores"} ({formatDayKey(result.before.from)} a {formatDayKey(result.before.to)}).
          </p>
        </>
      )}
    </section>
  );
}

export default function PromoteEventPanel({ eventId }: { eventId: string }) {
  const [overview, setOverview] = useState<PromotionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [selected, setSelected] = useState<PromotionPackageId>("7d");
  const [note, setNote] = useState("");
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current;
    setError("");
    try {
      const result = await getPromotionOverview(eventId);
      if (id !== request.current) return;
      if (!result.success) { setOverview(null); setError(result.message || loadError); return; }
      setOverview(result.data);
    } catch {
      if (id === request.current) setError(loadError);
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { void load(); }, [load]);

  const run = async (kind: Exclude<Busy, null>, action: () => Promise<{ success: boolean; message: string }>) => {
    if (busy) return;
    setBusy(kind);
    try {
      const result = await action();
      if (!result.success) { const message = result.message || actionError; toast.error(message, { toastId: `promotion-action:${message}` }); return; }
      toast.success(result.message, { role: "status" });
      if (kind === "paid") setNote("");
      await load();
    } catch {
      toast.error(actionError, { toastId: `promotion-action:${actionError}` });
    } finally {
      setBusy(null);
    }
  };

  const copyPixKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      toast.success("Chave Pix copiada.", { role: "status" });
    } catch {
      toast.error("Não foi possível copiar. Selecione a chave e copie manualmente.");
    }
  };

  const submitPaid = (event: FormEvent<HTMLFormElement>, promotionId: string) => {
    event.preventDefault();
    void run("paid", () => markPromotionPaid({ promotionId, note: note.trim() || undefined }));
  };

  const open = overview?.open ?? null;
  const latest = overview?.history[0] ?? null;
  const rejected = latest?.status === "REJECTED" ? latest : null;
  const selectedPackage = overview?.packages.find((item) => item.id === selected) ?? overview?.packages[0];

  return (
    <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <Link href="/myEvents" className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">← Meus eventos</Link>
          <p className="mt-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand"><Sparkles className="size-4" aria-hidden="true" />Destaque patrocinado</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Destacar evento</h1>
          {overview && <p className="mt-2 break-words text-base text-muted-foreground">{overview.event.nome}</p>}
        </header>

        {loading ? (
          <div role="status" aria-busy="true" className="space-y-4">
            <span className="sr-only">Carregando destaque...</span>
            <div aria-hidden="true" className="h-24 animate-pulse rounded-2xl border bg-card motion-reduce:animate-none" />
            <div aria-hidden="true" className="grid gap-3 sm:grid-cols-2"><div className="h-32 animate-pulse rounded-2xl border bg-card motion-reduce:animate-none" /><div className="h-32 animate-pulse rounded-2xl border bg-card motion-reduce:animate-none" /></div>
          </div>
        ) : error || !overview ? (
          <div role="alert" className="flex flex-col items-center gap-4 rounded-2xl border bg-card p-8 text-center shadow-surface">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"><AlertCircle className="size-6" aria-hidden="true" /></span>
            <p className="max-w-md text-sm leading-6">{error || loadError}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" variant="outline" className="min-h-11 rounded-xl" onClick={() => { setLoading(true); void load(); }}>Tentar novamente</Button>
              <Button asChild variant="ghost" className="min-h-11 rounded-xl"><Link href="/myEvents">Voltar para Meus eventos</Link></Button>
            </div>
          </div>
        ) : (
          <>
            <section aria-label="Onde o destaque aparece" className="rounded-2xl border bg-card p-5 shadow-surface sm:p-6">
              <div className="flex flex-wrap items-center gap-3"><FeaturedBadge /><p className="text-sm text-muted-foreground">É assim que o selo aparece para o público.</p></div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">O evento aparece no topo da agenda e em &quot;Mais eventos para descobrir&quot; na página inicial, e ganha um pin maior no mapa <MapPin className="inline size-4 align-text-bottom text-brand" aria-hidden="true" />. Até três destaques ficam no topo ao mesmo tempo, por data.</p>
            </section>

            {overview.activeUntil && (
              <div role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-50 p-4 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <div><p className="font-semibold">Destaque ativo até {formatPromotionDate(overview.activeUntil)}</p><p className="mt-1 text-sm opacity-90">Um novo pacote começa quando este terminar.</p></div>
              </div>
            )}

            {(overview.result || overview.resultUnavailable) && <HighlightResult result={overview.result} unavailable={overview.resultUnavailable} />}

            {rejected && !open && (
              <div role="status" className="flex items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 p-4">
                <XCircle className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
                <div className="min-w-0"><p className="font-semibold">Pedido {rejected.code} recusado</p>{rejected.reviewNote && <p className="mt-1 break-words text-sm text-muted-foreground">Motivo: {rejected.reviewNote}</p>}<p className="mt-1 text-sm text-muted-foreground">Você pode criar um novo pedido abaixo.</p></div>
              </div>
            )}

            {open?.status === "PENDING_PAYMENT" ? (
              <section aria-labelledby="pix-title" className="rounded-2xl border bg-card p-5 shadow-surface sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="pix-title" className="text-xl font-semibold">Pague com Pix</h2><p className="mt-1 text-sm text-muted-foreground">Pacote de {open.days} dias · pedido criado em {formatPromotionDate(open.createdAt)}</p></div><StatusPill item={open} /></div>
                <PaymentSteps current={1} />
                <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border bg-background p-4"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Valor</dt><dd className="mt-1 text-2xl font-semibold tracking-tight">{formatPromotionAmount(open.amountCents)}</dd></div>
                  <div className="rounded-xl border bg-background p-4"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Identificador do pedido</dt><dd className="mt-1 font-mono text-2xl font-semibold tracking-wider">{open.code}</dd><dd className="mt-1 text-xs text-muted-foreground">Escreva na descrição do Pix.</dd></div>
                  {overview.payment ? <>
                    <div className="rounded-xl border bg-background p-4 sm:col-span-2"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Chave Pix</dt><dd className="mt-1 flex flex-wrap items-center gap-3"><span className="min-w-0 select-all break-all font-mono text-base">{overview.payment.key}</span><Button type="button" variant="outline" size="sm" className="min-h-11 rounded-xl" onClick={() => void copyPixKey(overview.payment!.key)}><Copy className="size-4" aria-hidden="true" />Copiar chave</Button></dd><dd className="mt-2 text-sm text-muted-foreground">Favorecido: {overview.payment.name}</dd></div>
                  </> : <div role="status" className="rounded-xl border border-amber-300/50 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 sm:col-span-2">Pagamento indisponível no momento. Os dados do Pix voltam a aparecer aqui assim que forem configurados.</div>}
                </dl>
                <form className="mt-5 space-y-3" onSubmit={(event) => submitPaid(event, open.id)}>
                  <label htmlFor="payer-note" className="block text-sm font-medium">Observação <span className="font-normal text-muted-foreground">(opcional)</span></label>
                  <Textarea id="payer-note" value={note} maxLength={PROMOTION_NOTE_MAX} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: nome de quem pagou ou ID da transação" aria-describedby="payer-note-count" className="min-h-20" />
                  <p id="payer-note-count" className="text-right text-xs text-muted-foreground">{note.length}/{PROMOTION_NOTE_MAX}</p>
                  <p id="paid-hint" className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm leading-6"><Clock3 className="mt-1 size-4 shrink-0 text-brand" aria-hidden="true" /><span><strong className="font-semibold">Já fez o Pix? Clique em &ldquo;Já paguei&rdquo;.</strong> É esse aviso que envia seu pedido para conferência; sem ele, a aprovação pode demorar.</span></p>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" disabled={Boolean(busy)} className="min-h-11 rounded-xl" onClick={() => void run("cancel", () => cancelPromotionOrder({ promotionId: open.id }))}>{busy === "cancel" ? <><Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Cancelando...</> : "Cancelar pedido"}</Button>
                    <Button type="submit" variant="cta" disabled={Boolean(busy)} aria-describedby="paid-hint" className="min-h-11 rounded-xl">{busy === "paid" ? <><Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Enviando...</> : "Já paguei"}</Button>
                  </div>
                </form>
              </section>
            ) : open?.status === "AWAITING_REVIEW" ? (
              <section aria-labelledby="review-title" className="rounded-2xl border bg-card p-5 shadow-surface sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-brand"><Clock3 className="size-5" aria-hidden="true" /></span><div><h2 id="review-title" className="text-xl font-semibold">Pagamento em análise</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Pedido {open.code} · {open.days} dias · {formatPromotionAmount(open.amountCents)}. Vamos conferir o Pix e avisar você por notificação.</p></div></div><StatusPill item={open} /></div>
                <PaymentSteps current={3} />
                {open.payerNote && <p className="mt-4 break-words rounded-xl border bg-background p-3 text-sm"><span className="text-muted-foreground">Sua observação: </span>{open.payerNote}</p>}
              </section>
            ) : (
              <section aria-labelledby="packages-title" className="rounded-2xl border bg-card p-5 shadow-surface sm:p-6">
                <h2 id="packages-title" className="text-xl font-semibold">Escolha o pacote</h2>
                <p className="mt-1 text-sm text-muted-foreground">O destaque começa quando confirmarmos o pagamento.</p>
                <fieldset className="mt-5" disabled={Boolean(overview.blockedReason) || Boolean(busy)}>
                  <legend className="sr-only">Pacotes de destaque</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {overview.packages.map((item) => (
                      <label key={item.id} className={"relative flex cursor-pointer flex-col gap-1 rounded-2xl border p-4 transition-colors motion-reduce:transition-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 " + (selected === item.id ? "border-primary bg-primary/5" : "bg-background hover:border-primary/40")}>
                        <input type="radio" name="package" value={item.id} checked={selected === item.id} onChange={() => setSelected(item.id)} className="sr-only" />
                        <span className="flex items-center justify-between gap-2"><span className="font-semibold">{item.label}</span>{selected === item.id && <CheckCircle2 className="size-5 text-brand" aria-hidden="true" />}</span>
                        <span className="text-2xl font-semibold tracking-tight">{formatPromotionAmount(item.amountCents)}</span>
                        <span className="text-xs text-muted-foreground">Pagamento único via Pix</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                {overview.blockedReason ? (
                  <p role="status" className="mt-4 rounded-xl border border-amber-300/50 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">{overview.blockedReason}</p>
                ) : null}
                <div className="mt-5 flex justify-end">
                  <Button type="button" variant="cta" disabled={Boolean(overview.blockedReason) || Boolean(busy) || !selectedPackage} className="min-h-11 w-full rounded-xl sm:w-auto" onClick={() => void run("create", () => createPromotionOrder({ eventId: overview.event.id, packageId: selected }))}>
                    {busy === "create" ? <><Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Gerando pedido...</> : selectedPackage ? `Gerar pedido de ${formatPromotionAmount(selectedPackage.amountCents)}` : "Gerar pedido"}
                  </Button>
                </div>
              </section>
            )}

            <section aria-labelledby="history-title" className="rounded-2xl border bg-card p-5 shadow-surface sm:p-6">
              <h2 id="history-title" className="text-lg font-semibold">Pedidos deste evento</h2>
              {overview.history.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nenhum pedido ainda.</p> : (
                <ul className="mt-3 divide-y">
                  {overview.history.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div className="min-w-0"><p className="text-sm font-medium"><span className="font-mono">{item.code}</span> · {item.days} dias · {formatPromotionAmount(item.amountCents)}</p><p className="text-xs text-muted-foreground">{item.status === "ACTIVE" && item.endsAt ? `${item.startsAt ? `De ${formatPromotionDate(item.startsAt)} ` : ""}até ${formatPromotionDate(item.endsAt)}` : `Criado em ${formatPromotionDate(item.createdAt)}`}</p></div>
                      <StatusPill item={item} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
