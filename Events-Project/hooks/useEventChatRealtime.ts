"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useSocket } from "@/context/SocketContext";


export type CommunityRealtimeStatus = "connecting" | "live" | "fallback" | "denied";

/** HTTP snapshots remain authoritative; live means the room subscription was acknowledged. */
export function useEventChatRealtime(eventId: string, refresh: () => Promise<void> | void, onDenied: () => void): CommunityRealtimeStatus {
  const socket = useSocket();
  const { data: session, status } = useSession();
  const identity = `${status}:${session?.user?.id ?? "guest"}:${session?.user?.role ?? "none"}:${eventId}`;
  const [state, setState] = useState<{ identity: string; status: CommunityRealtimeStatus }>({ identity, status: "connecting" });
  const callback = useRef(refresh);
  callback.current = refresh;
  const deniedCallback = useRef(onDenied);
  deniedCallback.current = onDenied;
  useEffect(() => {
    if (status === "loading") return;
    if (!eventId || status !== "authenticated" || !session?.user?.id) {
      deniedCallback.current(); setState({ identity, status: "denied" }); return;
    }
    const subscription = { chatEventId: eventId };
    const room = `chat:${eventId}`;
    let active = true;
    let current: CommunityRealtimeStatus = "connecting";
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let ackTimeout: ReturnType<typeof setTimeout> | undefined;
    let joining = false;
    let generation = 0;
    let refreshing = false;
    let pending = false;
    const available = () => document.visibilityState !== "hidden" && navigator.onLine;
    const changeStatus = (next: CommunityRealtimeStatus) => {
      current = next;
      if (next === "denied") deniedCallback.current();
      if (active) setState({ identity, status: next });
    };
    const refetch = () => {
      if (!active) return;
      if (!available() || refreshing) { pending = true; return; }
      if (debounce) return;
      debounce = setTimeout(() => {
        debounce = undefined;
        if (!active || !available()) { pending = true; return; }
        pending = false; refreshing = true;
        void Promise.resolve().then(() => callback.current()).catch(() => {
          // The resource displays the HTTP error; the subscription status is independent.
        }).finally(() => {
          refreshing = false;
          if (active && pending && available()) refetch();
        });
      }, 150);
    };
    const join = () => {
      if (!active || joining || !socket.connected || !navigator.onLine) return;
      joining = true;
      const attempt = ++generation;
      changeStatus("connecting");
      ackTimeout = setTimeout(() => {
        if (!active || attempt !== generation) return;
        joining = false; ++generation; changeStatus("fallback"); refetch();
      }, 4000);
      socket.emit("community-subscribe", subscription, (result: { ok?: boolean; reason?: string }) => {
        if (!active || attempt !== generation) return;
        if (ackTimeout) clearTimeout(ackTimeout);
        joining = false;
        changeStatus(result?.ok ? "live" : result?.reason === "denied" ? "denied" : "fallback");
        refetch();
      });
    };
    const disconnected = () => {
      ++generation; joining = false;
      if (ackTimeout) clearTimeout(ackTimeout);
      changeStatus("fallback");
    };
    const changed = (payload: { room?: string }) => { if (payload?.room === room) refetch(); };
    const eventsChanged = () => refetch();
    const denied = (payload: { room?: string }) => {
      if (payload?.room !== room) return;
      ++generation; joining = false;
      if (ackTimeout) clearTimeout(ackTimeout);
      changeStatus("denied"); refetch();
    };
    const foreground = () => {
      if (!active || !available()) return;
      if (current !== "live") join();
      refetch();
    };
    const offline = () => disconnected();
    socket.on("connect", join);
    socket.on("disconnect", disconnected);
    socket.on("community-updated", changed);
    socket.on("update-events", eventsChanged);
    socket.on("community-access-denied", denied);
    document.addEventListener("visibilitychange", foreground);
    window.addEventListener("focus", foreground);
    window.addEventListener("online", foreground);
    window.addEventListener("offline", offline);
    if (socket.connected && navigator.onLine) join();
    else changeStatus("fallback");
    // Reauthorize live rooms too: membership can change without a chat message.
    const fallback = setInterval(() => {
      if (!available() || current === "denied") return;
      join(); refetch();
    }, 30000);
    return () => {
      active = false; ++generation;
      if (debounce) clearTimeout(debounce);
      if (ackTimeout) clearTimeout(ackTimeout);
      clearInterval(fallback);
      socket.off("connect", join);
      socket.off("disconnect", disconnected);
      socket.off("community-updated", changed);
      socket.off("update-events", eventsChanged);
      socket.off("community-access-denied", denied);
      document.removeEventListener("visibilitychange", foreground);
      window.removeEventListener("focus", foreground);
      window.removeEventListener("online", foreground);
      window.removeEventListener("offline", offline);
      if (socket.connected) socket.emit("community-unsubscribe", subscription);
    };
  }, [socket, eventId, status, session?.user?.id, identity]);
  return state.identity === identity ? state.status : "connecting";
}

