"use client";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { useSocket } from "@/context/SocketContext";
import { getNotifications } from "@/app/(actions)/engagement/action";
import type { NotificationDTO } from "@/types/features";
import { NotificationBanners } from "./NotificationBanners";
export default function NotificationBell(){
 const pathname=usePathname();
 const { data: session, status } = useSession();
 const socket = useSocket();
 const userId = session?.user?.id;
 const [count, setCount] = useState(0);
 const [error, setError] = useState(false);
 const [banners, setBanners] = useState<{ userId: string; items: NotificationDTO[] }>();
 const seen = useRef<{ userId: string; ids: Set<string> }>();

 useEffect(() => {
  if (status !== "authenticated" || !userId) {
   seen.current = undefined;
   setBanners(undefined);
   setCount(0);
   return;
  }
  if (seen.current?.userId !== userId) {
   seen.current = undefined;
   setBanners(undefined);
   setCount(0);
   setError(false);
  }
  const owner = userId;
  let active = true;
  let running = false;
  let pending = false;
  let notify = false;
  async function refresh(announce = false) {
   pending = true;
   notify ||= announce;
   if (running) return;
   running = true;
   while (active && pending) {
    pending = false;
    const announceThisFetch = notify;
    notify = false;
    try {
     const items = await getNotifications();
     if (!active) return;
     const unread = items.filter(item => !item.readAt);
     setCount(unread.length);
     setError(false);
     const previous = seen.current?.ids;
     if (previous && (announceThisFetch || notify)) {
      const added = unread.filter(item => !previous.has(item.id)).reverse();
      if (added.length) {
       setBanners(current => ({
        userId: owner,
        items: [...(current?.userId === owner ? current.items : []), ...added].slice(0, 50),
       }));
      }
     }
     seen.current = { userId: owner, ids: new Set(items.map(item => item.id)) };
    } catch {
     notify ||= announceThisFetch;
     if (active) setError(true);
    }
   }
   running = false;
  }
  const update = () => void refresh();
  const deliver = () => void refresh(true);
  void refresh();
  socket.on("notification-updated", deliver);
  socket.on("connect", update);
  window.addEventListener("eventmap-notifications-read", update);
  return () => {
   active = false;
   socket.off("notification-updated", deliver);
   socket.off("connect", update);
   window.removeEventListener("eventmap-notifications-read", update);
  };
 }, [socket, status, userId]);

 if (status !== "authenticated" || !userId) return null;
 const visible = banners?.userId === userId ? banners.items.slice(0, 3) : [];

 return <><Link href="/notificacoes" aria-label={error?'Abrir notificações; contagem indisponível':'Abrir notificações, '+count+' não lidas'} className={`fixed right-5 z-40 inline-flex h-11 items-center gap-2 rounded-full border bg-card px-3 text-foreground shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${pathname==='/'?'top-[88px] right-4 md:bottom-5 md:right-5 md:top-auto':'bottom-5'}`}><Bell className="h-4 w-4" aria-hidden="true" />{count>0&&<span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">{count>99?'99+':count}</span>}<span className="sr-only">Notificações</span></Link>
  <NotificationBanners key={userId} items={visible} onDismiss={id => setBanners(current => current?.userId === userId ? { userId, items: current.items.filter(item => item.id !== id) } : current)} />
 </>;
}
