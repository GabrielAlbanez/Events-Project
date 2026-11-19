"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Camera, CheckCircle2, Download, RefreshCcw, Search, ShieldCheck, UserCheck, Users, X } from "lucide-react";
import { FadeInView } from "@/components/animations/FadeInView";
import { StaggerList } from "@/components/animations/StaggerList";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Attendee = {
  id: string;
  status: "CONFIRMED" | "CHECKED_IN" | "WAITLISTED" | "CANCELLED";
  createdAt: string;
  checkedInAt: string | null;
  user: { id: string; name: string | null; email: string | null };
};
type Overview = {
  event: { id: string; nome: string; status: string; capacity: number | null };
  access: { role: "ADMIN" | "OWNER" | "TEAM"; canExport: boolean };
  counts: { confirmed: number; checkedIn: number; waitlisted: number };
  attendees: Attendee[];
};
type ApiError = { message?: string };
type QrDetector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };
type DetectorConstructor = new (options: { formats: string[] }) => QrDetector;

const statusLabel: Record<Attendee["status"], string> = { CHECKED_IN: "Entrada registrada", WAITLISTED: "Espera", CONFIRMED: "Confirmado", CANCELLED: "Cancelado" };
const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function isOverview(value: unknown): value is Overview {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<Overview>;
  return Array.isArray(data.attendees) && !!data.counts && !!data.access && !!data.event;
}

