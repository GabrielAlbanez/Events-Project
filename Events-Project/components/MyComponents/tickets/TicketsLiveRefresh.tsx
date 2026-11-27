"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSocketStatus } from "@/context/SocketContext";
import { useRegistrationLive } from "@/hooks/useRegistrationLive";

/** Re-reads the server-rendered ticket list. router.refresh keeps client state, so an open QR stays open. */
export default function TicketsLiveRefresh() {
  const router = useRouter();
  const connected = useSocketStatus();
  const refresh = useCallback(() => { router.refresh(); }, [router]);
  useRegistrationLive({ refresh, intervalMs: connected ? null : 30000 });
  return null;
}
