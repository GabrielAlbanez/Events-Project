"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Bell, CheckCheck, X } from "lucide-react";
import { useSocket } from "@/context/SocketContext";
import { getNotificationPage, getRecentNotifications, getUnreadCount, markNotificationRead } from "@/app/(actions)/engagement/action";
import type { NotificationDTO } from "@/types/features";
import { Dialog, DialogClose, DialogDescription, DialogPortal, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { NotificationBanners } from "./NotificationBanners";
import { NotificationEmpty, NotificationList, NotificationSkeleton } from "./notifications/NotificationList";

type BadgeNavigator = Navigator & { setAppBadge?: (count: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

function AccountNotifications({ userId }: { userId: string }) {
  const pathname = usePathname();
  const socket = useSocket();
  const [count, setCount] = useState(0);
  const [countError, setCountError] = useState(false);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [banners, setBanners] = useState<NotificationDTO[]>([]);
  const openRef = useRef(open); openRef.current = open;
  const pathnameRef = useRef(pathname); pathnameRef.current = pathname;
  const mounted = useRef(true);
  const panelRevision = useRef(0);
  const mutation = useRef(false);
  const loadPanel = useCallback(async () => {
    const revision = ++panelRevision.current;
    setError("");
    try {
      const result = await getNotificationPage({ limit: 10 });
      if (mounted.current && revision === panelRevision.current) setItems(result.items);
    } catch { if (mounted.current && revision === panelRevision.current) setError("Seu histórico não carregou. Tente novamente."); }
    finally { if (mounted.current && revision === panelRevision.current) setLoading(false); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    let active = true, running = false, pending = false, announcePending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let since = new Date().toISOString();
    const seen = new Set<string>();
    async function refresh(announce = false) {
      pending = true; announcePending ||= announce;
      if (running) return;
      running = true;
      while (active && pending) {
        pending = false;
        const shouldAnnounce = announcePending; announcePending = false;
        const started = new Date().toISOString();
        try {
          const [total, recent] = await Promise.all([getUnreadCount(), shouldAnnounce ? getRecentNotifications({ since }) : Promise.resolve([] as NotificationDTO[])]);
          if (!active) return;
          setCount(total); setCountError(false);
          if (shouldAnnounce) {
            since = started;
            const fresh = recent.filter(item => !item.readAt && !seen.has(item.id));
            recent.forEach(item => seen.add(item.id));
            if (seen.size > 500) { const keep = Array.from(seen).slice(-250); seen.clear(); keep.forEach(id => seen.add(id)); }
            if (fresh.length && !openRef.current && pathnameRef.current !== "/notificacoes") {
              const incoming = fresh.length > 1 ? [{ id: `summary-${started}`, title: `${fresh.length} novas notificações`, message: "Seus eventos e conexões têm novidades. Veja tudo na sua central.", href: "/notificacoes", createdAt: started, readAt: null, type: "SYSTEM" as const, priority: "normal" as const }] : fresh;
              setBanners(current => [...current, ...incoming].slice(-3));
            }
          }
          if (openRef.current && !mutation.current) void loadPanel();
        } catch { if (active) setCountError(true); }
      }
      running = false;
    }
    const schedule = (announce: boolean) => { announcePending ||= announce; clearTimeout(timer); timer = setTimeout(() => void refresh(announcePending), 400); };
    const deliver = () => schedule(true);
    const update = () => schedule(false);
    const reconnect = () => schedule(true);
    const invalidatePanel = () => { panelRevision.current++; };
    void refresh();
    socket.on("notification-updated", deliver); socket.on("connect", reconnect);
    window.addEventListener("eventmap-notifications-read", update);
    return () => {
      active = false; mounted.current = false; invalidatePanel(); clearTimeout(timer);
      socket.off("notification-updated", deliver); socket.off("connect", reconnect);
      window.removeEventListener("eventmap-notifications-read", update);
    };
  }, [socket, userId, loadPanel]);

  useEffect(() => {
    if (open || pathname === "/notificacoes") setBanners([]);
    if (open) { setLoading(true); void loadPanel(); }
  }, [open, pathname, loadPanel]);

  useEffect(() => {
    const badge = navigator as BadgeNavigator;
    const title = document.title;
    const displayTitle = count > 0 ? `(${count > 99 ? "99+" : count}) EventMap` : title.replace(/^\([^)]*\) /, "");
    document.title = displayTitle;
    if (count > 0) void badge.setAppBadge?.(count).catch(() => undefined);
    else void badge.clearAppBadge?.().catch(() => undefined);
    return () => { if (document.title === displayTitle) document.title = title; void badge.clearAppBadge?.().catch(() => undefined); };
  }, [count, pathname]);

  async function mark(id: string | null) {
    if (mutation.current) return;
    mutation.current = true; setBusy(true); panelRevision.current++;
    try {
      const result = await markNotificationRead(id);
      if (!mounted.current) return;
      if (!result.success) throw new Error();
      setItems(current => current.map(item => !id || item.id === id ? { ...item, readAt: result.readAt ?? new Date().toISOString() } : item));
      window.dispatchEvent(new Event("eventmap-notifications-read"));
    } catch { if (mounted.current) setError("Não foi possível marcar como lida. Tente novamente."); }
    finally { if (mounted.current) { mutation.current = false; setBusy(false); } }
  }

  return <><Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><button type="button" aria-label={countError ? "Abrir notificações; contagem indisponível" : `Abrir notificações, ${count} não lidas`} className={`fixed right-5 z-40 inline-flex h-12 items-center gap-2 rounded-full border border-border bg-card/95 px-4 text-foreground shadow-sm backdrop-blur-md transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none ${pathname === "/" ? "top-[88px] right-4 md:bottom-5 md:right-5 md:top-auto" : "bottom-[max(1.25rem,env(safe-area-inset-bottom))]"}`}><Bell className="size-[18px]" aria-hidden="true" /><span className={`min-w-5 text-center text-xs font-bold tabular-nums ${count > 0 ? "rounded-full bg-primary px-2 py-0.5 text-primary-foreground" : "sr-only"}`}>{count > 99 ? "99+" : count}</span></button></DialogTrigger><span className="sr-only" aria-live="polite" aria-atomic="true">{countError ? "A contagem de notificações está indisponível." : `${count} ${count === 1 ? "notificação não lida" : "notificações não lidas"}.`}</span><DialogPortal><DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/30 backdrop-blur-[2px] motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0" /><DialogPrimitive.Content onKeyDown={event => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || (event.target as HTMLElement).tagName === "INPUT") return;
    const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not([disabled])'));
    const index = targets.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? targets.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + targets.length) % targets.length;
    event.preventDefault(); targets[next]?.focus();
  }} className="fixed inset-x-0 bottom-0 z-[101] flex max-h-[85dvh] flex-col rounded-t-3xl border bg-card shadow-xl outline-none motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=open]:slide-in-from-bottom-2 md:inset-x-auto md:bottom-20 md:right-5 md:w-[420px] md:max-h-[min(75dvh,680px)] md:rounded-3xl"><header className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4"><div><DialogTitle className="text-lg font-semibold tracking-tight">Notificações</DialogTitle><DialogDescription className="mt-1 text-xs leading-5">Seus eventos e conexões, sem perder o momento.</DialogDescription></div><DialogClose asChild><button type="button" aria-label="Fechar notificações" className="-mr-2 -mt-1 grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><X className="size-5" aria-hidden="true" /></button></DialogClose></header><div className="flex shrink-0 justify-end border-b px-4 py-1"><Button variant="ghost" className="min-h-11 gap-2 text-xs" disabled={busy || count === 0} onClick={() => void mark(null)}><CheckCheck className="size-4" aria-hidden="true" />Marcar todas como lidas</Button></div><div className="min-h-0 overflow-y-auto overscroll-contain p-3" aria-busy={loading}>{error && <div role="alert" className="mb-3 rounded-xl border border-destructive/30 p-3 text-sm"><p>{error}</p><Button variant="ghost" className="mt-1 min-h-11" onClick={() => { setLoading(true); void loadPanel(); }}>Tentar novamente</Button></div>}{loading ? <NotificationSkeleton compact /> : items.length ? <NotificationList compact items={items} busy={busy} onRead={item => void mark(item.id)} onOpen={() => setOpen(false)} /> : <NotificationEmpty />}</div><footer className="shrink-0 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"><Link href="/notificacoes" onClick={() => setOpen(false)} className="flex min-h-11 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-brand hover:bg-primary/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Ver todas as notificações</Link></footer></DialogPrimitive.Content></DialogPortal></Dialog><NotificationBanners items={open || pathname === "/notificacoes" ? [] : banners} onDismiss={id => setBanners(current => current.filter(item => item.id !== id))} /></>;
}

export default function NotificationBell() {
  const { data: session, status } = useSession();
  if (status !== "authenticated" || !session?.user?.id) return null;
  return <AccountNotifications key={session.user.id} userId={session.user.id} />;
}
