"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useSocket } from "@/context/SocketContext";
import type { CommunityRealtimeStatus } from "@/hooks/useCommunityRealtime";

export type ActivitySubscriptions = { eventIds: string[]; roomIds: string[] };

/** Bounded subscriptions; HTTP also reconciles activities outside the live window. */
export function useActivityRealtime(subscriptions: ActivitySubscriptions, refresh: () => Promise<void> | void): CommunityRealtimeStatus {
  const socket = useSocket();
  const { data: session, status } = useSession();
  const eventIds = Array.from(new Set(subscriptions.eventIds)).sort().slice(0, 12);
  const roomIds = Array.from(new Set(subscriptions.roomIds)).sort().slice(0, 6);
  const key = JSON.stringify({ eventIds, roomIds });
  const identity = `${status}:${session?.user?.id ?? "guest"}:${session?.user?.role ?? "guest"}`;
  const [state, setState] = useState<{ identity: string; status: CommunityRealtimeStatus }>({ identity, status: "connecting" });
  const callback = useRef(refresh);
  callback.current = refresh;
  const subscriptionsKey = useRef(key);
  subscriptionsKey.current = key;
  const reconcile = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (status !== "authenticated" || !session?.user?.id) {
      setState({ identity, status: "denied" }); return;
    }
    const makeTargets = () => {
      const ids: ActivitySubscriptions = JSON.parse(subscriptionsKey.current);
      return [
      { room: `user:${session.user.id}`, payload: { user: true } },
      ...ids.eventIds.map(eventId => ({ room: `event:${eventId}`, payload: { eventId } })),
      ...ids.roomIds.map(roomId => ({ room: `friends:${roomId}`, payload: { roomId } })),
      ];
    };
    let targets = makeTargets();
    const rooms = new Set(targets.map(target => target.room));
    const joined = new Set<string>();
    const rejected = new Set<string>();
    const joining = new Set<string>();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const attempted = new Map<string, number>();
    const versions = new Map<string, number>();
    let serial = 0;
    let active = true;
    let generation = 0;
    let busy = false;
    let pending = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const available = () => navigator.onLine && document.visibilityState !== "hidden";
    const update = () => {
      if (active) setState({ identity, status: joined.size === targets.length ? "live" : joining.size ? "connecting" : "fallback" });
    };
    const refetch = () => {
      if (!active) return;
      if (!available() || busy) { pending = true; return; }
      if (debounce) return;
      debounce = setTimeout(() => {
        debounce = undefined;
        if (!active || !available()) { pending = true; return; }
        pending = false; busy = true;
        void Promise.resolve().then(() => active ? callback.current() : undefined).catch(() => {
          // The resource owns visible HTTP failures.
        }).finally(() => {
          busy = false;
          if (active && pending) refetch();
        });
      }, 150);
    };
    const join = () => {
      if (!active || !socket.connected || !available()) return;
      for (const target of targets) {
        if (joined.has(target.room) || joining.has(target.room) || rejected.has(target.room)) continue;
        // The gateway limits subscribe requests to 40 per minute.
        if (Date.now() - (attempted.get(target.room) ?? 0) < 61000) continue;
        attempted.set(target.room, Date.now()); joining.add(target.room);
        const attempt = generation;
        const version = ++serial;
        versions.set(target.room, version);
        timers.set(target.room, setTimeout(() => {
          if (!active || attempt !== generation || versions.get(target.room) !== version) return;
          timers.delete(target.room); joining.delete(target.room); update();
        }, 4000));
        socket.emit("community-subscribe", target.payload, (reply: { ok?: boolean; reason?: string }) => {
          if (!active || attempt !== generation || versions.get(target.room) !== version || !joining.has(target.room)) return;
          const timer = timers.get(target.room); if (timer) clearTimeout(timer);
          timers.delete(target.room); joining.delete(target.room);
          if (reply?.ok) joined.add(target.room);
          else if (reply?.reason === "denied") rejected.add(target.room);
          update(); refetch();
        });
      }
      update();
    };
    const disconnect = () => {
      ++generation; joined.clear(); joining.clear(); rejected.clear();
      versions.clear();
      timers.forEach(clearTimeout); timers.clear(); update();
    };
    const connect = () => { attempted.clear(); join(); refetch(); };
    const changed = (payload: { room?: string }) => { if (payload?.room && rooms.has(payload.room)) refetch(); };
    const denied = (payload: { room?: string }) => {
      if (!payload?.room || !rooms.has(payload.room)) return;
      versions.delete(payload.room); joining.delete(payload.room);
      const timer = timers.get(payload.room); if (timer) clearTimeout(timer);
      timers.delete(payload.room);
      joined.delete(payload.room); rejected.add(payload.room); update(); refetch();
    };
    const foreground = () => { if (available()) { join(); refetch(); } };
    reconcile.current = () => {
      const next = makeTargets();
      const desired = new Set(next.map(target => target.room));
      for (const target of targets) {
        if (desired.has(target.room)) continue;
        if (socket.connected) socket.emit("community-unsubscribe", target.payload);
        joined.delete(target.room); joining.delete(target.room); rejected.delete(target.room);
        versions.delete(target.room); attempted.delete(target.room);
        const timer = timers.get(target.room); if (timer) clearTimeout(timer);
        timers.delete(target.room); rooms.delete(target.room);
      }
      targets = next;
      targets.forEach(target => rooms.add(target.room));
      join(); update();
    };
    socket.on("connect", connect); socket.on("disconnect", disconnect);
    socket.on("community-updated", changed); socket.on("community-access-denied", denied);
    socket.on("update-events", refetch); socket.on("notification-updated", refetch);
    document.addEventListener("visibilitychange", foreground);
    window.addEventListener("focus", foreground); window.addEventListener("online", foreground);
    window.addEventListener("offline", disconnect);
    join(); update();
    // New memberships and items outside the bounded subscription set still appear.
    const fallback = setInterval(() => { if (available()) { join(); refetch(); } }, 30000);
    return () => {
      active = false; ++generation;
      reconcile.current = null;
      if (debounce) clearTimeout(debounce);
      timers.forEach(clearTimeout); clearInterval(fallback);
      socket.off("connect", connect); socket.off("disconnect", disconnect);
      socket.off("community-updated", changed); socket.off("community-access-denied", denied);
      socket.off("update-events", refetch); socket.off("notification-updated", refetch);
      document.removeEventListener("visibilitychange", foreground);
      window.removeEventListener("focus", foreground); window.removeEventListener("online", foreground);
      window.removeEventListener("offline", disconnect);
      if (socket.connected) targets.forEach(target => socket.emit("community-unsubscribe", target.payload));
    };
  }, [socket, status, session?.user?.id, identity]);
  useEffect(() => { reconcile.current?.(); }, [key]);
  return state.identity === identity ? state.status : "connecting";
}
