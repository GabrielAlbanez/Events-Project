"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useSocket } from "@/context/SocketContext";
import { getNotificationPage, markNotificationRead } from "@/app/(actions)/engagement/action";
import { NotificationDTO } from "@/types/features";
import PushSettings from "@/components/MyComponents/PushSettings";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { FadeInView } from "@/components/animations/FadeInView";

export default function Notifications() {
  const { data: session, status } = useSession();
  const socket = useSocket();
  const identity = useRef(session?.user?.id);
  identity.current = status === "authenticated" ? session?.user?.id : undefined;
  const request = useRef(0);
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [unread, setUnread] = useState(false);
  const invalidate = useCallback(() => { request.current++; }, []);
  const unreadRef = useRef(unread); unreadRef.current = unread;
  const [failedBefore, setFailedBefore] = useState<string | undefined>();
  const refresh = useCallback(async (before?: string) => {
    if (!identity.current) return;
    const account = identity.current;
    const revision = ++request.current;
    if (before) setMoreLoading(true); else setLoading(true);
    setError("");
    try {
      const result = await getNotificationPage({ before, unread });
      if (account !== identity.current || revision !== request.current) return;
      setItems(previous => before ? [...previous, ...result.items.filter(item => !previous.some(existing => existing.id === item.id))] : result.items);
      setNextBefore(result.nextBefore); setFailedBefore(undefined);
    } catch {
      if (account !== identity.current || revision !== request.current) return;
      setFailedBefore(before); setError("Não foi possível carregar os avisos.");
    } finally {
      if (account === identity.current && revision === request.current) { setLoading(false); setMoreLoading(false); }
    }
  }, [unread]);
  useEffect(() => {
    invalidate(); setItems([]); setBusy(false); setNextBefore(null); setError(""); setMoreLoading(false);
    if (status === "loading") return;
    if (status !== "authenticated") { setLoading(false); return; }
    setLoading(true); void refresh();
    const update = () => void refresh();
    socket.on("notification-updated", update); socket.on("connect", update);
    return () => { invalidate(); socket.off("notification-updated", update); socket.off("connect", update); };
  }, [refresh, invalidate, socket, status, session?.user?.id]);
  async function mark(id: string | null) {
    if (busy) return;
    const account = identity.current;
    const requestedFilter = unreadRef.current;
    setBusy(true);
    try {
      const result = await markNotificationRead(id);
      if (account !== identity.current) return;
      if (!result.success) throw new Error();
      if (requestedFilter === unreadRef.current) await refresh(); window.dispatchEvent(new Event("eventmap-notifications-read"));
    } catch { if (account === identity.current) setError("Não foi possível marcar o aviso. Tente novamente."); }
    finally { if (account === identity.current) setBusy(false); }
  }
  return <main className="w-full px-4 py-6 sm:px-6 lg:px-10"><div className="mx-auto max-w-3xl space-y-6"><header className="flex gap-4"><SidebarTrigger /><FadeInView><h1 className="text-3xl font-bold">Notificações</h1><p className="mt-2 text-muted-foreground">Mudanças dos seus eventos, novidades e lembretes.</p></FadeInView></header>
    {status !== "authenticated" && status !== "loading" ? <Link href="/login" className="text-primary underline">Entre para ver suas notificações</Link> : <><PushSettings /><div className="flex flex-wrap justify-between gap-3"><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={unread} onChange={event => setUnread(event.target.checked)} />Somente não lidas</label><Button variant="outline" disabled={busy || !items.some(item => !item.readAt)} onClick={() => void mark(null)}>Marcar todas como lidas</Button></div>
    {error && <div role="alert" className="rounded-xl border border-destructive/30 p-4"><p>{error}</p><Button variant="outline" className="mt-3" disabled={loading || moreLoading} onClick={() => void refresh(failedBefore)}>Tentar novamente</Button></div>}
    {loading ? <p role="status">Carregando notificações...</p> : !items.length ? <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">{unread ? "Você está em dia. Nenhum aviso não lido." : "Os próximos avisos aparecerão aqui."}</p> : <ol className="space-y-3">{items.map(item => <li key={item.id} className={"rounded-2xl border bg-card p-5 " + (!item.readAt ? "border-primary/40" : "")}><div className="flex flex-wrap items-start justify-between gap-3"><h2 className="min-w-0 break-words font-semibold">{!item.readAt && <span className="mr-2 text-primary" aria-label="Não lida">●</span>}{item.title}</h2><time dateTime={item.createdAt} className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.createdAt))}</time></div><p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.message}</p><div className="mt-4 flex flex-wrap gap-4">{item.href.startsWith("/") && !item.href.startsWith("//") && <Link href={item.href} onClick={() => { if (!item.readAt) void mark(item.id); }} className="text-sm font-semibold text-primary">Ver detalhes →</Link>}{!item.readAt && <button type="button" disabled={busy} onClick={() => void mark(item.id)} className="text-sm underline">Marcar como lida</button>}</div></li>)}</ol>}
    {!loading && nextBefore && <div className="text-center"><Button variant="outline" disabled={moreLoading} onClick={() => void refresh(nextBefore)}>{moreLoading ? "Carregando..." : "Carregar avisos anteriores"}</Button></div>}</>}
  </div></main>;
}
