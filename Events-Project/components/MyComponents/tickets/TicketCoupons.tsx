"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { toast } from "react-toastify";
import { Copy, Link2, Loader2, Plus, Tag, TicketPercent } from "lucide-react";
import { createTicketCoupon, listTicketCoupons, setTicketCouponActive } from "@/app/(actions)/tickets/action";
import type { TicketCouponView } from "@/lib/services/tickets";
import { TICKET_COUPON_MAX_PERCENT, TICKET_FEE_PERCENT, formatTicketAmount } from "@/lib/tickets";
import { couponDiscountLabel, couponExample, couponShareUrl, parseCouponForm, type CouponFormField, type CouponFormValues } from "@/lib/ticketCoupons";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type TicketCouponsProps = {
  eventId: string;
  eventName: string;
  /** Current ticket price; without it the example uses R$ 50,00. */
  priceCents?: number | null;
  /** Public site origin from the server. Falls back to the browser origin. */
  siteOrigin?: string;
  triggerClassName?: string;
  triggerLabel?: string;
};

const EXAMPLE_PRICE_CENTS = 5000;
const notify = (text: string, type: "success" | "error" | "info" = "success") => { if (text) toast(text, { type, toastId: `coupons:${text}` }); };
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const field = "min-h-11 w-full min-w-0 rounded-2xl border bg-card px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary aria-[invalid=true]:border-destructive";
const smallAction = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50";
const emptyForm = (eventId: string): CouponFormValues => ({ eventId, code: "", kind: "percent", value: "", maxUses: "", expiresAt: "" });

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* falls back below */ }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  } catch {
    return false;
  }
}

function couponStatus(coupon: TicketCouponView, now: number): { label: string; tone: "active" | "muted" | "warn" } {
  if (!coupon.active) return { label: "Desativado", tone: "muted" };
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= now) return { label: "Expirado", tone: "warn" };
  if (coupon.maxUses != null && coupon.uses >= coupon.maxUses) return { label: "Esgotado", tone: "warn" };
  return { label: "Ativo", tone: "active" };
}

