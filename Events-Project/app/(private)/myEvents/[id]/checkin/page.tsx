"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Camera, CheckCircle2, Download, Loader2, RefreshCcw, Search, ShieldCheck, UserCheck, UserMinus, Users, X } from "lucide-react";
import { toast } from "react-toastify";
import { FadeInView } from "@/components/animations/FadeInView";
import { StaggerList } from "@/components/animations/StaggerList";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import RegistrationRequests from "@/components/MyComponents/checkin/RegistrationRequests";

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
  extraTickets?: { total: number; checkedIn: number };
  attendees: Attendee[];
};
type ApiError = { message?: string };
type QrDetector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };
type DetectorConstructor = new (options: { formats: string[] }) => QrDetector;

const statusLabel: Record<Attendee["status"], string> = { CHECKED_IN: "Entrada registrada", WAITLISTED: "Espera", CONFIRMED: "Confirmado", CANCELLED: "Cancelado" };
const errorText = (cause: unknown, fallback: string) => cause instanceof TypeError ? "Sem conexão. Verifique sua internet e tente novamente." : cause instanceof Error && cause.message ? cause.message : fallback;
const attendeeName = (entry: Attendee) => entry.user.name || entry.user.email || "Participante sem nome";
const removeButtonClass = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-destructive hover:bg-destructive/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive disabled:cursor-not-allowed disabled:opacity-50";
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
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [query, setQuery] = useState("");
  const [pendingManual, setPendingManual] = useState<Attendee | null>(null);
  const [exporting, setExporting] = useState(false);
  const [manualId, setManualId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [startingCamera, setStartingCamera] = useState(false);
  const workingRef = useRef(false);
  const [pendingRemoval, setPendingRemoval] = useState<Attendee | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [requestsRefresh, setRequestsRefresh] = useState(0);
  const removingRef = useRef(false);
  const cancelRemovalRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannedRef = useRef(false);

  const loadAttendees = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch(`${apiBase}/check-in?detalhes=1`, { cache: "no-store" });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok || !isOverview(data)) throw new Error((data as ApiError | null)?.message || "Não foi possível consultar inscrições.");
      setOverview(data);
      setError("");
      return true;
    } catch (cause) {
      setError(errorText(cause, "Não foi possível consultar inscrições."));
      return false;
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
    if (workingRef.current) {
      // A QR read during another registration was being dropped with the camera already closed.
      toast.info("Aguarde o registro em andamento e tente de novo.", { toastId: "checkin-busy" });
      scannedRef.current = false;
      return;
    }
    workingRef.current = true;
    setWorking(true);
    setManualId("registrationId" in body ? body.registrationId : null);
    try {
      const response = await fetch(`${apiBase}/check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({})) as ApiError & { user?: { name?: string | null }; alreadyCheckedIn?: boolean; checkedInAt?: string | null; ticketLabel?: string };
      if (!response.ok) throw new Error(data.message || "Não foi possível registrar a entrada.");
      if (data.alreadyCheckedIn) {
        // A reused QR (e.g. a shared screenshot) must never look like a new entry at the door.
        const at = data.checkedInAt ? new Date(data.checkedInAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;
        // An extra ticket belongs to the buyer but may be carried by a companion: name the order, not who walked in.
        const warning = data.ticketLabel
          ? `${data.ticketLabel}${data.user?.name ? ` do pedido de ${data.user.name}` : ""} já foi utilizado${at ? ` às ${at}` : ""}. Não libere uma nova entrada.`
          : `QR já utilizado${data.user?.name ? ` por ${data.user.name}` : ""}${at ? ` às ${at}` : ""}. Não libere uma nova entrada.`;
        toast.warning(warning, { toastId: `checkin-reused:${warning}`, autoClose: 8000 });
        if ("token" in body) setToken("");
        return;
      }
      const success = data.ticketLabel
        ? `Entrada registrada: ${data.ticketLabel}${data.user?.name ? ` do pedido de ${data.user.name}` : ""}.`
        : `Entrada registrada${data.user?.name ? ` para ${data.user.name}` : ""}.`;
      toast.success(success, { toastId: `checkin:${success}` });
      if ("token" in body) setToken("");
      await loadAttendees();
    } catch (cause) {
      const message = errorText(cause, "Não foi possível registrar a entrada.");
      toast.error(message, { toastId: `checkin-error:${message}` });
    } finally {
      workingRef.current = false;
      setWorking(false);
      setManualId(null);
      scannedRef.current = false;
    }
  }, [apiBase, loadAttendees]);

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
    if (startingCamera) return;
    setCameraError("");
    const Detector = (window as Window & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("Leitura por câmera indisponível neste navegador. Digite ou cole o código abaixo.");
      return;
    }
    setStartingCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      setScanning(true);
    } catch {
      setCameraError("Não foi possível abrir a câmera. Verifique a permissão ou digite o código abaixo.");
    } finally {
      setStartingCamera(false);
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

  async function removeAttendee(entry: Attendee) {
    if (removingRef.current) return;
    removingRef.current = true;
    setRemovingId(entry.id);
    const name = attendeeName(entry);
    try {
      const response = await fetch(`${apiBase}/registration-requests`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: entry.id }),
      });
      const data = await response.json().catch(() => null) as (ApiError & { status?: string }) | null;
      if (!response.ok) {
        toast.error(data?.message || "Não foi possível remover esta pessoa. Tente novamente.", { toastId: `checkin-remove-error:${entry.id}` });
        // 409/404: the registration changed elsewhere, so show its current state.
        if (response.status === 409 || response.status === 404) { setRequestsRefresh((value) => value + 1); await loadAttendees(); }
        return;
      }
      if (data?.status !== "REJECTED") {
        toast.error("Não foi possível confirmar a remoção. Atualize a página para conferir.", { toastId: `checkin-remove-error:${entry.id}` });
        return;
      }
      // Leaves the list right away, so a failed reload cannot offer the same removal again.
      setOverview((current) => current ? { ...current, attendees: current.attendees.filter((item) => item.id !== entry.id) } : current);
      setRequestsRefresh((value) => value + 1);
      if (await loadAttendees()) toast.success(`${name} foi removido(a) do evento.`, { toastId: `checkin-removed:${entry.id}` });
      else toast.warning(`${name} foi removido(a), mas a lista não foi atualizada. Atualize a página.`, { toastId: `checkin-removed:${entry.id}`, autoClose: 8000 });
    } catch (cause) {
      toast.error(cause instanceof TypeError ? "Sem conexão. Não foi possível confirmar a remoção; confira a lista e tente novamente." : "Não foi possível remover esta pessoa. Tente novamente.", { toastId: `checkin-remove-error:${entry.id}` });
    } finally {
      removingRef.current = false;
      setRemovingId(null);
    }
  }

  // Manual refresh: the list may be identical, and an inline error is hidden while the list is empty.
  async function refreshAttendees() {
    if (refreshing) return;
    setRefreshing(true);
    const ok = await loadAttendees();
    setRefreshing(false);
    if (ok) toast.success("Lista de participantes atualizada.", { toastId: "checkin-refresh" });
    else toast.error("Não foi possível atualizar a lista. Tente novamente.", { toastId: "checkin-refresh-error" });
  }

  async function exportCsv() {
    setExporting(true);
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
      const message = errorText(cause, "Não foi possível exportar os participantes.");
      toast.error(message, { toastId: `checkin-export:${message}` });
    } finally {
      setExporting(false);
    }
  }

  const attendees = useMemo(() => overview?.attendees ?? [], [overview]);
  const counts = overview?.counts ?? { confirmed: 0, checkedIn: 0, waitlisted: 0 };
  const extraTickets = overview?.extraTickets ?? { total: 0, checkedIn: 0 };
  // Capacity counts tickets, so people who entered with an extra ticket count too.
  const enteredTotal = counts.checkedIn + extraTickets.checkedIn;
  const team = overview?.access.role === "TEAM";
  // Owner/admin decide who attends; the check-in team never sees the requests (the API also refuses them).
  const canManageRequests = Boolean(overview?.access.canExport);
  // The server only removes people from published events.
  const canRemove = canManageRequests && overview?.event.status === "PUBLISHED";
  const filtered = useMemo(() => {
    const term = normalize(query);
    if (!term) return attendees;
    return attendees.filter((entry) => normalize(entry.user.name ?? "").includes(term) || normalize(entry.user.email ?? "").includes(term));
  }, [attendees, query]);

  return <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10"><div className="mx-auto max-w-5xl space-y-6">
    <header className="flex items-start gap-4"><div className="min-w-0"><Link href={team ? `/eventos/${encodeURIComponent(eventId)}/comunidade` : "/myEvents"} className="text-sm font-semibold text-brand hover:underline">{team ? "← Comunidade do evento" : "← Meus eventos"}</Link><FadeInView><h1 className="mt-2 text-3xl font-bold tracking-tight">Check-in do evento</h1>{overview && <p className="mt-1 break-words text-base font-medium">{overview.event.nome}</p>}<p className="mt-2 text-muted-foreground">Leia o QR Code apresentado pelo participante, insira o código ou busque pelo nome ou e-mail.</p>{team && <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-brand"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />Você está operando como equipe do evento</p>}</FadeInView></div></header>
    <StaggerList className={`grid gap-3 ${extraTickets.total > 0 ? "grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}><div className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Confirmados aguardando</p><p className="mt-1 text-2xl font-bold">{counts.confirmed}</p></div><div className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Entraram</p><p className="mt-1 text-2xl font-bold text-brand">{enteredTotal}{overview?.event.capacity ? <span className="ml-1 text-sm font-medium text-muted-foreground">de {overview.event.capacity} vagas</span> : null}</p></div><div className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Lista de espera</p><p className="mt-1 text-2xl font-bold">{counts.waitlisted}</p></div>{extraTickets.total > 0 && <div className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Ingressos extras</p><p className="mt-1 text-2xl font-bold tabular-nums">{extraTickets.checkedIn}<span className="ml-1 text-sm font-medium text-muted-foreground">de {extraTickets.total} entraram</span></p></div>}</StaggerList>
    {canManageRequests && <RegistrationRequests apiBase={apiBase} open={overview?.event.status === "PUBLISHED"} onChanged={loadAttendees} refreshKey={requestsRefresh} />}
    <section aria-labelledby="scanner-title" className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6"><h2 id="scanner-title" className="text-xl font-semibold">Registrar entrada</h2><p className="mt-1 text-sm text-muted-foreground">O código expira em cinco minutos. Peça ao participante para abrir um novo se necessário.</p>
      {scanning ? <div className="mt-4 max-w-lg overflow-hidden rounded-xl border bg-black"><video ref={videoRef} playsInline muted className="aspect-video w-full object-cover" /><button type="button" onClick={stopCamera} className="flex min-h-11 w-full items-center justify-center gap-2 bg-card text-sm font-semibold"><X className="h-4 w-4" />Fechar câmera</button></div> : <button type="button" disabled={startingCamera} onClick={() => void startCamera()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"><Camera className="h-4 w-4" />{startingCamera ? "Abrindo câmera..." : "Ler QR Code"}</button>}
      {cameraError && <p role="alert" className="mt-3 text-sm text-destructive">{cameraError}</p>}
      <form onSubmit={(event) => { event.preventDefault(); void registerCheckIn(token); }} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"><label htmlFor="checkin-token" className="grid min-w-0 flex-1 gap-2 text-sm font-medium">Código de entrada<input id="checkin-token" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Cole o código do participante" className="h-11 w-full rounded-xl border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label><button type="submit" disabled={working || !token.trim()} className="min-h-11 rounded-xl border border-primary bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{working ? "Validando..." : "Registrar entrada"}</button></form>
    </section>
    <section aria-labelledby="attendees-title" className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="attendees-title" className="flex items-center gap-2 text-xl font-semibold"><Users className="h-5 w-5 text-brand" />Participantes</h2><p className="mt-1 text-xs text-muted-foreground">A lista atualiza automaticamente enquanto esta página estiver aberta.</p></div><div className="flex flex-wrap gap-2">{overview?.access.canExport && <button type="button" onClick={() => void exportCsv()} disabled={exporting} aria-describedby="export-note" className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"><Download className="h-4 w-4" />{exporting ? "Exportando..." : "Exportar CSV"}</button>}<button type="button" disabled={refreshing} onClick={() => void refreshAttendees()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium hover:bg-muted disabled:cursor-wait disabled:opacity-60"><RefreshCcw className={refreshing ? "h-4 w-4 animate-spin motion-reduce:animate-none" : "h-4 w-4"} />{refreshing ? "Atualizando..." : "Atualizar"}</button></div></div>
      {overview?.access.canExport && <p id="export-note" className="mt-3 text-xs text-muted-foreground">O CSV contém nome e e-mail dos participantes: use estes dados apenas para a operação do evento (LGPD). Colunas separadas por ponto e vírgula para abrir direto no Excel.</p>}
      <label htmlFor="attendee-search" className="mt-5 grid gap-2 text-sm font-medium">Buscar participante<span className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input id="attendee-search" type="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={team ? "Nome do participante" : "Nome ou e-mail"}className="h-11 w-full rounded-xl border bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" /></span></label>
      {loading && !overview ? <p role="status" className="mt-5 text-sm text-muted-foreground">Carregando inscrições...</p> : error && !overview ? <p role="alert" className="mt-5 text-sm text-destructive">{error}</p> : attendees.length === 0 ? <p className="mt-5 text-sm text-muted-foreground">Ainda não há inscrições neste evento.</p> : filtered.length === 0 ? <p className="mt-5 text-sm text-muted-foreground">Nenhum participante encontrado para “{query.trim()}”.</p> : <>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error} Mostrando a última lista carregada.</p>}
        <ul className="mt-5 divide-y divide-border">{filtered.map((entry) => <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div className="min-w-0"><p className="break-words text-sm font-semibold">{entry.user.name || entry.user.email || "Participante sem nome"}</p>{entry.user.email && <p className="break-all text-xs text-muted-foreground">{entry.user.email}</p>}</div><div className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${entry.status === "CHECKED_IN" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : entry.status === "WAITLISTED" ? "bg-amber-500/10 text-amber-800 dark:text-amber-300" : "bg-primary/10 text-brand"}`}>{entry.status === "CHECKED_IN" && <CheckCircle2 className="h-3.5 w-3.5" />}{statusLabel[entry.status]}</span>{entry.status === "CONFIRMED" && <button type="button" disabled={working || removingId === entry.id} onClick={() => setPendingManual(entry)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-primary/40 px-3 text-xs font-semibold text-brand hover:bg-primary/10 disabled:opacity-50"><UserCheck aria-hidden="true" className="h-4 w-4" />{manualId === entry.id ? "Registrando..." : "Registrar entrada"}<span className="sr-only"> de {entry.user.name || entry.user.email || "participante"}</span></button>}{canRemove && (entry.status === "CONFIRMED" || entry.status === "WAITLISTED") && <button type="button" disabled={removingId !== null || manualId === entry.id} aria-label={removingId === entry.id ? `Removendo ${attendeeName(entry)} do evento` : `Remover ${attendeeName(entry)} do evento`} onClick={() => setPendingRemoval(entry)} className={removeButtonClass}>{removingId === entry.id ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <UserMinus aria-hidden="true" className="h-4 w-4" />}{removingId === entry.id ? "Removendo..." : "Remover"}</button>}</div></li>)}</ul>
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
    <Dialog open={pendingRemoval !== null} onOpenChange={(open) => { if (!open) setPendingRemoval(null); }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md" onOpenAutoFocus={(event) => { event.preventDefault(); cancelRemovalRef.current?.focus(); }}>
        <DialogHeader>
          <DialogTitle className="break-words pr-6 leading-snug">Remover {pendingRemoval ? attendeeName(pendingRemoval) : "participante"} do evento?</DialogTitle>
          <DialogDescription>O QR Code desta pessoa deixa de valer. Ela será avisada e não poderá se inscrever de novo neste evento.</DialogDescription>
        </DialogHeader>
        {pendingRemoval?.user.email && <p className="break-all rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">{pendingRemoval.user.email}</p>}
        <DialogFooter className="gap-2">
          <Button ref={cancelRemovalRef} type="button" variant="outline" onClick={() => setPendingRemoval(null)}>Cancelar</Button>
          <Button type="button" variant="destructive" disabled={removingId !== null} onClick={() => { const entry = pendingRemoval; setPendingRemoval(null); if (entry) void removeAttendee(entry); }}>Remover do evento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div></div>;
}
