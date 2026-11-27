"use client";

import { useEffect, useRef } from "react";
import { useSocket } from "@/context/SocketContext";

const BURST_MS = 250;
const JITTER = 0.15;

type RegistrationLiveOptions = {
  /** Background re-read. It must handle its own errors quietly: never a full-screen loading state or a repeated toast. */
  refresh: () => Promise<unknown> | void;
  /** Fallback interval while the tab is visible; null keeps only the signals and the return to the tab. */
  intervalMs: number | null;
  enabled?: boolean;
  /** Also runs the first read (for screens without their own initial load). */
  immediate?: boolean;
};

/** Keeps a registration screen current from `notification-updated`, with one timer and one request at a time. */
export function useRegistrationLive({ refresh, intervalMs, enabled = true, immediate = false }: RegistrationLiveOptions): void {
  const socket = useSocket();
  const latestRefresh = useRef(refresh);
  useEffect(() => { latestRefresh.current = refresh; }, [refresh]);
  // Changing the interval only re-arms the timer: resubscribing on connect would cancel the pending reconnect refresh.
  const latestInterval = useRef(intervalMs);
  const rearm = useRef<(() => void) | null>(null);
  useEffect(() => { latestInterval.current = intervalMs; rearm.current?.(); }, [intervalMs]);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let running = false;
    let queued = false;
    let burstTimer: number | undefined;
    let pollTimer: number | undefined;
    const canFetch = () => document.visibilityState === "visible" && navigator.onLine !== false;
    const schedule = () => {
      window.clearTimeout(pollTimer);
      const interval = latestInterval.current;
      if (disposed || running || interval === null || !canFetch()) return;
      pollTimer = window.setTimeout(() => { void run(); }, interval * (1 - JITTER + Math.random() * 2 * JITTER));
    };
    const run = async (): Promise<void> => {
      if (disposed) return;
      if (running) { queued = true; return; }
      window.clearTimeout(pollTimer);
      // Hidden or offline: stop here; returning to the tab or network wakes it up.
      if (!canFetch()) { queued = false; return; }
      running = true;
      try {
        await latestRefresh.current();
      } catch {
        // Background read: the next signal or interval tries again, and the last good state stays on screen.
      } finally {
        running = false;
      }
      if (disposed) return;
      if (queued) { queued = false; void run(); return; }
      schedule();
    };
    const signal = () => {
      window.clearTimeout(burstTimer);
      burstTimer = window.setTimeout(() => { void run(); }, BURST_MS);
    };
    const wake = () => { if (canFetch()) signal(); else window.clearTimeout(pollTimer); };

    socket.on("notification-updated", signal);
    socket.on("connect", signal);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    window.addEventListener("offline", wake);
    rearm.current = schedule;
    if (immediate) void run(); else schedule();
    return () => {
      disposed = true;
      rearm.current = null;
      window.clearTimeout(burstTimer);
      window.clearTimeout(pollTimer);
      socket.off("notification-updated", signal);
      socket.off("connect", signal);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", wake);
    };
  }, [socket, enabled, immediate]);
}
