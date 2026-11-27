"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, ExternalLink, Link2, Loader2, RefreshCw, ShieldCheck, Stethoscope, Unlink, XCircle } from "lucide-react";
import type { PixCheck, PixCheckStatus, PixDiagnosis } from "@/lib/services/pixDiagnostics";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = {
  /** Opens the panel's "Desconectar" confirmation. */
  onSwitchAccount: () => void;
  /** Starts the Mercado Pago connection again. */
  onReconnect: () => void;
  disabled: boolean;
};
type Mode = "check" | "test";

const MP_HELP_URL = "https://www.mercadopago.com.br/ajuda";
const statusStyle: Record<PixCheckStatus, { icon: typeof CheckCircle2; label: string; tone: string }> = {
  ok: { icon: CheckCircle2, label: "OK", tone: "text-emerald-700 dark:text-emerald-300" },
  warn: { icon: AlertTriangle, label: "Alerta", tone: "text-amber-700 dark:text-amber-300" },
  fail: { icon: XCircle, label: "Erro", tone: "text-destructive" },
};
const summaryStyle: Record<PixCheckStatus, string> = {
  ok: "border-emerald-600/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
  warn: "border-amber-600/30 bg-amber-500/10 text-amber-950 dark:text-amber-100",
  fail: "border-destructive/30 bg-destructive/10 text-foreground",
};
const timeFormat = new Intl.DateTimeFormat("pt-BR", { timeStyle: "short", timeZone: "America/Sao_Paulo" });

function newClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default function PixDiagnosticsCard({ onSwitchAccount, onReconnect, disabled }: Props) {
  const [diagnosis, setDiagnosis] = useState<PixDiagnosis | null>(null);
  const [running, setRunning] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmTest, setConfirmTest] = useState(false);
  const runningRef = useRef(false);

  const run = useCallback(async (action: Mode) => {
    if (runningRef.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError("Sem conexão com a internet. Conecte-se e tente de novo.");
      return;
    }
    runningRef.current = true;
    setRunning(action);
    setError(null);
    try {
      const response = await fetch("/api/tickets/pix-diagnostics", {
        method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, clientId: newClientId() }),
      });
      const data = await response.json().catch(() => null) as { diagnosis?: PixDiagnosis; message?: string } | null;
      if (!response.ok || !data?.diagnosis) {
        setError(data?.message || (response.status === 401 ? "Sua sessão expirou. Entre de novo para verificar." : "Não foi possível verificar agora. Tente novamente em alguns minutos."));
        return;
      }
      setDiagnosis(data.diagnosis);
    } catch (cause) {
      setError(cause instanceof TypeError ? "Sem conexão. Verifique sua internet e tente novamente." : "Não foi possível verificar agora. Tente novamente em alguns minutos.");
    } finally {
      runningRef.current = false;
      setRunning(null);
    }
  }, []);

  useEffect(() => { void run("check"); }, [run]);

  function actionButton(item: PixCheck) {
    const base = "min-h-11 w-full sm:w-auto";
    switch (item.action) {
      case "switch_account": return <Button type="button" size="sm" variant="outline" className={base} onClick={onSwitchAccount} disabled={disabled}><Unlink className="size-4" aria-hidden="true" />Desconectar e trocar de conta</Button>;
      case "reconnect": return <Button type="button" size="sm" variant="outline" className={base} onClick={onReconnect} disabled={disabled}><Link2 className="size-4" aria-hidden="true" />Reconectar</Button>;
      case "connect": return <Button type="button" size="sm" variant="outline" className={base} onClick={onReconnect} disabled={disabled}><Link2 className="size-4" aria-hidden="true" />Conectar Mercado Pago</Button>;
      case "pix_key_help": return <a href={MP_HELP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Ajuda do Mercado Pago<ExternalLink className="size-4" aria-hidden="true" /><span className="sr-only"> (abre em nova aba)</span></a>;
      case "retry": return <Button type="button" size="sm" variant="ghost" className={base} onClick={() => void run("check")} disabled={running !== null}><RefreshCw className="size-4" aria-hidden="true" />Verificar de novo</Button>;
      default: return null;
    }
  }

  const overall = diagnosis?.overall;
  const SummaryIcon = overall === "ok" && diagnosis?.verified ? ShieldCheck : overall ? statusStyle[overall].icon : AlertCircle;
  const busyLabel = running === "test" ? "Testando recebimento no Mercado Pago..." : "Verificando a conta no Mercado Pago...";

  return <section aria-labelledby="pix-diagnostics-title" className="rounded-[22px] border bg-card p-4 shadow-[var(--em-shadow-card)] sm:p-5">
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-brand"><Stethoscope className="size-5" aria-hidden="true" /></span>
      <div className="min-w-0">
        <h2 id="pix-diagnostics-title" className="text-lg font-semibold">Diagnóstico do Pix</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">Confira antes de vender se o Mercado Pago vai gerar o Pix para quem comprar seus ingressos.</p>
      </div>
    </div>

    <div aria-live="polite" aria-busy={running !== null} className="mt-4 space-y-3">
      {running && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />{busyLabel}</p>}
      {error && !running && <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm leading-6"><AlertCircle className="mt-1 size-4 shrink-0 text-destructive" aria-hidden="true" />{error}</p>}
      {diagnosis && <>
        <p data-testid="pix-diagnosis-summary" className={`flex items-start gap-2 rounded-xl border p-3 text-sm font-semibold leading-6 ${summaryStyle[diagnosis.overall]}`}>
          <SummaryIcon className="mt-1 size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{diagnosis.headline}<span className="block text-xs font-normal opacity-80">Verificado às {timeFormat.format(new Date(diagnosis.checkedAt))}</span></span>
        </p>
        <ul className="divide-y rounded-2xl border">{diagnosis.checks.map((item) => {
          const style = statusStyle[item.status];
          const Icon = style.icon;
          const button = actionButton(item);
          return <li key={item.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:p-4">
            <div className="flex min-w-0 items-start gap-2.5">
              <Icon className={`mt-0.5 size-5 shrink-0 ${style.tone}`} aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{item.title}<span className={`ml-2 text-xs font-semibold ${style.tone}`}>{style.label}</span></p>
                <p className="mt-0.5 break-words text-sm leading-6 text-muted-foreground">{item.message}</p>
              </div>
            </div>
            {button && item.status !== "ok" && <div className="shrink-0 pl-7 sm:pl-0">{button}</div>}
          </li>;
        })}</ul>
      </>}
    </div>

    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={() => void run("check")} disabled={running !== null}>
        {running === "check" ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}Verificar agora
      </Button>
      <Button type="button" className="min-h-11 w-full whitespace-normal text-center sm:w-auto" onClick={() => setConfirmTest(true)} disabled={running !== null}>
        {running === "test" ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}Testar recebimento (R$ 1,00, cancelado na hora)
      </Button>
    </div>

    <Dialog open={confirmTest} onOpenChange={setConfirmTest}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-6">Testar recebimento por Pix?</DialogTitle>
          <DialogDescription>O EventMap pede ao Mercado Pago um Pix de R$ 1,00 na sua conta, com a mesma taxa dos ingressos, e cancela na hora. O QR Code não é mostrado a ninguém e nenhum valor é cobrado. Você pode fazer até 5 testes por hora.</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => setConfirmTest(false)}>Voltar</Button>
          <Button type="button" onClick={() => { setConfirmTest(false); void run("test"); }}>Fazer o teste</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
