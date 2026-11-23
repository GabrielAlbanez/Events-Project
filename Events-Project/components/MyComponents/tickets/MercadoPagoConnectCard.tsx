"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, RefreshCw, Wallet } from "lucide-react";
import { getTicketSellerStatus, startMercadoPagoConnect } from "@/app/(actions)/tickets/action";
import { Button } from "@/components/ui/button";

export const MERCADOPAGO_CHANNEL = "eventmap-mercadopago";
export const MERCADOPAGO_CONNECTED_MESSAGE = "connected";

export type SellerStatus = { configured: boolean; connected: boolean };
type ConnectPhase = "idle" | "opening" | "waiting";
type ConnectNotice = { kind: "blocked" } | { kind: "error"; text: string } | { kind: "pending" } | { kind: "check-failed" } | null;

const REQUEST_TIMEOUT_MS = 15000;
const connectError = "Não foi possível abrir a conexão com o Mercado Pago. Nada do que você preencheu foi perdido. Tente novamente.";

/** A request that never settles must not leave the card waiting forever. */
function withTimeout<T>(request: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("timeout")), REQUEST_TIMEOUT_MS);
    request.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error: unknown) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

/** Connection state lives in the form, so switching "evento gratuito" on and off does not lose a connection in progress. */
export function useMercadoPagoConnect(onConnectedFromForm: () => void) {
  const [status, setStatus] = useState<SellerStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [phase, setPhase] = useState<ConnectPhase>("idle");
  const [notice, setNotice] = useState<ConnectNotice>(null);
  const [checking, setChecking] = useState(false);
  const [connectedHere, setConnectedHere] = useState(false);
  const mounted = useRef(true);
  const opening = useRef(false);
  const requestedHere = useRef(false);
  const latestCheck = useRef(0);
  const onConnected = useRef(onConnectedFromForm);
  onConnected.current = onConnectedFromForm;

  /** Returns the server's answer, null on failure, or undefined when a newer check replaced this one. */
  const refresh = useCallback(async (): Promise<SellerStatus | null | undefined> => {
    const check = ++latestCheck.current;
    try {
      const result = await withTimeout(getTicketSellerStatus());
      if (!mounted.current || check !== latestCheck.current) return undefined;
      if (!result.success) { setLoadFailed(true); return null; }
      setStatus(result.data);
      setLoadFailed(false);
      return result.data;
    } catch {
      if (!mounted.current || check !== latestCheck.current) return undefined;
      setLoadFailed(true);
      return null;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; };
  }, [refresh]);

  useEffect(() => {
    if (!status?.connected) return;
    setPhase("idle");
    setNotice(null);
    if (!requestedHere.current) return;
    requestedHere.current = false;
    setConnectedHere(true);
    onConnected.current();
  }, [status?.connected]);

  // The tab that finished the OAuth flow announces it; browsers without BroadcastChannel rely on focus and the manual check.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    let channel: BroadcastChannel;
    try { channel = new BroadcastChannel(MERCADOPAGO_CHANNEL); } catch { return; }
    channel.onmessage = (event: MessageEvent) => { if (event.data === MERCADOPAGO_CONNECTED_MESSAGE) void refresh(); };
    return () => { channel.onmessage = null; channel.close(); };
  }, [refresh]);

  useEffect(() => {
    if (phase !== "waiting") return;
    const recheck = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => { window.removeEventListener("focus", recheck); document.removeEventListener("visibilitychange", recheck); };
  }, [phase, refresh]);

  const connect = async () => {
    if (opening.current) return;
    opening.current = true;
    setNotice(null);
    // Must happen inside the click: mobile browsers and popup blockers refuse a window opened after an await.
    let popup: Window | null = null;
    try { popup = window.open("", "_blank"); } catch { popup = null; }
    if (!popup) {
      opening.current = false;
      requestedHere.current = true;
      setPhase("waiting");
      setNotice({ kind: "blocked" });
      return;
    }
    try {
      popup.opener = null;
      popup.document.title = "Abrindo o Mercado Pago";
      popup.document.body.textContent = "Abrindo o Mercado Pago...";
    } catch { /* the blank tab still works without the message */ }
    setPhase("opening");
    try {
      const result = await withTimeout(startMercadoPagoConnect());
      if (!mounted.current) { popup.close(); return; }
      if (!result.success) {
        popup.close();
        setPhase("idle");
        setNotice({ kind: "error", text: result.message === "Acesso negado." ? "Sua conta não pode conectar o Mercado Pago. Você ainda pode divulgar o evento com um link de ingressos externo." : result.message || connectError });
        return;
      }
      requestedHere.current = true;
      popup.location.href = result.data.url;
      setPhase("waiting");
    } catch {
      try { popup.close(); } catch { /* already closed */ }
      if (mounted.current) { setPhase("idle"); setNotice({ kind: "error", text: connectError }); }
    } finally {
      opening.current = false;
    }
  };

  const checkNow = async () => {
    setChecking(true);
    setNotice((current) => current?.kind === "blocked" ? current : null);
    const result = await refresh();
    if (!mounted.current) return;
    setChecking(false);
    if (result === null) setNotice({ kind: "check-failed" });
    else if (result && !result.connected) setNotice((current) => current?.kind === "blocked" ? current : { kind: "pending" });
  };

  return { status, loadFailed, phase, notice, checking, connectedHere, connect, checkNow, retryLoad: refresh };
}