/** Organizer coupon manager for one event: create, list, copy code/link and (de)activate. Coupons are never deleted. */
export default function TicketCoupons({ eventId, eventName, priceCents, siteOrigin, triggerClassName, triggerLabel = "Cupons" }: TicketCouponsProps) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState(siteOrigin ?? "");
  const [coupons, setCoupons] = useState<TicketCouponView[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState<CouponFormValues>(() => emptyForm(eventId));
  const [errors, setErrors] = useState<Partial<Record<CouponFormField, string>>>({});
  const [formError, setFormError] = useState("");
  const [creating, setCreating] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const basePrice = priceCents && priceCents > 0 ? priceCents : EXAMPLE_PRICE_CENTS;

  useEffect(() => { if (!siteOrigin) setOrigin(window.location.origin); }, [siteOrigin]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listTicketCoupons(eventId);
      if (!result.success) throw new Error(result.message);
      setCoupons(result.data);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  // Loaded only when the dialog opens: the organizer list renders many cards.
  useEffect(() => { if (open) void load(); }, [open, load]);

  const update = (key: keyof CouponFormValues, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (key in errors) setErrors((current) => ({ ...current, [key]: undefined }));
    if (formError) setFormError("");
  };

  // Live example follows the form when the value is valid; otherwise 10% off.
  const preview = parseCouponForm({ ...form, code: form.code || "EXEMPLO", maxUses: "", expiresAt: "" });
  const exampleDiscount = preview.ok ? { percentOff: preview.input.percentOff ?? null, amountOffCents: preview.input.amountOffCents ?? null } : { percentOff: 10, amountOffCents: null };
  const example = couponExample(basePrice, exampleDiscount);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    const parsed = parseCouponForm(form);
    if (!parsed.ok) {
      setErrors({ [parsed.field]: parsed.message });
      document.getElementById(`${ids}-${parsed.field}`)?.focus();
      return;
    }
    setCreating(true);
    setFormError("");
    try {
      const result = await createTicketCoupon(parsed.input);
      if (!result.success) { setFormError(result.message || "Não foi possível criar o cupom."); return; }
      notify(`Cupom ${result.data.code} criado.`);
      setCoupons((current) => [result.data, ...(current ?? []).filter((item) => item.id !== result.data.id)]);
      setForm(emptyForm(eventId));
      setErrors({});
    } catch {
      setFormError("Não foi possível criar o cupom agora. Tente novamente.");
    } finally {
      setCreating(false);
    }
  }

  async function toggle(coupon: TicketCouponView) {
    setToggling(coupon.id);
    try {
      const result = await setTicketCouponActive({ couponId: coupon.id, active: !coupon.active });
      notify(result.message || (result.success ? "Cupom atualizado." : "Não foi possível atualizar o cupom."), result.success ? "success" : "error");
      if (result.success) setCoupons((current) => (current ?? []).map((item) => item.id === coupon.id ? { ...item, active: !coupon.active } : item));
    } catch {
      notify("Não foi possível atualizar o cupom agora. Tente novamente.", "error");
    } finally {
      setToggling(null);
    }
  }

  async function copy(text: string | null, success: string) {
    if (text && await copyText(text)) notify(success);
    else notify("Não foi possível copiar. Tente novamente.", "error");
  }

  const errorId = (key: CouponFormField) => `${ids}-${key}-error`;
  const describe = (key: CouponFormField, hint?: string) => [hint, errors[key] ? errorId(key) : undefined].filter(Boolean).join(" ") || undefined;
  const now = Date.now();

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>
      <button type="button" className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary", triggerClassName)}>
        <TicketPercent className="size-4 shrink-0" aria-hidden="true" />{triggerLabel}
      </button>
    </DialogTrigger>
    <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-2xl gap-5 overflow-y-auto rounded-2xl bg-background p-4 pt-5 sm:p-6">
      <DialogHeader className="pr-8 text-left">
        <DialogTitle className="text-xl font-semibold tracking-tight">Cupons de desconto</DialogTitle>
        <DialogDescription className="break-words text-sm text-muted-foreground">{eventName} · ingresso de {formatTicketAmount(basePrice)}{priceCents && priceCents > 0 ? "" : " (exemplo)"}</DialogDescription>
      </DialogHeader>

      <section aria-labelledby={`${ids}-fee`} className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm">
        <h3 id={`${ids}-fee`} className="font-semibold">Como o desconto afeta o que você recebe</h3>
        <p className="mt-1 leading-6 text-muted-foreground">A taxa de {TICKET_FEE_PERCENT}% do EventMap é cobrada sobre o valor com desconto, não sobre o preço cheio. Quem compra paga menos e você recebe {100 - TICKET_FEE_PERCENT}% desse valor.</p>
        <p className="mt-2 font-medium leading-6" aria-live="polite">
          Ingresso {formatTicketAmount(example.priceCents)} com {couponDiscountLabel(exampleDiscount).replace(" off", " de desconto")} → comprador paga <span className="tabular-nums">{formatTicketAmount(example.finalCents)}</span>, você recebe <span className="tabular-nums text-emerald-700 dark:text-emerald-300">{formatTicketAmount(example.netCents)}</span> antes da tarifa do Mercado Pago.
        </p>
      </section>

      <form onSubmit={create} noValidate aria-labelledby={`${ids}-new`} className="space-y-4 rounded-[22px] border bg-card p-4 sm:p-5 shadow-[var(--em-shadow-card)]">
        <h3 id={`${ids}-new`} className="flex items-center gap-2 text-base font-semibold"><Plus className="size-4 text-brand" aria-hidden="true" />Novo cupom</h3>
        <div className="space-y-1.5">
          <label htmlFor={`${ids}-code`} className="block text-sm font-medium">Código</label>
          <input id={`${ids}-code`} value={form.code} onChange={(event) => update("code", event.target.value.toUpperCase())} maxLength={20} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="Ex.: AMIGOS10"
            aria-invalid={errors.code ? true : undefined} aria-describedby={describe("code", `${ids}-code-hint`)} className={cn(field, "font-mono uppercase placeholder:font-sans placeholder:normal-case")} />
          <p id={`${ids}-code-hint`} className="text-xs text-muted-foreground">3 a 20 letras, números, - ou _. Maiúsculas e minúsculas valem igual.</p>
          {errors.code && <p id={errorId("code")} className="text-sm text-destructive">{errors.code}</p>}
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Desconto</legend>
          <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)]">
            <div className="grid grid-cols-2 rounded-xl border p-1">
              {([["percent", "Porcentagem"], ["amount", "Valor (R$)"]] as const).map(([kind, label]) => <label key={kind} className={cn("flex min-h-9 cursor-pointer items-center justify-center rounded-full px-3 text-sm font-medium has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary", form.kind === kind ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                <input type="radio" name={`${ids}-kind`} value={kind} checked={form.kind === kind} onChange={() => update("kind", kind)} className="sr-only" />{label}
              </label>)}
            </div>
            <div className="relative">
              <label htmlFor={`${ids}-value`} className="sr-only">{form.kind === "percent" ? "Porcentagem de desconto" : "Valor do desconto em reais"}</label>
              {form.kind === "amount" && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">R$</span>}
              <input id={`${ids}-value`} inputMode={form.kind === "percent" ? "numeric" : "decimal"} value={form.value} onChange={(event) => update("value", event.target.value)} placeholder={form.kind === "percent" ? "10" : "15,00"}
                aria-invalid={errors.value ? true : undefined} aria-describedby={describe("value", `${ids}-value-hint`)} className={cn(field, "tabular-nums", form.kind === "amount" ? "pl-10" : "pr-9")} />
              {form.kind === "percent" && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">%</span>}
            </div>
          </div>
          <p id={`${ids}-value-hint`} className="text-xs text-muted-foreground">{form.kind === "percent" ? `De 1% a ${TICKET_COUPON_MAX_PERCENT}%.` : "A partir de R$ 1,00. O ingresso nunca sai por menos de R$ 1,00."}</p>
          {errors.value && <p id={errorId("value")} className="text-sm text-destructive">{errors.value}</p>}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor={`${ids}-maxUses`} className="block text-sm font-medium">Limite de usos <span className="font-normal text-muted-foreground">(opcional)</span></label>
            <input id={`${ids}-maxUses`} inputMode="numeric" value={form.maxUses} onChange={(event) => update("maxUses", event.target.value)} placeholder="Sem limite"
              aria-invalid={errors.maxUses ? true : undefined} aria-describedby={describe("maxUses")} className={cn(field, "tabular-nums")} />
            {errors.maxUses && <p id={errorId("maxUses")} className="text-sm text-destructive">{errors.maxUses}</p>}
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${ids}-expiresAt`} className="block text-sm font-medium">Válido até <span className="font-normal text-muted-foreground">(opcional)</span></label>
            <input id={`${ids}-expiresAt`} type="datetime-local" value={form.expiresAt} onChange={(event) => update("expiresAt", event.target.value)}
              aria-invalid={errors.expiresAt ? true : undefined} aria-describedby={describe("expiresAt")} className={field} />
            {errors.expiresAt && <p id={errorId("expiresAt")} className="text-sm text-destructive">{errors.expiresAt}</p>}
          </div>
        </div>

        <p aria-live="polite" className={formError ? "text-sm text-destructive" : "sr-only"}>{formError}</p>
        <button type="submit" disabled={creating} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-cta px-4 text-sm font-semibold text-cta-foreground hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-60 sm:w-auto">
          {creating ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}Criar cupom
        </button>
      </form>

      <section aria-labelledby={`${ids}-list`} className="space-y-3">
        <h3 id={`${ids}-list`} className="text-base font-semibold">Cupons deste evento</h3>
        {loading && !coupons ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Carregando cupons...</p>
          : loadError && !coupons ? <div role="alert" className="space-y-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm"><p>Não foi possível carregar os cupons agora.</p><button type="button" onClick={() => void load()} className={smallAction}>Tentar novamente</button></div>
            : coupons && coupons.length === 0 ? <p className="rounded-2xl border border-dashed p-5 text-center text-sm text-muted-foreground">Nenhum cupom ainda. Crie o primeiro acima e compartilhe o link com seu público.</p>
              : coupons && <ul className="space-y-3">{coupons.map((coupon) => {
                const status = couponStatus(coupon, now);
                const link = origin ? couponShareUrl(origin, eventId, coupon.code) : null;
                return <li key={coupon.id} className={cn("rounded-[22px] border bg-card p-4 shadow-[var(--em-shadow-card)]", !coupon.active && "bg-muted/30")}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2"><Tag className="size-4 shrink-0 text-brand" aria-hidden="true" /><span className="break-all font-mono text-base font-semibold">{coupon.code}</span><span className="text-sm font-medium">{couponDiscountLabel(coupon)}</span></p>
                      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                        {coupon.maxUses != null ? `${coupon.uses} de ${coupon.maxUses} usos` : `${coupon.uses} ${coupon.uses === 1 ? "uso" : "usos"} · sem limite`}
                        {" · "}{coupon.expiresAt ? `até ${dateTime.format(new Date(coupon.expiresAt))}` : "sem validade"}
                      </p>
                    </div>
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", status.tone === "active" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : status.tone === "warn" ? "bg-amber-500/10 text-amber-800 dark:text-amber-300" : "bg-muted text-muted-foreground")}>{status.label}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void copy(coupon.code, `Código ${coupon.code} copiado.`)} className={smallAction}><Copy className="size-4" aria-hidden="true" />Copiar código<span className="sr-only"> {coupon.code}</span></button>
                    <button type="button" onClick={() => void copy(link, "Link com cupom copiado.")} disabled={!link} className={smallAction}><Link2 className="size-4" aria-hidden="true" />Copiar link com cupom<span className="sr-only"> {coupon.code}</span></button>
                    <button type="button" onClick={() => void toggle(coupon)} disabled={toggling !== null} className={cn(smallAction, coupon.active ? "text-muted-foreground" : "border-primary/30 text-brand")}>
                      {toggling === coupon.id && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}{coupon.active ? "Desativar" : "Ativar"}<span className="sr-only"> cupom {coupon.code}</span>
                    </button>
                  </div>
                </li>;
              })}</ul>}
        <p className="text-xs leading-5 text-muted-foreground">Cupons desativados param de valer na hora, mas continuam na lista para o seu histórico. Um Pix gerado e não pago devolve o uso quando expira.</p>
      </section>
    </DialogContent>
  </Dialog>;
}
