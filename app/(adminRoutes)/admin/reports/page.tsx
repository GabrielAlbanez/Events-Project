"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Flag, RefreshCcw } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { FadeInView } from "@/components/animations/FadeInView";

type Report = {
  id: string;
  reason: "INCORRECT_INFORMATION" | "INAPPROPRIATE_CONTENT" | "SPAM" | "OTHER";
  details: string;
  status: "PENDING" | "RESOLVED" | "DISMISSED";
  createdAt: string;
  reviewedAt: string | null;
  resolutionNote: string | null;
  event: { id: string; nome: string; status: string };
  reporter: { id: string; name: string | null; email: string };
  reviewer: { id: string; name: string | null } | null;
};
type ReportResponse = { reports?: Report[]; report?: Report; message?: string };
const reasonLabels: Record<Report["reason"], string> = {
  INCORRECT_INFORMATION: "Informações incorretas",
  INAPPROPRIATE_CONTENT: "Conteúdo inadequado",
  SPAM: "Spam ou fraude",
  OTHER: "Outro motivo",
};

export default function ReportsPage() {
  const { status, data: session } = useSession();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/reports", { cache: "no-store" });
      const data = await response.json() as ReportResponse;
      if (!response.ok || !Array.isArray(data.reports)) throw new Error(data.message || "Não foi possível carregar as denúncias.");
      setReports(data.reports);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar as denúncias.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (status === "authenticated" && session?.user?.role === "ADMIN") void refresh(); else if (status !== "loading") setLoading(false); }, [status, session?.user?.role, refresh]);

  async function review(id: string, decision: "RESOLVED" | "DISMISSED") {
    setBusyId(id);
    setFeedback("");
    try {
      const response = await fetch(`/api/admin/reports/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: decision, resolutionNote: noteById[id]?.trim() || undefined }),
      });
      const data = await response.json() as ReportResponse;
      if (!response.ok || !data.report) throw new Error(data.message || "Não foi possível concluir a análise.");
      setReports((items) => items.map((item) => item.id === id ? data.report! : item));
      setFeedback(decision === "RESOLVED" ? "Denúncia resolvida." : "Denúncia descartada.");
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Não foi possível concluir a análise.");
    } finally {
      setBusyId(null);
    }
  }

  if (status !== "loading" && (status !== "authenticated" || session?.user?.role !== "ADMIN")) {
    return <main className="p-6"><p role="alert">Acesso reservado a administradores.</p></main>;
  }

  const pending = reports.filter((item) => item.status === "PENDING").length;
  return <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10"><div className="mx-auto max-w-5xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-start gap-4"><SidebarTrigger className="mt-1" /><FadeInView><Link href="/admin" className="text-sm font-semibold text-primary hover:underline">← Administração</Link><h1 className="mt-2 flex items-center gap-2 text-3xl font-bold tracking-tight"><Flag className="h-7 w-7 text-primary" />Denúncias de eventos</h1><p className="mt-2 text-muted-foreground">Revise os relatos enviados pela comunidade e registre sua decisão.</p></FadeInView></div><button type="button" onClick={() => { setLoading(true); void refresh(); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-card px-4 text-sm font-semibold hover:bg-muted"><RefreshCcw className="h-4 w-4" />Atualizar</button></header>
    <FadeInView stationary><div className="rounded-2xl border bg-card p-5"><p className="text-sm text-muted-foreground">Aguardando análise</p><p className="mt-1 text-3xl font-bold text-primary">{pending}</p></div></FadeInView>
    {feedback && <p role="status" className="rounded-xl border bg-card p-3 text-sm">{feedback}</p>}
    {loading ? <p role="status" className="rounded-2xl border bg-card p-6 text-muted-foreground">Carregando denúncias...</p> : error ? <p role="alert" className="rounded-2xl border bg-card p-6 text-destructive">{error}</p> : reports.length === 0 ? <div className="rounded-2xl border border-dashed bg-card p-10 text-center"><Flag className="mx-auto h-8 w-8 text-primary" /><h2 className="mt-3 text-lg font-semibold">Nenhuma denúncia recebida</h2><p className="mt-1 text-sm text-muted-foreground">Os relatos enviados pelos usuários aparecerão aqui.</p></div> : <ul className="space-y-4">{reports.map((item) => <li key={item.id} className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-primary">{reasonLabels[item.reason]}</p><h2 className="mt-1 text-lg font-semibold"><Link href={`/eventos/${item.event.id}`} className="hover:text-primary hover:underline">{item.event.nome} ↗</Link></h2><p className="mt-1 text-xs text-muted-foreground">Enviada por {item.reporter.name || item.reporter.email} · {new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.status === "PENDING" ? "bg-amber-500/10 text-amber-800 dark:text-amber-300" : item.status === "RESOLVED" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>{item.status === "PENDING" ? "Pendente" : item.status === "RESOLVED" ? "Resolvida" : "Descartada"}</span></div><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6">{item.details}</p>{item.status === "PENDING" ? <div className="mt-5 space-y-3 border-t pt-4"><label htmlFor={`resolution-${item.id}`} className="block text-sm font-medium">Nota da análise <span className="font-normal text-muted-foreground">(opcional)</span></label><textarea id={`resolution-${item.id}`} value={noteById[item.id] || ""} onChange={(event) => setNoteById((notes) => ({ ...notes, [item.id]: event.target.value }))} maxLength={1000} rows={2} placeholder="Explique a decisão para o histórico" className="w-full rounded-xl border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" /><div className="flex flex-wrap gap-2"><button type="button" disabled={busyId === item.id} onClick={() => void review(item.id, "RESOLVED")} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">Marcar como resolvida</button><button type="button" disabled={busyId === item.id} onClick={() => void review(item.id, "DISMISSED")} className="min-h-11 rounded-xl border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50">Descartar denúncia</button></div></div> : item.resolutionNote && <p className="mt-4 rounded-xl bg-muted p-3 text-sm text-muted-foreground">Nota: {item.resolutionNote}</p>}</li>)}</ul>}
  </div></main>;
}