export type MercadoPagoConnection = ReturnType<typeof useMercadoPagoConnect>;

const paymentsHref = "/myEvents/pagamentos";

export default function MercadoPagoConnectCard({ connection }: { connection: MercadoPagoConnection }) {
  const { status, loadFailed, phase, notice, checking, connectedHere, connect, checkNow, retryLoad } = connection;

  if (status === null) {
    return loadFailed
      ? <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-sm">Não foi possível consultar sua conta de pagamentos. O que você preencheu continua aqui.</p>
        <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => void retryLoad()}><RefreshCw className="size-4" aria-hidden="true" />Tentar novamente</Button>
      </div>
      : <p role="status" className="text-sm text-muted-foreground">Consultando sua conta de pagamentos...</p>;
  }
  if (!status.configured) return <p className="text-sm text-muted-foreground">Pagamentos ainda não configurados no EventMap. Por enquanto, use um link de ingressos externo.</p>;
  if (status.connected) {
    return <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-600/30 bg-emerald-500/10 p-4">
      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-semibold">Mercado Pago conectado</p>
        <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{connectedHere ? "A venda pelo EventMap foi ativada neste evento. O que você preencheu continua aqui." : "Você já pode vender ingressos pelo EventMap neste evento."}</p>
      </div>
    </div>;
  }

  const waiting = phase === "waiting";
  return <section aria-labelledby="mp-connect-title" className="rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-brand"><Wallet className="size-5" aria-hidden="true" /></span>
      <div className="min-w-0">
        <h3 id="mp-connect-title" className="text-base font-semibold">Para vender pelo EventMap, conecte sua conta do Mercado Pago</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">Você conecta para receber e acompanhar as vendas. Quem compra paga só com Pix, sem precisar de conta.</p>
      </div>
    </div>

    {waiting
      ? <div className="mt-4 space-y-3">
        <p role="status" className="flex items-center gap-2 text-sm font-semibold"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Aguardando conexão...</p>
        <p className="text-sm leading-6 text-muted-foreground">Conclua a autorização na outra aba e volte para cá. O que você preencheu continua aqui.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" className="w-full sm:w-auto" disabled={checking} onClick={() => void checkNow()}>{checking ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}Já conectei</Button>
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => void connect()}><ExternalLink className="size-4" aria-hidden="true" />Abrir de novo</Button>
        </div>
      </div>
      : <div className="mt-4 space-y-2">
        <Button type="button" className="w-full sm:w-auto" disabled={phase === "opening"} onClick={() => void connect()}>{phase === "opening" ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ExternalLink className="size-4" aria-hidden="true" />}{phase === "opening" ? "Abrindo..." : notice?.kind === "error" ? "Tentar novamente" : "Conectar Mercado Pago"}</Button>
        <p className="text-sm leading-6 text-muted-foreground">Abre em uma nova aba. O que você preencheu continua aqui.</p>
      </div>}

    {notice?.kind === "blocked" && <p role="alert" className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm leading-6 text-amber-900 dark:text-amber-200">O navegador bloqueou a nova aba. <a href={paymentsHref} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Abrir Pagamentos em nova aba</a></p>}
    {notice?.kind === "error" && <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm leading-6"><AlertCircle className="mt-1 size-4 shrink-0" aria-hidden="true" />{notice.text}</p>}
    {notice?.kind === "pending" && <p role="status" className="mt-3 rounded-lg bg-background px-3 py-2 text-sm leading-6">Ainda não identificamos a conexão. Conclua a autorização na outra aba ou abra de novo.</p>}
    {notice?.kind === "check-failed" && <p role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm leading-6">Não foi possível confirmar agora. Toque em “Já conectei” para tentar de novo.</p>}

    <p className="mt-4 border-t border-primary/15 pt-3 text-sm leading-6 text-muted-foreground"><strong className="font-medium text-foreground">Vende em outro site?</strong> Não precisa conectar: deixe a venda pelo EventMap desmarcada e informe o link de ingressos abaixo.</p>
  </section>;
}
