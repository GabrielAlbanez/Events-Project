"use client";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { BellRing, BellOff, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

function applicationKey(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

export default function PushSettings() {
  const { data: session, status } = useSession();
  const identity = useRef(session?.user?.id);
  identity.current = status === "authenticated" ? session?.user?.id : undefined;
  const mounted = useRef(true);
  const pending = useRef(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout>>();
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true; mounted.current = true; pending.current = false;
    const available = window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(available); setSubscribed(false); setPublicKey(null); setMessage(""); setBusy(false); setCooldown(false); setLoading(available);
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
      } catch { if (active) setMessage("Não foi possível consultar os avisos deste navegador. Recarregue a página para tentar novamente."); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; mounted.current = false; clearTimeout(cooldownTimer.current); window.removeEventListener("focus", permissionChanged); };
  }, [status, session?.user?.id]);
  async function toggle() {
    if (!supported || (!publicKey && !subscribed) || pending.current || !identity.current) return;
    const requestedIdentity = identity.current;
    pending.current = true; setBusy(true); setMessage("");
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
        if (requestedIdentity === identity.current && mounted.current) { setSubscribed(false); setMessage("Avisos desativados neste navegador. Sua central continua disponível."); }
      } else {
        const granted = await Notification.requestPermission();
        if (requestedIdentity !== identity.current || !mounted.current) return;
        setPermission(granted);
        if (granted !== "granted") { setMessage("Você continua recebendo suas novidades nesta central."); return; }
        const registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
        await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(publicKey!) });
        if (requestedIdentity !== identity.current || !mounted.current) { await subscription.unsubscribe(); return; }
        const response = await fetch("/api/push/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
        const result: { success: boolean; message?: string } = await response.json();
        if (!response.ok || !result.success) throw new Error();
        if (requestedIdentity === identity.current && mounted.current) { setSubscribed(true); setMessage("Pronto. Os avisos desta conta estão ativos neste navegador."); }
      }
    } catch { if (requestedIdentity === identity.current && mounted.current) setMessage("Não foi possível atualizar os avisos. Confira sua conexão e tente novamente."); }
    finally { if (requestedIdentity === identity.current && mounted.current) { pending.current = false; setBusy(false); } }
  }
  async function sendTest() {
    if (pending.current || cooldown || !subscribed || !identity.current) return;
    const account = identity.current; pending.current = true; setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/push/test", { method: "POST" });
      const result: { success?: boolean } = await response.json();
      if (account !== identity.current || !mounted.current) return;
      if (response.status === 429) setMessage("Aguarde um minuto antes de enviar outro teste.");
      else if (!response.ok || !result.success) throw new Error();
      else setMessage("Teste solicitado. Aguarde o aviso; a entrega depende da permissão e da conexão do dispositivo.");
      setCooldown(true); cooldownTimer.current = setTimeout(() => { if (mounted.current && account === identity.current) setCooldown(false); }, 60000);
    } catch { if (account === identity.current && mounted.current) setMessage("Não foi possível enviar o teste. Confira se os avisos estão ativos e tente novamente."); }
    finally { if (account === identity.current && mounted.current) { pending.current = false; setBusy(false); } }
  }
  const blocked = supported && permission === "denied";
  const description = !supported ? "Este navegador não oferece avisos fora do site. No iPhone, experimente adicionar o EventMap à tela inicial. A central funciona normalmente." : blocked ? "As notificações estão bloqueadas pelo navegador. Para ativá-las, permita os avisos nas configurações deste site." : subscribed ? "Você recebe novidades desta conta neste dispositivo. Sem precisar deixar a página aberta." : "Receba lembretes e novidades fora do site. Você decide quando ativar e pode desativar a qualquer momento.";
  const Icon = blocked ? BellOff : subscribed ? BellRing : Smartphone;
  return <section aria-label="Avisos neste dispositivo" className="rounded-2xl border bg-card p-4 sm:p-5"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><Icon className="size-[18px]" aria-hidden="true" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">Avisos neste dispositivo</h2>{!loading && subscribed && !blocked && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">Ativos</span>}</div><p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>{loading ? <div className="mt-3 h-3 w-36 rounded bg-muted motion-safe:animate-pulse" role="status" aria-label="Consultando avisos" /> : supported && !publicKey && !subscribed ? <p className="mt-3 text-xs leading-5 text-muted-foreground">Os avisos fora do site estão temporariamente indisponíveis. Suas notificações continuam nesta central.</p> : supported && (!blocked || subscribed) ? <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void toggle()}>{busy ? "Aguarde…" : subscribed ? "Desativar avisos" : "Ativar avisos"}</Button>{subscribed && !blocked && <Button variant="ghost" className="min-h-11" disabled={busy || cooldown} onClick={() => void sendTest()}>{cooldown ? "Aguarde para testar novamente" : "Enviar notificação de teste"}</Button>}</div> : null}{message && <p role="status" aria-live="polite" className="mt-3 text-sm leading-6">{message}</p>}</div></div></section>;
}
