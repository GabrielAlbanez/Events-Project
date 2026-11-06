"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { CheckCheck, SlidersHorizontal } from "lucide-react";
import { toast } from "react-toastify";
import { useSocket } from "@/context/SocketContext";
import { getNotificationPage, getNotificationCounts, markNotificationRead, undoNotificationRead } from "@/app/(actions)/engagement/action";
import type { NotificationDTO } from "@/types/features";
import type { NotificationCategory } from "@/lib/notifications/catalog";
import PushSettings from "@/components/MyComponents/PushSettings";
import { Button } from "@/components/ui/button";
import { NotificationEmpty, NotificationList, NotificationSkeleton } from "@/components/MyComponents/notifications/NotificationList";

const categories = ["Todas", "Eventos", "Comunidade", "Conexões", "Sistema"] as const;
const emptyCounts = { total: 0, Eventos: 0, Comunidade: 0, Conexões: 0, Sistema: 0 };

export default function Notifications() {
  const { data: session, status } = useSession();
  const socket = useSocket();
  const identity = useRef(session?.user?.id);
  identity.current = status === "authenticated" ? session?.user?.id : undefined;
  const request = useRef(0);
  const mutation = useRef(false);
  const mounted = useRef(true);
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [owner, setOwner] = useState<string>();
  const [counts, setCounts] = useState(emptyCounts);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [unread, setUnread] = useState(false);
  const [category, setCategory] = useState<typeof categories[number]>("Todas");
  const [failedBefore, setFailedBefore] = useState<string | undefined>();
  const invalidate = useCallback(() => { request.current++; }, []);
  const unreadRef = useRef(unread); unreadRef.current = unread;
  const refresh = useCallback(async (before?: string, quiet = false) => {
    if (!identity.current) return;
    const account = identity.current;
    const revision = ++request.current;
    if (before) setMoreLoading(true); else if (!quiet) setLoading(true);
    setError("");
    try {
      const [result, totals] = await Promise.all([getNotificationPage({ before, unread, category: category === "Todas" ? undefined : category as NotificationCategory }), getNotificationCounts()]);
      if (account !== identity.current || revision !== request.current || !mounted.current) return;
      setItems(previous => before ? [...previous, ...result.items.filter(item => !previous.some(existing => existing.id === item.id))] : quiet ? [...result.items, ...previous.filter(item => !result.items.some(fresh => fresh.id === item.id) && (!unread || !item.readAt))] : result.items);
      setCounts(totals); setOwner(account);
      if (!quiet || before) setNextBefore(result.nextBefore);
      setFailedBefore(undefined);
    } catch {
      if (account !== identity.current || revision !== request.current || !mounted.current) return;
      setFailedBefore(before); setError("Não foi possível atualizar suas notificações. Tente novamente.");
    } finally {
      if (account === identity.current && revision === request.current && mounted.current) { setLoading(false); setMoreLoading(false); }
    }
  }, [unread, category]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; invalidate(); }; }, [invalidate]);
  useEffect(() => {
    invalidate(); setItems([]); setBusy(false); mutation.current = false; setNextBefore(null); setError(""); setMoreLoading(false); setCounts(emptyCounts);
    if (status === "loading") return;
    if (status !== "authenticated") { setLoading(false); setOwner(undefined); return; }
    setLoading(true); void refresh();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => { clearTimeout(timer); timer = setTimeout(() => { if (!mutation.current) void refresh(undefined, true); }, 400); };
    const read = (event: Event) => { if ((event as CustomEvent<{ source?: string }>).detail?.source !== "page") update(); };
    socket.on("notification-updated", update); socket.on("connect", update);
    window.addEventListener("eventmap-notifications-read", read);
    return () => { invalidate(); clearTimeout(timer); socket.off("notification-updated", update); socket.off("connect", update); window.removeEventListener("eventmap-notifications-read", read); };
  }, [refresh, invalidate, socket, status, session?.user?.id]);
  async function mark(id: string | null) {
    if (mutation.current || !identity.current) return;
    const account = identity.current;
    const previous = items;
    const requestedFilter = unreadRef.current;
    mutation.current = true; setBusy(true); invalidate();
    setItems(current => current.map(item => !item.readAt && (!id || item.id === id) ? { ...item, readAt: new Date().toISOString() } : item).filter(item => !requestedFilter || !item.readAt));
    try {
      const result = await markNotificationRead(id);
      if (account !== identity.current || !mounted.current) return;
      if (!result.success) throw new Error();
      window.dispatchEvent(new CustomEvent("eventmap-notifications-read", { detail: { source: "page" } }));
      const totals = await getNotificationCounts();
      if (account !== identity.current || !mounted.current) return;
      setCounts(totals);
      if (id && result.readAt) {
        const readAt = result.readAt;
        toast.success(({ closeToast }) => <div className="flex flex-wrap items-center justify-between gap-2"><span>Notificação marcada como lida.</span><button type="button" className="min-h-11 rounded-md px-2 text-sm font-semibold text-brand underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" onClick={() => { closeToast(); void (async () => {
          if (account !== identity.current || !mounted.current) return;
          try { const undone = await undoNotificationRead(id, readAt); if (account !== identity.current || !mounted.current) return; if (!undone.success) throw new Error(); await refresh(undefined, false); window.dispatchEvent(new CustomEvent("eventmap-notifications-read", { detail: { source: "page" } })); }
          catch { if (account === identity.current && mounted.current) setError("Não foi possível desfazer. Atualize suas notificações."); }
        })(); }}>Desfazer</button></div>, { autoClose: 6000, pauseOnHover: true, closeOnClick: false });
      } else toast.success("Todas as notificações foram marcadas como lidas.");
    } catch { if (account === identity.current && mounted.current) { setItems(previous); setError("Não foi possível marcar o aviso. Tente novamente."); } }
    finally { if (account === identity.current && mounted.current) { mutation.current = false; setBusy(false); } }
  }
  const visibleItems = owner === identity.current ? items : [];
  return <main className="w-full px-4 pb-28 pt-8 sm:px-6 sm:pt-12 lg:px-10"><div className="mx-auto max-w-4xl"><header className="mb-8 flex items-start justify-between gap-4"><div><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Notificações</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">O que importa para seus eventos e encontros, em um só lugar.</p></div><span aria-hidden="true" className="hidden size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-brand sm:grid"><CheckCheck className="size-6" /></span></header>
    {status !== "authenticated" && status !== "loading" ? <Link href="/login" className="inline-flex min-h-11 items-center text-brand underline">Entre para ver suas notificações</Link> : <><div className="mb-6"><PushSettings /></div><section aria-label="Central de notificações" className="overflow-hidden rounded-3xl border bg-card"><div className="border-b px-4 pt-3 sm:px-6"><div role="tablist" aria-label="Categorias de notificações" className="flex overflow-x-auto" onKeyDown={event => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')); const current = tabs.indexOf(document.activeElement as HTMLButtonElement); const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length; tabs[next]?.focus(); tabs[next]?.click(); }}>{categories.map(value => { const total = owner === identity.current ? counts[value === "Todas" ? "total" : value] : 0; return <button key={value} type="button" role="tab" aria-selected={category === value} aria-controls="notifications-content" id={`notification-tab-${value}`} tabIndex={category === value ? 0 : -1} onClick={() => setCategory(value)} className={`inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium outline-offset-[-3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${category === value ? "border-primary text-brand" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{value}{total > 0 && <span className={`rounded-full px-1.5 py-0.5 text-xs tabular-nums ${category === value ? "bg-primary/10" : "bg-muted"}`}>{total > 99 ? "99+" : total}<span className="sr-only"> não lidas</span></span>}</button>; })}</div></div><div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b px-4 py-3 sm:px-6"><label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm"><SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden="true" /><input type="checkbox" checked={unread} onChange={event => setUnread(event.target.checked)} className="size-4 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" />Somente não lidas</label><Button variant="ghost" className="min-h-11 text-xs sm:text-sm" disabled={busy || counts.total === 0 || loading} onClick={() => void mark(null)}>Marcar todas como lidas</Button></div><div id="notifications-content" role="tabpanel" aria-labelledby={`notification-tab-${category}`} aria-busy={loading || moreLoading} className="p-3 sm:p-6">
    {error && <div role="alert" className="mb-4 rounded-xl border border-destructive/30 p-4 text-sm"><p>{error}</p><Button variant="outline" className="mt-3 min-h-11" disabled={loading || moreLoading} onClick={() => void refresh(failedBefore)}>Tentar novamente</Button></div>}
    {loading ? <NotificationSkeleton /> : !visibleItems.length ? <NotificationEmpty filtered={unread || category !== "Todas"} /> : <NotificationList items={visibleItems} busy={busy} onRead={item => void mark(item.id)} />}
    {!loading && nextBefore && <div className="pt-6 text-center"><Button variant="outline" className="min-h-11" disabled={moreLoading} onClick={() => void refresh(nextBefore)}>{moreLoading ? <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" aria-label="Carregando anteriores" /> : "Carregar notificações anteriores"}</Button></div>}</div></section></>}
  </div></main>;
}
