"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
type Entry = { id: string; adminName: string | null; userName: string | null; startedAt: string; expiresAt: string; endedAt: string | null; ip: string | null; reason: string; status: "active" | "ended" | "expired" };
type Result = { data: Entry[]; pagination: { total: number; totalPages: number } };
const labels = { active: "Em andamento", ended: "Encerrado", expired: "Expirado" };
const formatDate = (value: string) => new Date(value).toLocaleString("pt-BR");
const control = "h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export default function ImpersonationAudit() {
  const { data: session } = useSession();
  const empty = { q: "", status: "all", from: "", to: "" };
  const [filters, setFilters] = useState(empty);
  const [query, setQuery] = useState(empty);
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setResult(null);
    const params = new URLSearchParams({ ...query, page: String(page) });
    void fetch(`/api/admin/impersonation/audit?${params}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Não foi possível consultar a auditoria. Confira suas permissões e tente novamente.");
      const data: Result = await response.json();
      if (!controller.signal.aborted) setResult(data);
    }).catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Não foi possível carregar os registros."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, page, refresh, session?.user?.id]);
  return <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-8">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary"><ShieldCheck className="h-4 w-4" /> Administração</p><h1 className="text-3xl font-bold tracking-tight">Auditoria de acessos</h1><p className="mt-2 text-sm text-muted-foreground">Justificativas, duração e origem das visualizações de contas por administradores.</p></div><Button variant="outline" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Atualizar</Button></header>
    <form className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4" onSubmit={event => { event.preventDefault(); setPage(1); setQuery({ ...filters }); }}>
      <label className="grid gap-2 text-sm font-medium">Buscar conta<Input maxLength={100} value={filters.q} onChange={event => setFilters(previous => ({ ...previous, q: event.target.value }))} placeholder="Nome ou identificador" /></label>
      <label className="grid gap-2 text-sm font-medium">Situação<select className={control} value={filters.status} onChange={event => setFilters(previous => ({ ...previous, status: event.target.value }))}><option value="all">Todas</option><option value="active">Em andamento</option><option value="ended">Encerradas</option><option value="expired">Expiradas</option></select></label>
      <label className="grid gap-2 text-sm font-medium">Desde<input className={control} type="date" value={filters.from} onChange={event => setFilters(previous => ({ ...previous, from: event.target.value }))} /></label>
      <label className="grid gap-2 text-sm font-medium">Até<input className={control} type="date" min={filters.from || undefined} value={filters.to} onChange={event => setFilters(previous => ({ ...previous, to: event.target.value }))} /></label>
      <div className="flex gap-2 sm:col-span-2 lg:col-span-4"><Button type="submit" disabled={loading}>Aplicar filtros</Button><Button type="button" variant="ghost" onClick={() => { setFilters(empty); setQuery(empty); setPage(1); }}>Limpar</Button></div>
    </form>
    {error && <div role="alert" className="rounded-2xl border border-destructive/30 bg-card p-5"><p>{error}</p><Button className="mt-3" variant="outline" onClick={() => setRefresh(value => value + 1)}>Tentar novamente</Button></div>}
    <section aria-label="Registros de auditoria" aria-busy={loading} className="space-y-3">
      {loading ? <p role="status" className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">Carregando registros...</p> : !error && !result?.data.length ? <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">Nenhum acesso corresponde aos filtros.</p> : result?.data.map(entry => <article key={entry.id} className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{entry.adminName || "Administrador removido"} → {entry.userName || "Conta removida"}</h2><p className="mt-1 break-all text-xs text-muted-foreground">Registro {entry.id}</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{labels[entry.status]}</span></div><p className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-muted/40 p-3 text-sm">{entry.reason || "Acesso anterior à exigência de justificativa."}</p><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-xs text-muted-foreground">Início</dt><dd>{formatDate(entry.startedAt)}</dd></div><div><dt className="text-xs text-muted-foreground">Término</dt><dd>{entry.endedAt ? formatDate(entry.endedAt) : entry.status === "expired" ? formatDate(entry.expiresAt) : "Em andamento"}</dd></div><div><dt className="text-xs text-muted-foreground">Expiração</dt><dd>{formatDate(entry.expiresAt)}</dd></div><div><dt className="text-xs text-muted-foreground">IP de origem</dt><dd className="break-all">{entry.ip || "Não disponível"}</dd></div></dl></article>)}
    </section>
    {result && <footer className="flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-muted-foreground">{result.pagination.total} registros · Página {page} de {Math.max(1, result.pagination.totalPages)}</p><div className="flex gap-2"><Button variant="outline" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</Button><Button variant="outline" disabled={loading || page >= result.pagination.totalPages} onClick={() => setPage(value => value + 1)}>Próxima</Button></div></footer>}
  </main>;
}
