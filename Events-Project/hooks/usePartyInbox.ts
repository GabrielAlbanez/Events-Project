"use client";

import { useEffect } from "react";
import { useCommunityResource } from "@/components/MyComponents/CommunityResource";
import { useSocket } from "@/context/SocketContext";
import type { PartyInboxSnapshot } from "@/types/partyConnections";
import { inboxUnreadTotal } from "@/utils/partyInbox";

/** Global conversation list. Personal socket signals, focus and reconnection trigger a debounced refresh. */
export function usePartyInbox() {
  const resource = useCommunityResource<PartyInboxSnapshot>("/api/party-inbox");
  const socket = useSocket();
  const { refresh } = resource;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (document.visibilityState !== "hidden" && navigator.onLine) void refresh(); }, 400);
    };
    const visible = () => { if (document.visibilityState === "visible") schedule(); };
    window.addEventListener("focus", schedule);
    window.addEventListener("online", schedule);
    document.addEventListener("visibilitychange", visible);
    socket.on("notification-updated", schedule);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", schedule);
      window.removeEventListener("online", schedule);
      document.removeEventListener("visibilitychange", visible);
      socket.off("notification-updated", schedule);
    };
  }, [refresh, socket]);
  const items = resource.data?.items ?? [];
  return { ...resource, items, unreadTotal: inboxUnreadTotal(items) };
}
export type PartyInboxResource = ReturnType<typeof usePartyInbox>;
