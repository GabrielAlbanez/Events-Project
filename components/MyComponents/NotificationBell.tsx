"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useSocket } from "@/context/SocketContext";
import { getNotifications } from "@/app/(actions)/engagement/action";
export default function NotificationBell(){
 const {data:session,status}=useSession();const socket=useSocket();const identity=useRef(session?.user?.id);identity.current=session?.user?.id;const [count,setCount]=useState(0);const [error,setError]=useState(false);
 const refresh=useCallback(async()=>{try{const requestedIdentity=identity.current;const items=await getNotifications();if(requestedIdentity!==identity.current)return;setCount(items.filter(item=>!item.readAt).length);setError(false);}catch{setError(true);}},[]);
 useEffect(()=>{if(status!=='authenticated'){setCount(0);return;}void refresh();const update=()=>void refresh();socket.on('notification-updated',update);socket.on('connect',update);window.addEventListener('eventmap-notifications-read',update);return()=>{socket.off('notification-updated',update);socket.off('connect',update);window.removeEventListener('eventmap-notifications-read',update);};},[refresh,socket,status,session?.user?.id]);
 if(status!=='authenticated')return null;
 return <Link href="/notificacoes" aria-label={error?'Abrir notificações; contagem indisponível':'Abrir notificações, '+count+' não lidas'} className="fixed bottom-5 right-5 z-40 inline-flex h-11 items-center gap-2 rounded-full border bg-card px-3 text-foreground shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><Bell className="h-4 w-4" aria-hidden="true" />{count>0&&<span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">{count>99?'99+':count}</span>}<span className="sr-only">Notificações</span></Link>;
}
