import { AppState, Platform } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL } from './config';
import { isDomainUpdate } from './resourcePolicy';
import { socketFailureSignal } from './sessionPolicy';
export type Subscription = { eventId: string } | { roomId: string } | { chatEventId: string } | { partyEventId: string } | { matchId: string } | { user: true };
export interface LiveUpdate { room: string }
export interface TypingSignal { room: string; userId: string; until: number }
const eventListeners = new Map<string, Set<(...args: unknown[]) => void>>();
const listeners = new Set<() => void>();
const subscriptions = new Map<string, { payload: Subscription; count: number }>();
let socket: Socket | null = null;
let stopLifecycle: (() => void) | null = null;
export function startRealtime(token: string | null): () => void {
  stopRealtime();
  if (!SOCKET_URL || Platform.OS === 'web') return () => {};
  socket = io(SOCKET_URL, { autoConnect: false, transports: ['websocket'], extraHeaders: token ? { Cookie: `next-auth.session-token=${token}; __Secure-next-auth.session-token=${token}` } : {}, reconnection: true, reconnectionAttempts: 12, reconnectionDelayMax: 10000 });
  const connection = socket;
  for (const [event, handlers] of eventListeners) for (const handler of handlers) connection.on(event, handler);
  connection.on('connect', () => { connection.emit('register-user'); for (const entry of subscriptions.values()) connection.emit('community-subscribe', entry.payload); for (const listener of listeners) listener(); });
  connection.on('connect_error', (error: Error & { data?: { code?: unknown } }) => {
    const signal = socketFailureSignal(error.data?.code);
    if (signal) for (const handler of eventListeners.get(signal) ?? []) handler();
  });
  const lifecycle = AppState.addEventListener('change', state => { if (state === 'active') connection.connect(); else connection.disconnect(); });
  stopLifecycle = () => lifecycle.remove();
  if (AppState.currentState === 'active') connection.connect();
  return () => { if (socket === connection) stopRealtime(); };
}
export function stopRealtime(): void { stopLifecycle?.(); stopLifecycle = null; socket?.removeAllListeners(); socket?.disconnect(); socket = null; }
export function onReconnect(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
export function subscribeDomain(payload: Subscription, onUpdate: () => void): () => void {
  const key = JSON.stringify(payload);
  const previous = subscriptions.get(key);
  subscriptions.set(key, { payload, count: (previous?.count ?? 0) + 1 });
  const room = 'eventId' in payload ? `event:${payload.eventId}` : 'roomId' in payload ? `friends:${payload.roomId}` : 'chatEventId' in payload ? `chat:${payload.chatEventId}` : 'partyEventId' in payload ? `party:${payload.partyEventId}` : 'matchId' in payload ? `match:${payload.matchId}` : null;
  const handler = (update: unknown) => { if (!isDomainUpdate(update)) return; if ('user' in payload ? update.room.startsWith('user:') : update.room === room) onUpdate(); };
  const stopUpdate = onSocket('community-updated', (...args) => handler(args[0]));
  const stopDenied = onSocket('community-access-denied', (...args) => handler(args[0]));
  if (!previous) socket?.emit('community-subscribe', payload, (reply: { ok: boolean }) => { if (!reply.ok) onUpdate(); });
  return () => { stopUpdate(); stopDenied(); const current = subscriptions.get(key); if (current && current.count > 1) subscriptions.set(key, { ...current, count: current.count - 1 }); else { subscriptions.delete(key); socket?.emit('community-unsubscribe', payload); } };
}
export function onSocket(event: string, handler: (...args: unknown[]) => void): () => void { let handlers = eventListeners.get(event); if (!handlers) { handlers = new Set(); eventListeners.set(event, handlers); } handlers.add(handler); socket?.on(event, handler); return () => { handlers?.delete(handler); socket?.off(event, handler); if (!handlers?.size) eventListeners.delete(event); }; }
export function sendTyping(matchId: string, active: boolean): void { socket?.emit('typing', { matchId, active }); }
export function syncChat(matchId: string): void { socket?.emit('chat-sync', { matchId }); }
export async function peerPresence(matchId: string): Promise<boolean | null> {
  const connection = socket;
  if (!connection?.connected) return null;
  return new Promise(resolve => { const timer = setTimeout(() => resolve(null), 5000); connection.emit('chat-presence', { matchId }, (reply: { ok: boolean; online?: boolean }) => { clearTimeout(timer); resolve(reply.ok ? reply.online ?? false : null); }); });
}








/** The server validates ADMIN before delivering the presence snapshot. */
export function requestActiveUsers(): void { socket?.emit('request-active-users'); }
