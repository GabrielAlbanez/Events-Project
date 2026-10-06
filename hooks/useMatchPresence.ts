"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useSocket } from "@/context/SocketContext";

/** A private, authorized presence hint, shared across the local and tunnel servers. */
export function useMatchPresence(matchId: string, enabled = true): boolean | null {
  const socket = useSocket();
  const { data: session, status } = useSession();
  const identity = `${status}:${session?.user?.id ?? "guest"}:${matchId}:${enabled}`;
  const [presence, setPresence] = useState<{ identity: string; online: boolean | null }>({ identity, online: null });
  useEffect(() => {
    if (!enabled || status !== "authenticated") return;
    let active = true;
    let pending = false;
    let generation = 0;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const clear = () => { ++generation; pending = false; if (expiry) clearTimeout(expiry); if (active) setPresence({ identity, online: null }); };
    const query = () => {
      if (!active || pending || !socket.connected || document.visibilityState === "hidden") return;
      pending = true;
      const attempt = ++generation;
      expiry = setTimeout(clear, 4000);
      socket.emit("chat-presence", { matchId }, (reply: { ok?: boolean; online?: boolean }) => {
        if (!active || !pending || attempt !== generation) return;
        pending = false;
        if (expiry) clearTimeout(expiry);
        const online = reply?.ok && typeof reply.online === "boolean" ? reply.online : null;
        setPresence(previous => previous.identity === identity && previous.online === online ? previous : { identity, online });
      });
    };
    socket.on("connect", query);
    socket.on("disconnect", clear);
    document.addEventListener("visibilitychange", query);
    const timer = setInterval(query, 5000);
    query();
    return () => { active = false; clearInterval(timer); if (expiry) clearTimeout(expiry); socket.off("connect", query); socket.off("disconnect", clear); document.removeEventListener("visibilitychange", query); };
  }, [socket, identity, matchId, enabled, status]);
  return presence.identity === identity ? presence.online : null;
}
