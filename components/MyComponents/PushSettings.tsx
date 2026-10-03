"use client";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
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
  identity.current = session?.user?.id;
  const [supported, setSupported] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    const available = window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(available);
    setSubscribed(false);
    setPublicKey(null);
    setMessage("");
    if (!available || status !== "authenticated") return;
    async function load() {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        const endpoint = subscription?.endpoint;
        const response = await fetch("/api/push/subscriptions" + (endpoint ? "?endpoint=" + encodeURIComponent(endpoint) : ""));
        if (!response.ok) throw new Error();
        const data: { publicKey: string | null; subscribed: boolean } = await response.json();
        if (active) { setPublicKey(data.publicKey); setSubscribed(Boolean(subscription) && data.subscribed); }
      } catch { if (active) setMessage("Não foi possível consultar os avisos deste navegador."); }
    }
    void load();
    return () => { active = false; };
  }, [status, session?.user?.id]);
  async function toggle() {
    if (!supported || (!publicKey && !subscribed)) return;
    const requestedIdentity = identity.current;
    setBusy(true);
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
        if (requestedIdentity === identity.current) { setSubscribed(false); setMessage("Avisos deste navegador desativados."); }
      } else {
        const permission = await Notification.requestPermission();
        if (requestedIdentity !== identity.current) return;
        if (permission !== "granted") { setMessage("Permissão não concedida. Você pode continuar consultando a central de notificações."); return; }
        const registration = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(publicKey!) });
        if (requestedIdentity !== identity.current) { await subscription.unsubscribe(); return; }
        const response = await fetch("/api/push/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
        const result: { success: boolean; message?: string } = await response.json();
        if (!response.ok || !result.success) throw new Error();
        if (requestedIdentity === identity.current) { setSubscribed(true); setMessage("Avisos ativados para esta conta neste navegador."); }
      }
    } catch { if (requestedIdentity === identity.current) setMessage("Não foi possível alterar os avisos. Verifique a permissão e tente novamente."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border bg-card p-5">
    <h2 className="font-semibold">Avisos neste navegador</h2>
    <p className="mt-2 text-sm text-muted-foreground">Opcional: receba avisos mesmo com o site fechado, quando seu navegador permitir. Lembretes e mudanças também ficam nesta central.</p>
    {!supported ? <p className="mt-3 text-sm text-muted-foreground">Recurso indisponível neste navegador ou endereço. Use HTTPS; localhost também é aceito. No iPhone, pode ser necessário adicionar o site à tela inicial.</p> : !publicKey && !subscribed ? <p className="mt-3 text-sm text-muted-foreground">O envio de avisos ainda não está configurado neste ambiente.</p> : <button type="button" disabled={busy} onClick={() => void toggle()} className="mt-4 min-h-11 rounded-xl border px-4 text-sm font-semibold hover:bg-muted">{busy ? "Atualizando..." : subscribed ? "Desativar avisos" : "Ativar avisos neste navegador"}</button>}
    <p role="status" className="mt-3 text-sm">{message}</p>
  </section>;
}
