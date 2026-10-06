"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { EventChatMessage, EventChatHistory } from "@/types/eventChat";
import { socket } from "@/lib/socketClient";

type ChatState = { partnerReceipt?: EventChatHistory["partnerReceipt"]; identity: string; event: EventChatHistory["event"] | null; messages: EventChatMessage[]; nextBefore: number | null; loading: boolean; loadingOlder: boolean; error: string; denied: boolean; sending: boolean; retryStopped: boolean; imageUploading: boolean; pending: { clientId: string; text: string; createdAt: string; imageId?: string } | null };
const empty = (identity: string): ChatState => ({ identity, event: null, messages: [], nextBefore: null, loading: true, loadingOlder: false, error: "", denied: false, sending: false, retryStopped: false, imageUploading: false, pending: null });
class ChatRequestError extends Error { constructor(message: string, public status: number) { super(message); } }
function mergeMessages(first: EventChatMessage[], second: EventChatMessage[]): EventChatMessage[] {
  const merged = new Map(first.map(message => [message.id, message]));
  second.forEach(message => merged.set(message.id, message));
  return Array.from(merged.values()).sort((a, b) => a.id - b.id);
}

/** HTTP is authoritative. Socket notices trigger cursor-based reconciliation only. */
export function useEventChat(eventId: string, customEndpoint?: string) {
  const { data: session, status } = useSession();
  const endpoint = customEndpoint ?? `/api/event-chat/${encodeURIComponent(eventId)}`;
  const matchId = customEndpoint?.match(/\/matches\/([^/]+)$/)?.[1];
  const identity = `${endpoint}:${eventId}:${status}:${session?.user?.id ?? "guest"}:${session?.user?.role ?? ""}`;
  const [stored, setStored] = useState<ChatState>(() => empty(identity));
  const [online, setOnline] = useState(true);
  const current = useRef(identity); current.current = identity;
  const state = stored.identity === identity ? stored : empty(identity);
  const latest = useRef(state); latest.current = state;
  const controllers = useRef(new Set<AbortController>());
  const busy = useRef({ refresh: false, older: false, send: false });
  const retryAttempts = useRef(0);
  const confirmed = useRef(new Set<string>());
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
    const timeout = setTimeout(() => controller.abort(), customEndpoint ? 35000 : 15000);
    try {
      const response = await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
      if (current.current !== identity) throw new Error("Sessão alterada.");
      if ([401, 403, 404].includes(response.status)) { revoke(); throw new Error("Seu acesso ao chat não está disponível."); }
      const body: unknown = await response.json();
      if (current.current !== identity || controller.signal.aborted) throw new DOMException("Acesso alterado.", "AbortError");
      if (!response.ok) throw new ChatRequestError(typeof body === "object" && body !== null && "message" in body && typeof body.message === "string" ? body.message : "Não foi possível atualizar o chat.", response.status);
      return body;
    } finally { clearTimeout(timeout); controllers.current.delete(controller); }
  }, [identity, revoke, customEndpoint]);
  const refresh = useCallback(async () => {
    if (current.current !== identity || busy.current.refresh || status !== "authenticated" || !navigator.onLine || latest.current.denied) return;
    busy.current.refresh = true;
    try {
      let cursor = synced.current.cursor;
      let more = true;
      while (more && current.current === identity) {
        const page = await request(endpoint + (cursor ? `?after=${cursor}` : "")) as EventChatHistory;
        if (current.current !== identity) return;
        const next = page.messages.at(-1)?.id;
        for (const message of page.messages) if (message.own) confirmed.current.add(message.clientId);
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
  const send = useCallback(async (text: string, retry = false, imageId?: string, automatic = false): Promise<boolean> => {
    if (current.current !== identity || busy.current.send || status !== "authenticated" || !navigator.onLine || latest.current.denied) return false;
    const pending = retry ? latest.current.pending : latest.current.pending ? null : { clientId: crypto.randomUUID(), text: text.trim(), createdAt: new Date().toISOString(), ...(imageId ? { imageId } : {}) };
    if (!pending || (!pending.text && !pending.imageId) || pending.text.length > 1000) return false;
    if (!automatic) retryAttempts.current = 0;
    if (confirmed.current.has(pending.clientId)) { update(previous => ({ ...previous, pending: null, retryStopped: false, error: "" })); return true; }
    busy.current.send = true; update(previous => ({ ...previous, sending: true, pending, retryStopped: false, error: "" }));
    try {
      const result = await request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: pending.clientId, text: pending.text, ...(pending.imageId ? { imageId: pending.imageId } : {}) }) }) as { message: EventChatMessage };
      confirmed.current.add(pending.clientId);
      if (matchId && socket.connected) socket.emit("chat-sync", { matchId });
      update(previous => previous.denied ? previous : ({ ...previous, messages: mergeMessages(previous.messages, [result.message]), pending: null, retryStopped: false, error: "" }));
      return current.current === identity;
    } catch (error) {
      const permanent = error instanceof ChatRequestError && error.status >= 400 && error.status < 500 && ![408, 425, 429].includes(error.status);
      update(previous => previous.denied ? previous : ({ ...previous, pending: permanent ? null : previous.pending, error: permanent ? error.message : "A conexão atrasou. Estamos conferindo e repetindo este mesmo envio com segurança." }));
      return false;
    } finally { if (current.current === identity) { busy.current.send = false; update(previous => ({ ...previous, sending: false })); } }
  }, [endpoint, identity, request, status, update, matchId]);
  useEffect(() => {
    if (!state.pending || state.sending || state.denied || state.retryStopped || !online) return;
    if (retryAttempts.current >= 4) { update(previous => ({ ...previous, retryStopped: true, error: "Não foi possível confirmar após as tentativas automáticas. Seu conteúdo foi preservado; tente novamente quando a conexão melhorar." })); return; }
    const timer = setTimeout(() => {
      retryAttempts.current++;
      void refresh().then(() => send(state.pending!.text, true, undefined, true));
    }, [1000, 2500, 5000, 10000][retryAttempts.current]);
    return () => clearTimeout(timer);
  }, [state.pending, state.sending, state.denied, state.retryStopped, online, refresh, send, update]);
  const uploadImage = useCallback(async (file: File): Promise<{ id: string; url: string }> => {
    if (!customEndpoint || status !== "authenticated" || latest.current.denied) throw new Error("Este chat não aceita anexos.");
    update(previous => ({ ...previous, imageUploading: true }));
    try { const body = new FormData(); body.append("file", file); return await request(`${endpoint}/images`, { method: "POST", body }) as { id: string; url: string }; }
    finally { update(previous => ({ ...previous, imageUploading: false })); }
  }, [customEndpoint, endpoint, request, status, update]);
  useEffect(() => {
    current.current = identity;
    setStored(empty(identity)); busy.current = { refresh: false, older: false, send: false };
    retryAttempts.current = 0; confirmed.current.clear();
    if (status === "authenticated") void refresh();
    else if (status === "unauthenticated") update(previous => ({ ...previous, loading: false, denied: true, error: "Entre na sua conta para acessar o chat." }));
    return () => { current.current = "disposed"; controllers.current.forEach(controller => controller.abort()); controllers.current.clear(); };
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
    if (matchId && socket.connected) socket.emit("typing", { matchId, active });
    void request(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "typing", active }) }).catch(() => undefined);
  }, [customEndpoint, endpoint, request, status, matchId]);
  useEffect(() => {
    if (!matchId) return;
    const onTyping = (payload: { room?: string; userId?: string; until?: number }) => {
      if (payload?.room !== `match:${matchId}` || payload.userId !== latest.current.event?.partnerId || typeof payload.until !== "number" || latest.current.denied) return;
      const typingUntil = Math.max(0, Math.min(payload.until, Date.now() + 5000));
      update(previous => ({ ...previous, partnerReceipt: { deliveredThrough: 0, readThrough: 0, ...previous.partnerReceipt, typingUntil } }));
    };
    socket.on("typing", onTyping);
    return () => { socket.off("typing", onTyping); };
  }, [matchId, update]);
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
  // Local-only bubble: never advance server cursors or claim delivery before persistence.
  const optimisticMessage: EventChatMessage | null = state.pending && !state.messages.some(message => message.own && message.clientId === state.pending?.clientId) ? {
    id: -1, clientId: state.pending.clientId, text: state.pending.text, createdAt: state.pending.createdAt,
    author: { id: session?.user?.id ?? "", name: session?.user?.name ?? "Você", image: session?.user?.image ?? null }, own: true,
    ...(state.pending.imageId ? { image: { url: `${endpoint}/images/${encodeURIComponent(state.pending.imageId)}` } } : {}),
  } : null;
  return { ...state, optimisticMessage, online, refresh, loadOlder, send, uploadImage, revoke, typing, acknowledge, userId: session?.user?.id };
}
