"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

export function useCommunityResource<T>(url: string) {
  const { data: session, status } = useSession();
  const identity = url + ":" + status + ":" + (session?.user?.id ?? "anonymous") + ":" + (session?.user?.role ?? "guest");
  const [snapshot, setSnapshot] = useState<{ identity: string; data: T; revision: number; source: "remote" | "own"; at: string } | null>(null);
  const [online, setOnline] = useState(true);
  const revision = useRef(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  const request = useRef<AbortController | null>(null);
  const mutation = useRef(false);
  const mutationRequest = useRef<AbortController | null>(null);
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;

  const fetchSnapshot = useCallback(async (source: "remote" | "own") => {
    if (status === "loading") return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
    setRefreshing(true);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
      if ([401, 403, 404].includes(response.status) && active.current && currentIdentity.current === identity) setSnapshot(null);
      const result = await response.json() as T & { message?: string };
      if (!response.ok) {
        throw new Error(result.message || "Não foi possível carregar. Tente novamente.");
      }
      if (!controller.signal.aborted && active.current && currentIdentity.current === identity) { setSnapshot({ identity, data: result, revision: ++revision.current, source, at: new Date().toISOString() }); setError(""); }
    } catch (cause) {
      if ((!controller.signal.aborted || timedOut) && active.current && currentIdentity.current === identity) setError(timedOut ? "A atualização demorou demais. Tente sincronizar novamente." : cause instanceof Error && !(cause instanceof TypeError || cause instanceof SyntaxError) ? cause.message : "Não foi possível carregar. Confira sua conexão e tente novamente.");
    } finally {
      clearTimeout(timeout);
      if (request.current === controller && active.current && currentIdentity.current === identity) setLoading(false);
      if (request.current === controller && active.current && currentIdentity.current === identity) setRefreshing(false);
    }
  }, [url, identity, status]);

  const refresh = useCallback(() => fetchSnapshot(mutation.current ? "own" : "remote"), [fetchSnapshot]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update(); window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  useEffect(() => {
    active.current = true;
    setLoading(true); setRefreshing(false); setError(""); setMessage(""); setSnapshot(null);
    void refresh();
    return () => { active.current = false; request.current?.abort(); mutationRequest.current?.abort(); };
  }, [refresh]);

  async function act(payload: Record<string, unknown>): Promise<boolean> {
    if (mutation.current || status !== "authenticated" || !navigator.onLine) return false;
    mutation.current = true; setBusy(true); setMessage("");
    const controller = new AbortController();
    mutationRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if ([401, 403, 404].includes(response.status) && active.current && currentIdentity.current === identity) {
        setSnapshot(null);
        await refresh();
      }
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "Não foi possível salvar. Tente novamente.");
      if (active.current && currentIdentity.current === identity) { setMessage("Alteração salva."); await fetchSnapshot("own"); }
      return active.current && currentIdentity.current === identity;
    } catch (cause) {
      if (active.current && currentIdentity.current === identity) setMessage(controller.signal.aborted || cause instanceof TypeError || cause instanceof SyntaxError ? "Não foi possível confirmar o envio. Confira se a alteração foi salva antes de reenviar. Seu texto foi preservado." : cause instanceof Error ? cause.message : "Não foi possível confirmar o envio. Confira se a alteração foi salva antes de reenviar.");
      return false;
    } finally { clearTimeout(timeout); mutation.current = false; if (mutationRequest.current === controller) mutationRequest.current = null; if (active.current) setBusy(false); }
  }

  const current = snapshot?.identity === identity ? snapshot : null;
  return { data: current?.data ?? null, revision: current?.revision ?? 0, lastChangeSource: current?.source ?? "remote", lastSuccessfulAt: current?.at ?? null, identity, online, loading, refreshing, error, message, busy, refresh, act, authenticated: status === "authenticated", userId: session?.user?.id };
}
