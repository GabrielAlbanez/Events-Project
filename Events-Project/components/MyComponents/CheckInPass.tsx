"use client";

import { useEffect, useState } from "react";

type TokenResponse = { token?: string; expiresAt?: number; message?: string };

type CheckInPassProps = {
  eventId: string;
  /** Extra ticket (2..N) of a paid order. Without it, the QR is the buyer's own registration. */
  passId?: string;
  /** E.g. "Ingresso 2 de 3". */
  label?: string;
};

export default function CheckInPass({ eventId, passId, label }: CheckInPassProps) {
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState("");
  const [token, setToken] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open || !expiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open, expiresAt]);
  useEffect(() => { setImage(""); setToken(""); setExpiresAt(0); setOpen(false); setError(""); }, [eventId, passId]);

  async function loadPass() {
    setLoading(true);
    setError("");
    try {
      const query = passId ? `?pass=${encodeURIComponent(passId)}` : "";
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/check-in-token${query}`, { cache: "no-store" });
      const data = await response.json() as TokenResponse;
      // Used or cancelled meanwhile: the QR on screen no longer gets anyone in. Network errors keep it visible.
      const ownTicketGone = response.status === 403 && Boolean(label) && !passId;
      if (response.status === 409 || ownTicketGone) { setOpen(false); setImage(""); setToken(""); setExpiresAt(0); }
      if (ownTicketGone) throw new Error("Não foi possível gerar este QR Code. Se este ingresso já passou pela entrada, ele não precisa de um novo código.");
      if (!response.ok || !data.token || !data.expiresAt) throw new Error(data.message || "Não foi possível gerar seu QR Code.");
      const QRCode = (await import("qrcode")).default;
      const qr = await QRCode.toDataURL(data.token, { width: 256, margin: 2, errorCorrectionLevel: "M" });
      setToken(data.token);
      setImage(qr);
      setExpiresAt(data.expiresAt);
      setNow(Date.now());
      setOpen(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível gerar seu QR Code.");
    } finally {
      setLoading(false);
    }
  }

  const expired = Boolean(expiresAt && now >= expiresAt);
  return <div className="space-y-3">
    <button type="button" disabled={loading} aria-expanded={open} onClick={() => open ? setOpen(false) : void loadPass()} className="min-h-11 rounded-xl border border-primary/30 bg-primary/5 px-4 text-sm font-semibold text-brand hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50">{loading ? "Gerando..." : open ? "Ocultar entrada" : "Mostrar QR Code para entrada"}{label && <span className="sr-only"> · {label}</span>}</button>
    {open && <div className="max-w-xs rounded-2xl border bg-card p-4 text-center shadow-sm">
      <p className="font-semibold">{label ?? "Sua entrada"}</p>
      <p className="mt-1 text-xs text-muted-foreground">Mostre este QR Code ao organizador. Ele expira em cinco minutos.</p>
      {image && !expired ? <img src={image} alt={`QR Code temporário para o check-in neste evento${label ? ` · ${label}` : ""}`} className="mx-auto mt-4 h-56 w-56 rounded-lg bg-white p-2" /> : <p role="status" className="mt-4 rounded-lg bg-muted p-4 text-sm">Código expirado. Gere outro para entrar.</p>}
      {!expired && <details className="mt-3 text-left text-xs"><summary className="cursor-pointer font-medium text-brand">Usar código manual</summary><p className="mt-2 break-all rounded-lg bg-muted p-2 font-mono select-all">{token}</p></details>}
      <button type="button" disabled={loading} onClick={() => void loadPass()} className="mt-4 min-h-11 rounded-xl border px-4 text-sm font-medium hover:bg-muted">Gerar novo código{label && <span className="sr-only"> · {label}</span>}</button>
    </div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
