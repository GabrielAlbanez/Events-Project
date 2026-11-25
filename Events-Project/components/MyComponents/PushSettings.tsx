"use client";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { BellRing, BellOff, Smartphone, X } from "lucide-react";
import { toast, type TypeOptions } from "react-toastify";
import { Button } from "@/components/ui/button";

function applicationKey(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

async function withDeadline<T>(operation: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new PushTimeout(message)), 12000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

class PushTimeout extends Error {}

function reusePending<T>(ref: { current: Promise<T> | null }, start: () => Promise<T>) {
  if (ref.current) return ref.current;
  const operation = start();
  ref.current = operation;
  const clear = () => { if (ref.current === operation) ref.current = null; };
  void operation.then(clear, clear);
  return operation;
}

/** compact: a dismissible one-line invitation shown only while avisos are off and can be enabled. */
export default function PushSettings({ variant = "full" }: { variant?: "full" | "compact" }) {
  const compact = variant === "compact";
  const [dismissed, setDismissed] = useState(false);
  const { data: session, status } = useSession();
  const identity = useRef(session?.user?.id);
  identity.current = status === "authenticated" ? session?.user?.id : undefined;
  const mounted = useRef(true);
  const pending = useRef(false);
  const toggleAttempt = useRef(0);
  const pendingPermission = useRef<Promise<NotificationPermission> | null>(null);
  const pendingSubscription = useRef<Promise<PushSubscription> | null>(null);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout>>();
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const notify = (text: string, type: TypeOptions) => toast(text, { type, toastId: `push:${text}` });
  useEffect(() => {
    let active = true; mounted.current = true; pending.current = false;
    toggleAttempt.current += 1;
    const available = window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(available); setSubscribed(false); setPublicKey(null); setBusy(false); setCooldown(false); setLoading(available);
    if (!available || status !== "authenticated") { setLoading(false); return; }
    const permissionChanged = () => { if (active) setPermission(Notification.permission); };
    permissionChanged(); window.addEventListener("focus", permissionChanged);
    async function load() {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) void registration.update().catch(() => undefined);
        const subscription = await registration?.pushManager.getSubscription();
        const endpoint = subscription?.endpoint;
        const response = await fetch("/api/push/subscriptions" + (endpoint ? "?endpoint=" + encodeURIComponent(endpoint) : ""));
        if (!response.ok) throw new Error();
        const data: { publicKey: string | null; subscribed: boolean } = await response.json();
        if (active) { setPublicKey(data.publicKey); setSubscribed(Boolean(subscription) && data.subscribed); }
      } catch { if (active && !compact) notify("Não foi possível consultar os avisos deste navegador. Recarregue a página para tentar novamente.", "error"); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; mounted.current = false; clearTimeout(cooldownTimer.current); window.removeEventListener("focus", permissionChanged); };
  }, [status, session?.user?.id, compact]);
  async function toggle() {
    if (!supported || (!publicKey && !subscribed) || pending.current || !identity.current) return;
    const requestedIdentity = identity.current;
    const attempt = ++toggleAttempt.current;
    const isCurrent = () => attempt === toggleAttempt.current && requestedIdentity === identity.current && mounted.current;
    pending.current = true; setBusy(true);
    try {
      if (subscribed) {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          const response = await fetch("/api/push/subscriptions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
          const result: { success: boolean; message?: string } = await response.json();
          if (!response.ok || !result.success) throw new Error();
          await subscription.unsubscribe();
        }
        if (isCurrent()) { setSubscribed(false); notify("Avisos desativados neste navegador. Sua central continua disponível.", "success"); }
      } else {
        const granted = await withDeadline(
          reusePending(pendingPermission, () => Notification.requestPermission()),
          "O navegador ainda não respondeu. Confira o pedido de permissão e tente novamente.",
        );
        if (!isCurrent()) return;
        setPermission(granted);
        if (granted !== "granted") { notify("Você continua recebendo suas novidades nesta central.", "info"); return; }
        if (!publicKey) return;
        const workerTimeout = "O navegador demorou para preparar os avisos. Tente novamente.";
        await withDeadline(navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }), workerTimeout);
        if (!isCurrent()) return;
        const registration = await withDeadline(navigator.serviceWorker.ready, workerTimeout);
        if (!isCurrent()) return;
        const existing = await withDeadline(registration.pushManager.getSubscription(), workerTimeout);
        if (!isCurrent()) return;
        const subscription = existing ?? await withDeadline(
          reusePending(pendingSubscription, () => registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationKey(publicKey),
          })),
          "O navegador demorou para criar a inscrição. Tente novamente.",
        );
        if (!isCurrent()) return;
        const response = await fetch("/api/push/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
        const result: { success: boolean; message?: string } = await response.json();
        if (!response.ok || !result.success) throw new Error();
        if (isCurrent()) { setSubscribed(true); notify("Pronto. Os avisos desta conta estão ativos neste navegador.", "success"); }
      }
    } catch (error) {
      if (isCurrent()) notify(error instanceof PushTimeout
        ? error.message
        : "Não foi possível atualizar os avisos. Confira sua conexão e tente novamente.", "error");
    } finally {
      if (isCurrent()) { pending.current = false; setBusy(false); }
    }
  }
  async function sendTest() {
    if (pending.current || cooldown || !subscribed || !identity.current) return;
    const account = identity.current; pending.current = true; setBusy(true);
    try {
      const response = await fetch("/api/push/test", { method: "POST" });
      const result: { success?: boolean } = await response.json();
      if (account !== identity.current || !mounted.current) return;
      if (response.status === 429) notify("Aguarde um minuto antes de enviar outro teste.", "warning");
      else if (!response.ok || !result.success) throw new Error();
      else notify("Teste solicitado. Aguarde o aviso; a entrega depende da permissão e da conexão do dispositivo.", "success");
      setCooldown(true); cooldownTimer.current = setTimeout(() => { if (mounted.current && account === identity.current) setCooldown(false); }, 60000);
    } catch { if (account === identity.current && mounted.current) notify("Não foi possível enviar o teste. Confira se os avisos estão ativos e tente novamente.", "error"); }
    finally { if (account === identity.current && mounted.current) { pending.current = false; setBusy(false); } }
  }
  const blocked = supported && permission === "denied";
  const description = !supported ? "Este navegador não oferece avisos fora do site. No iPhone, experimente adicionar o EventMap à tela inicial. A central funciona normalmente." : blocked ? "As notificações estão bloqueadas pelo navegador. Para ativá-las, permita os avisos nas configurações deste site." : subscribed ? "Você recebe novidades desta conta neste dispositivo. Sem precisar deixar a página aberta." : "Receba lembretes e novidades fora do site. Você decide quando ativar e pode desativar a qualquer momento.";
  const Icon = blocked ? BellOff : subscribed ? BellRing : Smartphone;
  if (compact) {
    // Unsupported browsers (iPhone outside the Home Screen) get the install hint; enabled or blocked states stay quiet.
    if (loading || dismissed || subscribed || blocked || (supported && !publicKey)) return null;
    return <section aria-label="Avisos de novas mensagens" className="mx-3 mb-3 flex items-start gap-3 rounded-[18px] border border-primary/20 bg-primary/5 p-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-brand"><BellRing className="size-[18px]" aria-hidden="true" /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Saiba quando chegar mensagem</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{supported ? "Ative os avisos neste dispositivo. O texto das conversas nunca aparece na notificação." : "No iPhone, adicione o EventMap à Tela de Início (Compartilhar → Adicionar à Tela de Início) para receber avisos."}</p>{supported && <Button size="sm" className="mt-2 min-h-11 rounded-full bg-cta px-4 text-cta-foreground hover:bg-cta/90" disabled={busy} onClick={() => void toggle()}>{busy ? "Aguarde…" : "Ativar notificações"}</Button>}</div><button type="button" onClick={() => setDismissed(true)} aria-label="Dispensar convite de notificações" className="-mr-1 -mt-1 grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><X className="size-4" aria-hidden="true" /></button></section>;
  }
  return <section aria-label="Avisos neste dispositivo" className="rounded-[22px] border bg-card p-4 sm:p-5 shadow-[var(--em-shadow-card)]"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><Icon className="size-[18px]" aria-hidden="true" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">Avisos neste dispositivo</h2>{!loading && subscribed && !blocked && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">Ativos</span>}</div><p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>{loading ? <div className="mt-3 h-3 w-36 rounded bg-muted motion-safe:animate-pulse" role="status" aria-label="Consultando avisos" /> : supported && !publicKey && !subscribed ? <p className="mt-3 text-xs leading-5 text-muted-foreground">Os avisos fora do site estão temporariamente indisponíveis. Suas notificações continuam nesta central.</p> : supported && (!blocked || subscribed) ? <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void toggle()}>{busy ? "Aguarde…" : subscribed ? "Desativar avisos" : "Ativar avisos"}</Button>{subscribed && !blocked && <Button variant="ghost" className="min-h-11" disabled={busy || cooldown} onClick={() => void sendTest()}>{cooldown ? "Aguarde para testar novamente" : "Enviar notificação de teste"}</Button>}</div> : null}</div></div></section>;
}
