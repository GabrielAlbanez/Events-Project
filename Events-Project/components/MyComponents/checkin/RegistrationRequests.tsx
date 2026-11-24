"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Check, CircleSlash, Hourglass, Inbox, Loader2, RefreshCcw, UserMinus, UserPlus, X } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

/** Mirrors GET /api/events/[id]/registration-requests (owner/admin only). */
export type RegistrationRequest = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  checkedInAt: string | null;
  user: { id: string; name: string | null; email: string | null };
};
type Decision = "APPROVE" | "REJECT";
type DecisionResult = { id: string; status: string; message?: string };
type Filter = RegistrationRequest["status"];
type Confirm = { kind: "reject"; entry: RegistrationRequest } | { kind: "remove"; entry: RegistrationRequest } | { kind: "readmit"; entry: RegistrationRequest } | { kind: "bulk"; count: number };
type ReadmitPlan = "free" | "full" | "paid";
type EventPlace = { capacity?: number | null; confirmedCount?: number; ticketSale?: boolean; ticketSalesPaused?: boolean };

const filters: Array<{ value: Filter; label: string; short: string }> = [
  { value: "PENDING", label: "Pendentes", short: "Pendentes" },
  { value: "APPROVED", label: "Aprovados · aguardando pagamento", short: "Aprovados" },
  { value: "REJECTED", label: "Recusados", short: "Recusados" },
];
const emptyText: Record<Filter, string> = {
  PENDING: "Nenhum pedido aguardando resposta.",
  APPROVED: "Ninguém aprovado aguardando pagamento.",
  REJECTED: "Nenhum pedido recusado.",
};
const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const personName = (entry: RegistrationRequest) => entry.user.name || entry.user.email || "Participante sem nome";
const notifyOk = (text: string) => toast.success(text, { toastId: `requests:${text}` });
const notifyError = (text: string) => toast.error(text, { toastId: `requests-error:${text}` });

function isRequestList(value: unknown): value is RegistrationRequest[] {
  return Array.isArray(value) && value.every((item) => item && typeof item === "object" && typeof (item as RegistrationRequest).id === "string" && typeof (item as RegistrationRequest).status === "string" && !!(item as RegistrationRequest).user);
}

function requestedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateFormat.format(date);
}

function approvedMessage(name: string, status: string): string {
  if (status === "APPROVED") return `${name} foi aprovado(a). A compra do ingresso está liberada.`;
  if (status === "WAITLISTED") return `${name} foi aprovado(a) e entrou na lista de espera (vagas esgotadas).`;
  return `${name} foi aprovado(a) e está com presença confirmada.`;
}

function readmitText(plan: ReadmitPlan | null): string {
  if (plan === "paid") return "Ela será avisada e poderá comprar o ingresso de novo. O QR Code novo sai depois do pagamento.";
  if (plan === "full") return "O evento está lotado: ela volta para a lista de espera e será avisada. O QR Code novo sai quando a presença for confirmada.";
  if (plan === "free") return "Ela volta com presença confirmada, será avisada e recebe um QR Code novo.";
  return "Em evento gratuito, ela volta com presença confirmada ou para a lista de espera, se estiver lotado. Em evento pago, poderá comprar o ingresso. Ela será avisada e recebe um QR Code novo quando a presença for confirmada.";
}

function readmittedMessage(name: string, status: string): string {
  if (status === "APPROVED") return `${name} foi readmitido(a) e já pode comprar o ingresso.`;
  if (status === "WAITLISTED") return `${name} foi readmitido(a) na lista de espera (vagas esgotadas).`;
  return `${name} foi readmitido(a) com presença confirmada.`;
}

type Props = {
  apiBase: string;
  /** Decisions only work while the event is published (the server answers 409 otherwise). */
  open: boolean;
  /** Called after a decision that may change the participant list (free events confirm on approval). Resolves to false when the reload failed. */
  onChanged: () => void | Promise<boolean>;
  /** Changing it re-reads the requests (e.g. after a removal in the participant list). */
  refreshKey?: number;
};