export default function CheckInPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const apiBase = `/api/events/${encodeURIComponent(eventId)}`;
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [working, setWorking] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [query, setQuery] = useState("");
  const [pendingManual, setPendingManual] = useState<Attendee | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannedRef = useRef(false);

  const loadAttendees = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/check-in?detalhes=1`, { cache: "no-store" });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok || !isOverview(data)) throw new Error((data as ApiError | null)?.message || "Não foi possível consultar inscrições.");
      setOverview(data);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar inscrições.");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

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

  const submitCheckIn = useCallback(async (body: { token: string } | { registrationId: string }) => {
    if (working) return;
    setWorking(true);
    setFeedback("");
    try {
      const response = await fetch(`${apiBase}/check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({})) as ApiError & { user?: { name?: string | null } };
      if (!response.ok) throw new Error(data.message || "Não foi possível registrar a entrada.");
      setFeedback(`Entrada registrada${data.user?.name ? ` para ${data.user.name}` : ""}.`);
      if ("token" in body) setToken("");
      await loadAttendees();
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Não foi possível registrar a entrada.");
    } finally {
      setWorking(false);
      scannedRef.current = false;
    }
  }, [apiBase, loadAttendees, working]);

  const registerCheckIn = useCallback(async (value: string) => {
    if (!value.trim()) return;
    await submitCheckIn({ token: value.trim() });
  }, [submitCheckIn]);

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

  async function exportCsv() {
    setExporting(true);
    setExportError("");
    try {
      const response = await fetch(`${apiBase}/attendees`, { cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as ApiError;
        throw new Error(data.message || "Não foi possível exportar os participantes.");
      }
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "participantes.csv";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : "Não foi possível exportar os participantes.");
    } finally {
      setExporting(false);
    }
  }

  const attendees = useMemo(() => overview?.attendees ?? [], [overview]);
  const counts = overview?.counts ?? { confirmed: 0, checkedIn: 0, waitlisted: 0 };
  const team = overview?.access.role === "TEAM";
  const filtered = useMemo(() => {
    const term = normalize(query);
    if (!term) return attendees;
    return attendees.filter((entry) => normalize(entry.user.name ?? "").includes(term) || normalize(entry.user.email ?? "").includes(term));
  }, [attendees, query]);

  return <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10"><div className="mx-auto max-w-5xl space-y-6">
    <header className="flex items-start gap-4"><div className="min-w-0"><Link href={team ? `/eventos/${encodeURIComponent(eventId)}/comunidade` : "/myEvents"} className="text-sm font-semibold text-brand hover:underline">{team ? "← Comunidade do evento" : "← Meus eventos"}</Link><FadeInView><h1 className="mt-2 text-3xl font-bold tracking-tight">Check-in do evento</h1>{overview && <p className="mt-1 break-words text-base font-medium">{overview.event.nome}</p>}<p className="mt-2 text-muted-foreground">Leia o QR Code apresentado pelo participante, insira o código ou busque pelo nome ou e-mail.</p>{team && <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-brand"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />Você está operando como equipe do evento</p>}</FadeInView></div></header>
    <StaggerList className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Confirmados aguardando</p><p className="mt-1 text-2xl font-bold">{counts.confirmed}</p></div><div className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Entraram</p><p className="mt-1 text-2xl font-bold text-brand">{counts.checkedIn}{overview?.event.capacity ? <span className="ml-1 text-sm font-medium text-muted-foreground">de {overview.event.capacity} vagas</span> : null}</p></div><div className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Lista de espera</p><p className="mt-1 text-2xl font-bold">{counts.waitlisted}</p></div></StaggerList>
    <section aria-labelledby="scanner-title" className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6"><h2 id="scanner-title" className="text-xl font-semibold">Registrar entrada</h2><p className="mt-1 text-sm text-muted-foreground">O código expira em cinco minutos. Peça ao participante para abrir um novo se necessário.</p>
      {scanning ? <div className="mt-4 max-w-lg overflow-hidden rounded-xl border bg-black"><video ref={videoRef} playsInline muted className="aspect-video w-full object-cover" /><button type="button" onClick={stopCamera} className="flex min-h-11 w-full items-center justify-center gap-2 bg-card text-sm font-semibold"><X className="h-4 w-4" />Fechar câmera</button></div> : <button type="button" onClick={() => void startCamera()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"><Camera className="h-4 w-4" />Ler QR Code</button>}
      {cameraError && <p role="alert" className="mt-3 text-sm text-destructive">{cameraError}</p>}
      <form onSubmit={(event) => { event.preventDefault(); void registerCheckIn(token); }} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"><label htmlFor="checkin-token" className="grid min-w-0 flex-1 gap-2 text-sm font-medium">Código de entrada<input id="checkin-token" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Cole o código do participante" className="h-11 w-full rounded-xl border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label><button type="submit" disabled={working || !token.trim()} className="min-h-11 rounded-xl border border-primary bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{working ? "Validando..." : "Registrar entrada"}</button></form>
      {feedback && <p role="status" className="mt-3 text-sm font-medium">{feedback}</p>}
    </section>
    <section aria-labelledby="attendees-title" className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="attendees-title" className="flex items-center gap-2 text-xl font-semibold"><Users className="h-5 w-5 text-brand" />Participantes</h2><p className="mt-1 text-xs text-muted-foreground">A lista atualiza automaticamente enquanto esta página estiver aberta.</p></div><div className="flex flex-wrap gap-2">{overview?.access.canExport && <button type="button" onClick={() => void exportCsv()} disabled={exporting} aria-describedby="export-note" className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"><Download className="h-4 w-4" />{exporting ? "Exportando..." : "Exportar CSV"}</button>}<button type="button" onClick={() => { setLoading(true); void loadAttendees(); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium hover:bg-muted"><RefreshCcw className="h-4 w-4" />Atualizar</button></div></div>
      {overview?.access.canExport && <p id="export-note" className="mt-3 text-xs text-muted-foreground">O CSV contém nome e e-mail dos participantes: use estes dados apenas para a operação do evento (LGPD). Colunas separadas por ponto e vírgula para abrir direto no Excel.</p>}
      {exportError && <p role="alert" className="mt-2 text-sm text-destructive">{exportError}</p>}
      <label htmlFor="attendee-search" className="mt-5 grid gap-2 text-sm font-medium">Buscar participante<span className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input id="attendee-search" type="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={team ? "Nome do participante" : "Nome ou e-mail"}className="h-11 w-full rounded-xl border bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" /></span></label>
      {loading && !overview ? <p role="status" className="mt-5 text-sm text-muted-foreground">Carregando inscrições...</p> : error && !overview ? <p role="alert" className="mt-5 text-sm text-destructive">{error}</p> : attendees.length === 0 ? <p className="mt-5 text-sm text-muted-foreground">Ainda não há inscrições neste evento.</p> : filtered.length === 0 ? <p className="mt-5 text-sm text-muted-foreground">Nenhum participante encontrado para “{query.trim()}”.</p> : <>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error} Mostrando a última lista carregada.</p>}
        <ul className="mt-5 divide-y divide-border">{filtered.map((entry) => <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div className="min-w-0"><p className="break-words text-sm font-semibold">{entry.user.name || entry.user.email || "Participante sem nome"}</p>{entry.user.email && <p className="break-all text-xs text-muted-foreground">{entry.user.email}</p>}</div><div className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${entry.status === "CHECKED_IN" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : entry.status === "WAITLISTED" ? "bg-amber-500/10 text-amber-800 dark:text-amber-300" : "bg-primary/10 text-brand"}`}>{entry.status === "CHECKED_IN" && <CheckCircle2 className="h-3.5 w-3.5" />}{statusLabel[entry.status]}</span>{entry.status === "CONFIRMED" && <button type="button" disabled={working} onClick={() => setPendingManual(entry)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-primary/40 px-3 text-xs font-semibold text-brand hover:bg-primary/10 disabled:opacity-50"><UserCheck aria-hidden="true" className="h-4 w-4" />Registrar entrada<span className="sr-only"> de {entry.user.name || entry.user.email || "participante"}</span></button>}</div></li>)}</ul>
      </>}
    </section>
    <Dialog open={pendingManual !== null} onOpenChange={(open) => { if (!open) setPendingManual(null); }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-6 leading-snug">Confirmar entrada manual?</DialogTitle>
          <DialogDescription>Confira um documento antes de registrar. A entrada fica registrada no histórico do evento e não pode ser desfeita por aqui.</DialogDescription>
        </DialogHeader>
        {pendingManual && <div className="rounded-xl border bg-muted/30 p-3 text-sm"><p className="break-words font-semibold">{pendingManual.user.name || "Participante sem nome"}</p>{pendingManual.user.email && <p className="break-all text-muted-foreground">{pendingManual.user.email}</p>}</div>}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => setPendingManual(null)}>Cancelar</Button>
          <Button type="button" disabled={working} onClick={() => { const entry = pendingManual; setPendingManual(null); if (entry) void submitCheckIn({ registrationId: entry.id }); }}>Registrar entrada</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div></div>;
}
