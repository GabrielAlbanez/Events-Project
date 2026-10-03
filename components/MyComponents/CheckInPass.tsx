"use client";

import { useEffect, useState } from "react";

type TokenResponse = { token?: string; expiresAt?: number; message?: string };

export default function CheckInPass({ eventId }: { eventId: string }) {
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
  useEffect(() => { setImage(""); setToken(""); setExpiresAt(0); setOpen(false); }, [eventId]);

  async function loadPass() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/check-in-token`, { cache: "no-store" });
      const data = await response.json() as TokenResponse;
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
    <button type="button" disabled={loading} onClick={() => open ? setOpen(false) : void loadPass()} className="min-h-11 rounded-xl border border-primary/30 bg-primary/5 px-4 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-50">{loading ? "Gerando..." : open ? "Ocultar entrada" : "Mostrar QR Code para entrada"}</button>
    {open && <div className="max-w-xs rounded-2xl border bg-card p-4 text-center shadow-sm">
      <p className="font-semibold">Sua entrada</p>
      <p className="mt-1 text-xs text-muted-foreground">Mostre este QR Code ao organizador. Ele expira em cinco minutos.</p>
      {image && !expired ? <img src={image} alt="QR Code temporário para o check-in neste evento" className="mx-auto mt-4 h-56 w-56 rounded-lg bg-white p-2" /> : <p role="status" className="mt-4 rounded-lg bg-muted p-4 text-sm">Código expirado. Gere outro para entrar.</p>}
      {!expired && <details className="mt-3 text-left text-xs"><summary className="cursor-pointer font-medium text-primary">Usar código manual</summary><p className="mt-2 break-all rounded-lg bg-muted p-2 font-mono select-all">{token}</p></details>}
      <button type="button" disabled={loading} onClick={() => void loadPass()} className="mt-4 min-h-11 rounded-xl border px-4 text-sm font-medium hover:bg-muted">Gerar novo código</button>
    </div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
