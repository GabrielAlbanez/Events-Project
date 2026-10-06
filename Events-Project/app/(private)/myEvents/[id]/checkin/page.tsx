"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Camera, CheckCircle2, RefreshCcw, Users, X } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { FadeInView } from "@/components/animations/FadeInView";
import { StaggerList } from "@/components/animations/StaggerList";

type Attendee = {
  id: string;
  status: "CONFIRMED" | "CHECKED_IN" | "WAITLISTED" | "CANCELLED";
  createdAt: string;
  checkedInAt: string | null;
  user: { id: string; name: string | null; email: string };
};
type ApiError = { message?: string };
type QrDetector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };
type DetectorConstructor = new (options: { formats: string[] }) => QrDetector;

export default function CheckInPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [working, setWorking] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannedRef = useRef(false);

  const loadAttendees = useCallback(async () => {
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/check-in`, { cache: "no-store" });
      const data = await response.json() as Attendee[] | ApiError;
      if (!response.ok || !Array.isArray(data)) throw new Error(Array.isArray(data) ? "Não foi possível consultar inscrições." : data.message || "Não foi possível consultar inscrições.");
      setAttendees(data);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar inscrições.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const refresh = async () => {
      if (document.visibilityState === "visible") await loadAttendees();
      if (active) timer = window.setTimeout(() => { void refresh(); }, 10000);
    };
    void refresh();
    return () => { active = false; window.clearTimeout(timer); };
  }, [loadAttendees]);
  useEffect(() => () => { streamRef.current?.getTracks().forEach((track) => track.stop()); }, []);

  const registerCheckIn = useCallback(async (value: string) => {
    if (!value.trim() || working) return;
    setWorking(true);
    setFeedback("");
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: value.trim() }),
      });
      const data = await response.json() as ApiError & { user?: { name?: string | null } };
      if (!response.ok) throw new Error(data.message || "Não foi possível registrar a entrada.");
      setFeedback(`Entrada registrada${data.user?.name ? ` para ${data.user.name}` : ""}.`);
      setToken("");
      await loadAttendees();
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Não foi possível registrar a entrada.");
    } finally {
      setWorking(false);
      scannedRef.current = false;
    }
  }, [eventId, loadAttendees, working]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  async function startCamera() {
    setCameraError("");
    const Detector = (window as Window & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("Leitura por câmera indisponível neste navegador. Digite ou cole o código abaixo.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      setScanning(true);
    } catch {
      setCameraError("Não foi possível abrir a câmera. Verifique a permissão ou digite o código abaixo.");
    }
  }

  useEffect(() => {
    if (!scanning || !videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    void video.play().catch(() => setCameraError("Não foi possível iniciar o vídeo."));
    const Detector = (window as Window & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
    if (!Detector) return;
    const detector = new Detector({ formats: ["qr_code"] });
    let active = true;
    const timer = window.setInterval(() => {
      if (scannedRef.current || video.readyState < 2) return;
      void detector.detect(video).then((codes) => {
        const value = codes[0]?.rawValue;
        if (active && value && !scannedRef.current) {
          scannedRef.current = true;
          stopCamera();
          void registerCheckIn(value);
        }
      }).catch(() => undefined);
    }, 450);
    return () => { active = false; window.clearInterval(timer); };
  }, [scanning, registerCheckIn, stopCamera]);

  const confirmed = attendees.filter((entry) => entry.status === "CONFIRMED").length;
  const checkedIn = attendees.filter((entry) => entry.status === "CHECKED_IN").length;
  const waiting = attendees.filter((entry) => entry.status === "WAITLISTED").length;

  return <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10"><div className="mx-auto max-w-5xl space-y-6">
    <header className="flex items-start gap-4"><SidebarTrigger className="mt-1" /><div><Link href="/myEvents" className="text-sm font-semibold text-primary hover:underline">← Meus eventos</Link><FadeInView><h1 className="mt-2 text-3xl font-bold tracking-tight">Check-in do evento</h1><p className="mt-2 text-muted-foreground">Leia o QR Code apresentado pelo participante ou insira o código manualmente.</p></FadeInView></div></header>
    <StaggerList className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Confirmados</p><p className="mt-1 text-2xl font-bold">{confirmed}</p></div><div className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Entraram</p><p className="mt-1 text-2xl font-bold text-primary">{checkedIn}</p></div><div className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Lista de espera</p><p className="mt-1 text-2xl font-bold">{waiting}</p></div></StaggerList>
    <section aria-labelledby="scanner-title" className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6"><h2 id="scanner-title" className="text-xl font-semibold">Registrar entrada</h2><p className="mt-1 text-sm text-muted-foreground">O código expira em cinco minutos. Peça ao participante para abrir um novo se necessário.</p>
      {scanning ? <div className="mt-4 max-w-lg overflow-hidden rounded-xl border bg-black"><video ref={videoRef} playsInline muted className="aspect-video w-full object-cover" /><button type="button" onClick={stopCamera} className="flex min-h-11 w-full items-center justify-center gap-2 bg-card text-sm font-semibold"><X className="h-4 w-4" />Fechar câmera</button></div> : <button type="button" onClick={() => void startCamera()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"><Camera className="h-4 w-4" />Ler QR Code</button>}
      {cameraError && <p role="alert" className="mt-3 text-sm text-destructive">{cameraError}</p>}
      <form onSubmit={(event) => { event.preventDefault(); void registerCheckIn(token); }} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"><label htmlFor="checkin-token" className="grid min-w-0 flex-1 gap-2 text-sm font-medium">Código de entrada<input id="checkin-token" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Cole o código do participante" className="h-11 w-full rounded-xl border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label><button type="submit" disabled={working || !token.trim()} className="min-h-11 rounded-xl border border-primary bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{working ? "Validando..." : "Registrar entrada"}</button></form>
      {feedback && <p role="status" className="mt-3 text-sm font-medium">{feedback}</p>}
    </section>
    <section aria-labelledby="attendees-title" className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="attendees-title" className="flex items-center gap-2 text-xl font-semibold"><Users className="h-5 w-5 text-primary" />Participantes</h2><p className="mt-1 text-xs text-muted-foreground">A lista atualiza automaticamente enquanto esta página estiver aberta.</p></div><button type="button" onClick={() => { setLoading(true); void loadAttendees(); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium hover:bg-muted"><RefreshCcw className="h-4 w-4" />Atualizar</button></div>
      {loading ? <p role="status" className="mt-5 text-sm text-muted-foreground">Carregando inscrições...</p> : error ? <p role="alert" className="mt-5 text-sm text-destructive">{error}</p> : attendees.length === 0 ? <p className="mt-5 text-sm text-muted-foreground">Ainda não há inscrições neste evento.</p> : <ul className="mt-5 divide-y divide-border">{attendees.map((entry) => <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div className="min-w-0"><p className="break-words text-sm font-semibold">{entry.user.name || entry.user.email}</p><p className="break-all text-xs text-muted-foreground">{entry.user.email}</p></div><span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${entry.status === "CHECKED_IN" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : entry.status === "WAITLISTED" ? "bg-amber-500/10 text-amber-800 dark:text-amber-300" : "bg-primary/10 text-primary"}`}>{entry.status === "CHECKED_IN" && <CheckCircle2 className="h-3.5 w-3.5" />}{entry.status === "CHECKED_IN" ? "Entrada registrada" : entry.status === "WAITLISTED" ? "Espera" : "Confirmado"}</span></li>)}</ul>}
    </section>
  </div></main>;
}