/** Organizer approval of registrations: pending requests first, then approved (waiting payment) and rejected. */
export default function RegistrationRequests({ apiBase, open, onChanged, refreshKey = 0 }: Props) {
  const [requests, setRequests] = useState<RegistrationRequest[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("PENDING");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyDecision, setBusyDecision] = useState<Decision | "REMOVE" | "READMIT" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const working = useRef(false);
  const cancelRemovalRef = useRef<HTMLButtonElement>(null);
  const [readmitPlan, setReadmitPlan] = useState<ReadmitPlan | null>(null);
  const planRequest = useRef(0);
  // Order of list reads: an answer older than the last confirmed decision never reaches the screen.
  const listRequest = useRef(0);
  const listApplied = useRef(0);
  const listFloor = useRef(0);

  const load = useCallback(async (): Promise<boolean> => {
    const request = ++listRequest.current;
    const outdated = () => request <= listFloor.current || request < listApplied.current;
    try {
      const response = await fetch(`${apiBase}/registration-requests`, { cache: "no-store" });
      const data: unknown = await response.json().catch(() => null);
      if (outdated()) return true;
      if (!response.ok || !isRequestList(data)) throw new Error((data as { message?: string } | null)?.message || "Não foi possível consultar as solicitações.");
      listApplied.current = request;
      setRequests(data);
      setError("");
      return true;
    } catch (cause) {
      if (outdated()) return true;
      setError(cause instanceof TypeError ? "Sem conexão. Verifique sua internet e tente novamente." : cause instanceof Error && cause.message ? cause.message : "Não foi possível consultar as solicitações.");
      return false;
    } finally {
      if (request === listRequest.current) setLoading(false);
    }
  }, [apiBase]);

  // The check-in page drives live updates through refreshKey. Skipped during a decision so the list never jumps under the cursor.
  useEffect(() => { if (!working.current) void load(); }, [refreshKey, load]);

  /** Sends one decision; the list changes only after the server confirms it. */
  const decide = useCallback(async (entry: RegistrationRequest, decision: Decision): Promise<boolean> => {
    setBusyId(entry.id);
    setBusyDecision(decision);
    try {
      const response = await fetch(`${apiBase}/registration-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: entry.id, decision }),
      });
      const data = await response.json().catch(() => ({})) as Partial<DecisionResult>;
      listFloor.current = listRequest.current;
      if (!response.ok || typeof data.status !== "string") {
        const message = data.message || "Não foi possível responder o pedido. Tente novamente.";
        notifyError(message);
        // 409: someone already answered it; 404: it no longer exists. Re-read to show the current state.
        if (response.status === 409 || response.status === 404) void load();
        return false;
      }
      const status = data.status;
      setRequests((current) => current
        ? status === "PENDING" || status === "APPROVED" || status === "REJECTED"
          ? current.map((item) => item.id === entry.id ? { ...item, status } : item)
          : current.filter((item) => item.id !== entry.id)
        : current);
      if (decision === "REJECT") notifyOk(`Pedido de ${personName(entry)} recusado.`);
      else notifyOk(approvedMessage(personName(entry), status));
      if (status === "CONFIRMED" || status === "WAITLISTED") onChanged();
      return true;
    } catch {
      notifyError("Sem conexão. O pedido não foi respondido; tente novamente.");
      return false;
    } finally {
      setBusyId(null);
      setBusyDecision(null);
    }
  }, [apiBase, load, onChanged]);

  const runSingle = async (entry: RegistrationRequest, decision: Decision) => {
    if (working.current) return;
    working.current = true;
    try { await decide(entry, decision); } finally { working.current = false; }
  };

  /** Removes an approved person; the lists are re-read for counters and the waiting list. */
  const removeApproved = async (entry: RegistrationRequest) => {
    if (working.current) return;
    working.current = true;
    setBusyId(entry.id);
    setBusyDecision("REMOVE");
    try {
      const response = await fetch(`${apiBase}/registration-requests`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: entry.id }),
      });
      const data = await response.json().catch(() => null) as Partial<DecisionResult> | null;
      listFloor.current = listRequest.current;
      if (!response.ok) {
        notifyError(data?.message || "Não foi possível remover esta pessoa. Tente novamente.");
        if (response.status === 409 || response.status === 404) await Promise.all([load(), onChanged()]);
        return;
      }
      if (data?.status !== "REJECTED") {
        notifyError("Não foi possível confirmar a remoção. Atualize a página para conferir.");
        return;
      }
      setRequests((current) => current ? current.map((item) => item.id === entry.id ? { ...item, status: "REJECTED" } : item) : current);
      const [listOk, attendeesOk] = await Promise.all([load(), onChanged()]);
      if (listOk && attendeesOk !== false) notifyOk(`${personName(entry)} foi removido(a) do evento.`);
      else toast.warning(`${personName(entry)} foi removido(a), mas a lista não foi atualizada. Atualize a página.`, { toastId: `requests-removed:${entry.id}`, autoClose: 8000 });
    } catch (cause) {
      notifyError(cause instanceof TypeError ? "Sem conexão. Não foi possível confirmar a remoção; confira a lista e tente novamente." : "Não foi possível remover esta pessoa. Tente novamente.");
    } finally {
      working.current = false;
      setBusyId(null);
      setBusyDecision(null);
    }
  };

  /** Opens the confirmation; the text becomes specific once the event's seats and sale mode are known. */
  const openReadmit = async (entry: RegistrationRequest) => {
    const request = ++planRequest.current;
    setReadmitPlan(null);
    setConfirm({ kind: "readmit", entry });
    try {
      const response = await fetch(`${apiBase}/registration`, { cache: "no-store" });
      const data = await response.json().catch(() => null) as EventPlace | null;
      if (request !== planRequest.current || !response.ok || !data || typeof data.confirmedCount !== "number") return;
      setReadmitPlan(data.ticketSale || data.ticketSalesPaused ? "paid" : typeof data.capacity === "number" && data.confirmedCount >= data.capacity ? "full" : "free");
    } catch {
      // The dialog keeps the text that is true for every kind of event.
    }
  };

  /** Brings a removed or rejected person back; the server decides between confirmed, waitlist and approved. */
  const readmit = async (entry: RegistrationRequest) => {
    if (working.current) return;
    working.current = true;
    setBusyId(entry.id);
    setBusyDecision("READMIT");
    try {
      const response = await fetch(`${apiBase}/registration-requests`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: entry.id }),
      });
      const result = await response.json().catch(() => null) as Partial<DecisionResult> | null;
      listFloor.current = listRequest.current;
      if (!response.ok) {
        notifyError(result?.message || "Não foi possível readmitir esta pessoa. Tente novamente.");
        if (response.status === 409 || response.status === 404) await Promise.all([load(), onChanged()]);
        return;
      }
      const status = result?.status;
      if (status !== "CONFIRMED" && status !== "WAITLISTED" && status !== "APPROVED") {
        notifyError("Não foi possível confirmar a readmissão. Atualize a página para conferir.");
        return;
      }
      setRequests((current) => current
        ? status === "APPROVED"
          ? current.map((item) => item.id === entry.id ? { ...item, status } : item)
          : current.filter((item) => item.id !== entry.id)
        : current);
      const [listOk, attendeesOk] = await Promise.all([load(), onChanged()]);
      if (listOk && attendeesOk !== false) notifyOk(readmittedMessage(personName(entry), status));
      else toast.warning(`${personName(entry)} foi readmitido(a), mas a lista não foi atualizada. Atualize a página.`, { toastId: `requests-readmitted:${entry.id}`, autoClose: 8000 });
    } catch (cause) {
      notifyError(cause instanceof TypeError ? "Sem conexão. Não foi possível confirmar a readmissão; confira a lista e tente novamente." : "Não foi possível readmitir esta pessoa. Tente novamente.");
    } finally {
      working.current = false;
      setBusyId(null);
      setBusyDecision(null);
    }
  };

  /** Approves the visible pending list one by one; stops at the first failure. */
  const approveAll = async () => {
    if (working.current || !requests) return;
    const queue = requests.filter((item) => item.status === "PENDING");
    if (!queue.length) return;
    working.current = true;
    setBulk({ done: 0, total: queue.length });
    let approved = 0;
    try {
      for (const entry of queue) {
        const ok = await decide(entry, "APPROVE");
        if (!ok) break;
        approved += 1;
        setBulk({ done: approved, total: queue.length });
      }
    } finally {
      working.current = false;
      setBulk(null);
      if (approved > 1) notifyOk(`${approved} de ${queue.length} pedidos aprovados.`);
      void load();
    }
  };

  /** Manual refresh: the list may be identical, so the click always gets its own confirmation. A failure shows inline. */
  const refreshList = async () => {
    if (refreshing) return;
    setRefreshing(true);
    const ok = await load();
    setRefreshing(false);
    if (ok) notifyOk("Solicitações atualizadas.");
  };

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
    for (const item of requests ?? []) result[item.status] += 1;
    return result;
  }, [requests]);
  // Oldest first: whoever asked first is answered first.
  const visible = useMemo(() => (requests ?? []).filter((item) => item.status === filter), [requests, filter]);
  const busy = busyId !== null || bulk !== null;

  return <section id="solicitacoes" aria-labelledby="requests-title" aria-busy={busy} className="scroll-mt-24 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 id="requests-title" className="flex flex-wrap items-center gap-2 text-xl font-semibold">
          <Inbox aria-hidden="true" className="h-5 w-5 text-brand" />Solicitações
          {counts.PENDING > 0 && <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-bold tabular-nums text-amber-900 dark:text-amber-200"><span className="sr-only">, </span>{counts.PENDING}<span className="sr-only"> {counts.PENDING === 1 ? "pedido pendente" : "pedidos pendentes"}</span></span>}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Pedidos de participação aguardando sua resposta. Quem foi recusado não pode pedir de novo; só a organização pode readmitir.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {filter === "PENDING" && counts.PENDING > 1 && open && <Button type="button" size="sm" disabled={busy} onClick={() => setConfirm({ kind: "bulk", count: counts.PENDING })}><Check aria-hidden="true" />Aprovar todos</Button>}
        <Button type="button" size="sm" variant="outline" disabled={busy || refreshing} onClick={() => void refreshList()}>{refreshing ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <RefreshCcw aria-hidden="true" />}{refreshing ? "Atualizando..." : "Atualizar"}</Button>
      </div>
    </div>

    <div role="group" aria-label="Filtrar solicitações" className="mt-4 grid grid-cols-3 gap-1 rounded-xl border bg-muted/40 p-1">
      {filters.map((item) => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}
        className={cn("inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:text-sm", filter === item.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
        <span className="truncate sm:hidden">{item.short}</span><span className="hidden truncate sm:inline">{item.label}</span>
        <span className="tabular-nums text-muted-foreground">{counts[item.value]}</span>
      </button>)}
    </div>

    {bulk && <p role="status" className="mt-4 flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-brand"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />Aprovando {Math.min(bulk.done + 1, bulk.total)} de {bulk.total}...</p>}
    {!open && requests && counts.PENDING > 0 && <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">As inscrições deste evento estão encerradas; não é mais possível responder pedidos.</p>}

    {loading && !requests ? <p role="status" className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />Carregando solicitações...</p>
      : error && !requests ? <div className="mt-5 space-y-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button type="button" size="sm" variant="outline" onClick={() => { setLoading(true); void load(); }}>Tentar novamente</Button></div>
        : <>
          {error && <p role="alert" className="mt-4 text-sm text-destructive">{error} Mostrando a última lista carregada.</p>}
          {requests && requests.length === 0 ? <p className="mt-5 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Nenhum pedido de participação até agora. Com a aprovação manual ativa no evento, cada pedido aparece aqui.</p>
            : visible.length === 0 ? <p className="mt-5 text-sm text-muted-foreground">{emptyText[filter]}</p>
              : <ul className="mt-4 divide-y divide-border">{visible.map((entry) => {
                const rowBusy = busyId === entry.id;
                const when = requestedAt(entry.createdAt);
                return <li key={entry.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold">{personName(entry)}</p>
                    {entry.user.email && <p className="break-all text-xs text-muted-foreground">{entry.user.email}</p>}
                    {when && <p className="mt-0.5 text-xs text-muted-foreground">Pedido em <time dateTime={entry.createdAt}>{when}</time></p>}
                  </div>
                  {entry.status === "PENDING" ? <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                    <Button type="button" size="sm" disabled={busy || !open} onClick={() => void runSingle(entry, "APPROVE")}>{rowBusy && busyDecision === "APPROVE" ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Check aria-hidden="true" />}Aprovar<span className="sr-only"> {personName(entry)}</span></Button>
                    <Button type="button" size="sm" variant="outline" disabled={busy || !open} onClick={() => setConfirm({ kind: "reject", entry })} className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive">{rowBusy && busyDecision === "REJECT" ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <X aria-hidden="true" />}Recusar<span className="sr-only"> {personName(entry)}</span></Button>
                  </div>
                    : entry.status === "APPROVED" ? <div className="flex flex-wrap items-center gap-2 sm:shrink-0"><StatusBadge tone="info" icon={BadgeCheck}>Aguardando pagamento</StatusBadge>{open && <button type="button" disabled={busy} aria-label={rowBusy && busyDecision === "REMOVE" ? `Removendo ${personName(entry)} do evento` : `Remover ${personName(entry)} do evento`} onClick={() => setConfirm({ kind: "remove", entry })} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-destructive hover:bg-destructive/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive disabled:cursor-not-allowed disabled:opacity-50">{rowBusy && busyDecision === "REMOVE" ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <UserMinus aria-hidden="true" className="h-4 w-4" />}{rowBusy && busyDecision === "REMOVE" ? "Removendo..." : "Remover"}</button>}</div>
                      : <div className="flex flex-wrap items-center gap-2 sm:shrink-0"><StatusBadge tone="neutral" icon={CircleSlash}>Recusado</StatusBadge>{open && <button type="button" disabled={busy} aria-label={rowBusy && busyDecision === "READMIT" ? `Readmitindo ${personName(entry)} no evento` : `Readmitir ${personName(entry)} no evento`} onClick={() => void openReadmit(entry)} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50">{rowBusy && busyDecision === "READMIT" ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <UserPlus aria-hidden="true" className="h-4 w-4" />}{rowBusy && busyDecision === "READMIT" ? "Readmitindo..." : "Readmitir"}</button>}</div>}
                </li>;
              })}</ul>}
          {filter === "PENDING" && counts.PENDING > 0 && <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground"><Hourglass aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />Em eventos pagos, quem for aprovado recebe um aviso para comprar o ingresso; em eventos gratuitos, a presença é confirmada na hora (ou vai para a lista de espera, se lotado).</p>}
        </>}

    <Dialog open={confirm !== null} onOpenChange={(value) => { if (!value) setConfirm(null); }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md" onOpenAutoFocus={(event) => { if (confirm?.kind === "remove" || confirm?.kind === "readmit") { event.preventDefault(); cancelRemovalRef.current?.focus(); } }}>
        {confirm?.kind === "reject" ? <>
          <DialogHeader>
            <DialogTitle className="pr-6 leading-snug">Recusar pedido?</DialogTitle>
            <DialogDescription>A pessoa recebe um aviso e não poderá pedir para participar de novo. Depois, só a organização pode readmiti-la.</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border bg-muted/30 p-3 text-sm"><p className="break-words font-semibold">{personName(confirm.entry)}</p>{confirm.entry.user.email && <p className="break-all text-muted-foreground">{confirm.entry.user.email}</p>}</div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirm(null)}>Voltar</Button>
            <Button type="button" variant="destructive" onClick={() => { const entry = confirm.entry; setConfirm(null); void runSingle(entry, "REJECT"); }}>Recusar pedido</Button>
          </DialogFooter>
        </> : confirm?.kind === "bulk" ? <>
          <DialogHeader>
            <DialogTitle className="pr-6 leading-snug">Aprovar {confirm.count} pedidos?</DialogTitle>
            <DialogDescription>Os pedidos pendentes são aprovados um a um, do mais antigo ao mais recente. Se algum falhar, o processo para e você vê o motivo.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirm(null)}>Voltar</Button>
            <Button type="button" onClick={() => { setConfirm(null); void approveAll(); }}>Aprovar todos</Button>
          </DialogFooter>
        </> : confirm?.kind === "remove" ? <>
          <DialogHeader>
            <DialogTitle className="break-words pr-6 leading-snug">Remover {personName(confirm.entry)} do evento?</DialogTitle>
            <DialogDescription>O QR Code desta pessoa deixa de valer. Ela será avisada e não poderá se inscrever de novo neste evento.</DialogDescription>
          </DialogHeader>
          {confirm.entry.user.email && <p className="break-all rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">{confirm.entry.user.email}</p>}
          <DialogFooter className="gap-2">
            <Button ref={cancelRemovalRef} type="button" variant="outline" onClick={() => setConfirm(null)}>Cancelar</Button>
            <Button type="button" variant="destructive" onClick={() => { const entry = confirm.entry; setConfirm(null); void removeApproved(entry); }}>Remover do evento</Button>
          </DialogFooter>
        </> : confirm?.kind === "readmit" ? <>
          <DialogHeader>
            <DialogTitle className="break-words pr-6 leading-snug">Readmitir {personName(confirm.entry)} no evento?</DialogTitle>
            <DialogDescription aria-live="polite">{readmitText(readmitPlan)}</DialogDescription>
          </DialogHeader>
          {confirm.entry.user.email && <p className="break-all rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">{confirm.entry.user.email}</p>}
          <DialogFooter className="gap-2">
            <Button ref={cancelRemovalRef} type="button" variant="outline" onClick={() => setConfirm(null)}>Cancelar</Button>
            <Button type="button" onClick={() => { const entry = confirm.entry; setConfirm(null); void readmit(entry); }}>Readmitir</Button>
          </DialogFooter>
        </> : null}
      </DialogContent>
    </Dialog>
  </section>;
}
