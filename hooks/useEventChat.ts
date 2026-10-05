"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { EventChatMessage, EventChatHistory } from "@/types/eventChat";

type ChatState = { partnerReceipt?: EventChatHistory["partnerReceipt"]; identity: string; event: EventChatHistory["event"] | null; messages: EventChatMessage[]; nextBefore: number | null; loading: boolean; loadingOlder: boolean; error: string; denied: boolean; sending: boolean; pending: { clientId: string; text: string } | null };
const empty = (identity: string): ChatState => ({ identity, event: null, messages: [], nextBefore: null, loading: true, loadingOlder: false, error: "", denied: false, sending: false, pending: null });
function mergeMessages(first: EventChatMessage[], second: EventChatMessage[]): EventChatMessage[] {
  const merged = new Map(first.map(message => [message.id, message]));
  second.forEach(message => merged.set(message.id, message));
  return Array.from(merged.values()).sort((a, b) => a.id - b.id);
}

/** HTTP is authoritative. Socket notices trigger cursor-based reconciliation only. */
export function useEventChat(eventId: string, customEndpoint?: string) {
  const { data: session, status } = useSession();
  const endpoint = customEndpoint ?? `/api/event-chat/${encodeURIComponent(eventId)}`;
  const identity = `${endpoint}:${eventId}:${status}:${session?.user?.id ?? "guest"}:${session?.user?.role ?? ""}`;
  const [stored, setStored] = useState<ChatState>(() => empty(identity));
  const [online, setOnline] = useState(true);
  const current = useRef(identity); current.current = identity;
  const state = stored.identity === identity ? stored : empty(identity);
  const latest = useRef(state); latest.current = state;
  const controllers = useRef(new Set<AbortController>());
  const busy = useRef({ refresh: false, older: false, send: false });
  const synced = useRef<{ identity: string; cursor: number | null }>({ identity, cursor: null });
  if (synced.current.identity !== identity) synced.current = { identity, cursor: null };
  const update = useCallback((change: (previous: ChatState) => ChatState) => {
    if (current.current === identity) setStored(previous => previous.identity === identity ? change(previous) : previous);
  }, [identity]);
  const revoke = useCallback(() => {
    controllers.current.forEach(controller => controller.abort());
    update(previous => ({ ...empty(identity), loading: false, denied: true, error: "Seu acesso ao chat foi encerrado. Confira sua inscrição no evento." }));
  }, [identity, update]);
  const request = useCallback(async (url: string, init?: RequestInit): Promise<unknown> => {
    const controller = new AbortController(); controllers.current.add(controller);
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
      if (current.current !== identity) throw new Error("Sessão alterada.");
      if ([401, 403, 404].includes(response.status)) { revoke(); throw new Error("Seu acesso ao chat não está disponível."); }
      const body: unknown = await response.json();
      if (current.current !== identity || controller.signal.aborted) throw new DOMException("Acesso alterado.", "AbortError");
      if (!response.ok) throw new Error(typeof body === "object" && body !== null && "message" in body && typeof body.message === "string" ? body.message : "Não foi possível atualizar o chat.");
      return body;
    } finally { clearTimeout(timeout); controllers.current.delete(controller); }
  }, [identity, revoke]);
  const refresh = useCallback(async () => {
    if (busy.current.refresh || status !== "authenticated" || !navigator.onLine || latest.current.denied) return;
    busy.current.refresh = true;
    try {
      let cursor = synced.current.cursor;
      let more = true;
      while (more && current.current === identity) {
        const page = await request(endpoint + (cursor ? `?after=${cursor}` : "")) as EventChatHistory;
        if (current.current !== identity) return;
        const next = page.messages.at(-1)?.id;
        if (next) synced.current.cursor = next;
        update(previous => previous.denied ? previous : ({ ...previous, event: page.event, partnerReceipt: page.partnerReceipt, messages: mergeMessages(previous.messages, page.messages), nextBefore: cursor ? previous.nextBefore : page.nextBefore, loading: false, error: "", pending: page.messages.some(message => message.own && message.clientId === previous.pending?.clientId) ? null : previous.pending }));
        more = !!cursor && page.hasMore && !!next && next > cursor;
        cursor = next ?? cursor;
      }
    } catch (error) {
      update(previous => previous.denied ? previous : ({ ...previous, loading: false, error: error instanceof Error && error.name !== "AbortError" ? error.message : "A atualização demorou demais. Tente novamente." }));
    } finally { if (current.current === identity) busy.current.refresh = false; }
  }, [endpoint, identity, request, status, update]);
  const loadOlder = useCallback(async () => {
    const cursor = latest.current.nextBefore;
    if (!cursor || busy.current.older || !navigator.onLine || latest.current.denied) return;
    busy.current.older = true; update(previous => ({ ...previous, loadingOlder: true }));
    try {
      const page = await request(`${endpoint}?before=${cursor}`) as EventChatHistory;
      update(previous => previous.denied ? previous : ({ ...previous, messages: mergeMessages(page.messages, previous.messages), nextBefore: page.nextBefore, error: "" }));
    } catch (error) { update(previous => previous.denied ? previous : ({ ...previous, error: error instanceof Error ? error.message : "Não foi possível carregar as mensagens anteriores." })); }
    finally { if (current.current === identity) { busy.current.older = false; update(previous => ({ ...previous, loadingOlder: false })); } }
  }, [endpoint, identity, request, update]);
  const send = useCallback(async (text: string, retry = false): Promise<boolean> => {
    if (busy.current.send || status !== "authenticated" || !navigator.onLine || latest.current.denied) return false;
    const pending = retry ? latest.current.pending : latest.current.pending ? null : { clientId: crypto.randomUUID(), text: text.trim() };
    if (!pending || !pending.text || pending.text.length > 1000) return false;
    busy.current.send = true; update(previous => ({ ...previous, sending: true, pending, error: "" }));
    try {
      const result = await request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pending) }) as { message: EventChatMessage };
      update(previous => previous.denied ? previous : ({ ...previous, messages: mergeMessages(previous.messages, [result.message]), pending: null, error: "" }));
      return current.current === identity;
    } catch (error) {
      update(previous => previous.denied ? previous : ({ ...previous, error: `${error instanceof Error && error.name !== "AbortError" ? error.message : "Não recebemos a confirmação do envio."} Confira o histórico ou tente novamente: o mesmo envio não será duplicado.` }));
      return false;
    } finally { if (current.current === identity) { busy.current.send = false; update(previous => ({ ...previous, sending: false })); } }
  }, [endpoint, identity, request, status, update]);
  useEffect(() => {
    setStored(empty(identity)); busy.current = { refresh: false, older: false, send: false };
    if (status === "authenticated") void refresh();
    else if (status === "unauthenticated") update(previous => ({ ...previous, loading: false, denied: true, error: "Entre na sua conta para acessar o chat." }));
    return () => { controllers.current.forEach(controller => controller.abort()); controllers.current.clear(); };
  }, [identity, status, refresh, update]);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine); change();
    window.addEventListener("online", change); window.addEventListener("offline", change);
    return () => { window.removeEventListener("online", change); window.removeEventListener("offline", change); };
  }, []);
  const controls = useRef({ identity, lastTyping: 0, delivered: 0, read: 0 });
  if (controls.current.identity !== identity) controls.current = { identity, lastTyping: 0, delivered: 0, read: 0 };
  const typing = useCallback((active: boolean) => {
    if (!customEndpoint || latest.current.denied || status !== "authenticated" || !navigator.onLine) return;
    if (active && Date.now() - controls.current.lastTyping < 2000) return;
    controls.current.lastTyping = Date.now();
    void request(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "typing", active }) }).catch(() => undefined);
  }, [customEndpoint, endpoint, request, status]);
  const acknowledge = useCallback((messageId: number, read: boolean) => {
    if (!customEndpoint || latest.current.denied || status !== "authenticated" || !navigator.onLine) return;
    if (document.visibilityState !== "visible") return;
    if (messageId <= (read ? controls.current.read : controls.current.delivered)) return;
    void request(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "receipt", messageId, read }) }).then(() => {
      if (current.current !== identity) return;
      controls.current.delivered = Math.max(controls.current.delivered, messageId);
      if (read) controls.current.read = Math.max(controls.current.read, messageId);
    }).catch(() => undefined);
  }, [customEndpoint, endpoint, identity, request, status]);
  return { ...state, online, refresh, loadOlder, send, revoke, typing, acknowledge, userId: session?.user?.id };
}
