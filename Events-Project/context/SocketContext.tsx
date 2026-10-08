"use client";



import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import Link from "next/link";

import { signOut, useSession } from "next-auth/react";

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

  const expires = session?.expires;

  const impersonationId = session?.impersonation?.expiresAt;

  const [isConnected, setIsConnected] = useState(socket.connected);

  const [removalPending, setRemovalPending] = useState(false);

  const [revokedReason, setRevokedReason] = useState<"account-removed" | "credentials-changed" | "account-suspended">("account-removed");

  const shownValidations = useRef(new Set<string>());

  const lastSessionRecovery = useRef(0);

  const identity = `${status}:${userId ?? ""}:${provider ?? ""}:${role ?? ""}:${impersonationId ?? ""}`;

  const currentIdentity = useRef(identity);

  currentIdentity.current = identity;

  const removedIdentity = useRef<string | null>(null);

  const sessionError = session?.error;

  const removalFlight = useRef<{ userId: string | undefined; generation: number } | null>(null);

  const removalGeneration = useRef(0);



  useEffect(() => {

    if (userId && !sessionError && removalFlight.current && userId !== removalFlight.current.userId) {

      removalGeneration.current++;

      removalFlight.current = null;

      setRemovalPending(false);

    }

  }, [userId, sessionError]);



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

    let active = true;

    let recovering = false;

    const endSession = (reason: "account-removed" | "credentials-changed" | "account-suspended") => {

      if (!active || currentIdentity.current !== identity || removalFlight.current || removedIdentity.current === identity) return;

      const generation = ++removalGeneration.current;

      removalFlight.current = { userId, generation };

      removedIdentity.current = identity;

      setRevokedReason(reason);

      setRemovalPending(true);

      socket.disconnect();

      setIsConnected(false);

      toast.error(reason === "account-suspended" ? "Sua conta foi suspensa pelo administrador. Sua sessão será encerrada." : reason === "account-removed" ? "Sua conta foi banida do site pelo administrador. Você foi desconectado." : "Sua sessão foi encerrada por segurança. Entre novamente para continuar.", { toastId: reason, autoClose: false });

      const callbackUrl = `/login?notice=${reason}`;

      const redirectRemoved = () => {

        if (removalGeneration.current === generation) window.location.assign(callbackUrl);

      };

      void signOut({ redirect: false, callbackUrl }).then(redirectRemoved).catch(() => {

        // Keep the socket closed if the sign-out request fails; a reload revalidates the session.

        redirectRemoved();

      });

    };

    const handleAccountSuspended = () => endSession("account-suspended");

      const handleAccountRemoved = () => endSession("account-removed");

    const handleSessionRevoked = () => endSession("credentials-changed");

    const handleAccountImpersonated = () => {

      if (!active || currentIdentity.current !== identity) return;

      socket.disconnect(); setIsConnected(false);

      void update().catch(() => undefined);

    };

    const handleConnectError = (error: Error & { data?: { code?: string } }) => {

      if (error.data?.code === "ACCOUNT_SUSPENDED") handleAccountSuspended();

      else if (error.data?.code === "ACCOUNT_REMOVED") handleAccountRemoved();

      else if (error.data?.code === "SESSION_REVOKED") handleSessionRevoked();

      else if (error.data?.code === "ACCOUNT_IMPERSONATED") handleAccountImpersonated();

      else if (error.data?.code === "IMPERSONATION_CHANGED") {

        socket.disconnect(); setIsConnected(false); void update().catch(() => undefined);

      }

    };

    const handleSessionExpired = () => {

      if (!active || currentIdentity.current !== identity || removalFlight.current || removedIdentity.current === identity) return;

      socket.disconnect();

      setIsConnected(false);

      // A failed refresh must not create a reconnect loop with the expired cookie.

      if (recovering || Date.now() - lastSessionRecovery.current < 30000) return;

      recovering = true;

      lastSessionRecovery.current = Date.now();

      void update().then(refreshed => {

        if (refreshed?.error === "AccountSuspended") { handleAccountSuspended(); return; }

        if (refreshed?.error === "SessionRevoked") { handleSessionRevoked(); return; }

        if (refreshed?.error === "AccountRemoved") { handleAccountRemoved(); return; }

        if (refreshed?.error === "SessionUnavailable") return;

        if (refreshed?.error === "AccountImpersonated") return;

        if (active && currentIdentity.current === identity && !removalFlight.current && removedIdentity.current !== identity) socket.connect();

      }).catch(() => {

        // Remain disconnected until a later authentication change or page reload.

      }).finally(() => {

        recovering = false;

      });

    };

    socket.on("session-expired", handleSessionExpired);

    socket.on("account-suspended", handleAccountSuspended);

    socket.on("account-removed", handleAccountRemoved);

    socket.on("account-impersonated", handleAccountImpersonated);

    socket.on("connect_error", handleConnectError);

    if (sessionError === "AccountSuspended") handleAccountSuspended();

    else if (sessionError === "AccountRemoved") handleAccountRemoved();

    else if (sessionError === "SessionRevoked") handleSessionRevoked();

    else if (sessionError === "SessionUnavailable" || sessionError === "AccountImpersonated" || removalFlight.current) socket.disconnect();

    else if (removedIdentity.current !== identity) socket.connect();

    setIsConnected(socket.connected);

    return () => {

      active = false;

      socket.off("session-expired", handleSessionExpired);

      socket.off("account-suspended", handleAccountSuspended);

      socket.off("account-removed", handleAccountRemoved);

      socket.off("account-impersonated", handleAccountImpersonated);

      socket.off("connect_error", handleConnectError);

      if (userId && socket.connected) socket.emit("user-disconnected");

      socket.disconnect();

      setIsConnected(false);

    };

  }, [status, userId, provider, role, expires, update, identity, sessionError]);



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
    const handleProfileImageUpdate = (notice: unknown) => {
      if (!notice || typeof notice !== "object" || !("userId" in notice)
        || typeof notice.userId !== "string" || notice.userId !== userId) return;
      void update();
    };
    socket.on("profile-image-updated", handleProfileImageUpdate);
    return () => { socket.off("profile-image-updated", handleProfileImageUpdate); };
  }, [update, userId]);

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

      <SocketStatusContext.Provider value={isConnected}>

        {removalPending ? <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/95 p-6" role="alertdialog" aria-modal="true" aria-labelledby="account-removed-title" aria-describedby="account-removed-description"><div className="w-full max-w-md rounded-2xl border border-destructive/30 bg-card p-6 shadow-xl"><h2 id="account-removed-title" tabIndex={-1} ref={node => node?.focus()} className="text-xl font-semibold outline-none">{revokedReason === "account-suspended" ? "Sua conta foi suspensa" : revokedReason === "account-removed" ? "Sua conta foi banida do site" : "Sessão encerrada por segurança"}</h2><p id="account-removed-description" className="mt-3 text-sm leading-relaxed text-muted-foreground">{revokedReason === "account-suspended" ? "O acesso foi suspenso pelo administrador. Estamos encerrando sua sessão com segurança." : revokedReason === "account-removed" ? "O administrador removeu sua conta. Estamos encerrando sua sessão com segurança." : "Estamos encerrando esta sessão. Entre novamente para continuar."}</p><p role="status" className="mt-5 text-sm font-medium text-primary">Desconectando...</p></div></div> : children}

      </SocketStatusContext.Provider>

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
