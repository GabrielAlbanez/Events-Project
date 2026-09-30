"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { Socket } from "socket.io-client";
import { toast } from "react-toastify";
import { socket } from "@/lib/socketClient";

const SocketContext = createContext<Socket | null>(null);
const SocketStatusContext = createContext(false);
type EventValidatedNotice = { eventId: string; eventName: string; validatedAt: string };

export function SocketProvider({ children }: { children: ReactNode }) {
  const { data: session, status, update } = useSession();
  const userId = session?.user?.id;
  const provider = session?.user?.provider;
  const role = session?.user?.role;
  const [isConnected, setIsConnected] = useState(socket.connected);
  const shownValidations = useRef(new Set<string>());

  useEffect(() => {
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
    };
  }, []);

  useEffect(() => {
    if (status === "loading") {
      socket.disconnect();
      setIsConnected(false);
      return;
    }
    socket.connect();
    setIsConnected(socket.connected);
    return () => {
      if (userId && socket.connected) socket.emit("user-disconnected");
      socket.disconnect();
      setIsConnected(false);
    };
  }, [status, userId, provider, role]);

  useEffect(() => {
    shownValidations.current.clear();
  }, [userId]);

  useEffect(() => {
    const handleRoleChange = ({ newRole }: { newRole: string }) => {
      toast.success(`Sua permissão agora é ${newRole}.`);
      void update();
    };
    socket.on("role-mudar", handleRoleChange);
    return () => { socket.off("role-mudar", handleRoleChange); };
  }, [update]);

  useEffect(() => {
    if (session?.user?.role !== "PROMOTER") return;
    const handleValidated = (notice: EventValidatedNotice) => {
      if (!notice || typeof notice.eventId !== "string" || typeof notice.validatedAt !== "string") return;
      const key = `${notice.eventId}:${notice.validatedAt}`;
      if (shownValidations.current.has(key)) return;
      shownValidations.current.add(key);
      if (shownValidations.current.size > 100) {
        const oldest = shownValidations.current.values().next().value;
        if (oldest) shownValidations.current.delete(oldest);
      }
      const name = typeof notice.eventName === "string" && notice.eventName.trim() ? notice.eventName : "Seu evento";
      toast.success(<span><strong>{name}</strong> foi validado. <Link href="/myEvents" className="font-semibold underline underline-offset-2">Ver meus eventos</Link></span>);
    };
    socket.on("event-validated", handleValidated);
    return () => { socket.off("event-validated", handleValidated); };
  }, [session?.user?.role]);

  return (
    <SocketContext.Provider value={socket}>
      <SocketStatusContext.Provider value={isConnected}>{children}</SocketStatusContext.Provider>
    </SocketContext.Provider>
  );
}

export function useSocket(): Socket {
  const context = useContext(SocketContext);
  if (!context) throw new Error("useSocket deve ser usado dentro de um SocketProvider");
  return context;
}

export function useSocketStatus(): boolean {
  return useContext(SocketStatusContext);
}
