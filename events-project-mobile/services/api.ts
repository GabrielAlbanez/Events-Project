import { Platform } from 'react-native';
import { requireApiUrl } from './config';
import type { ActivitySnapshot, CommunityEventSnapshot, CommunityRoomSnapshot, CommunityRoomSummary, EventChatHistory, EventChatSendResult, EventInput, Evento, Json, LoginResult, MediaAsset, NotificationDTO, PartyConnectionsSnapshot, User } from '../types';
export class ApiError extends Error { constructor(message: string, readonly status: number) { super(message); this.name = 'ApiError'; } }
let bearer: string | null = null;
let epoch = 0;
const revoked = new Set<() => void>();
export function setApiToken(token: string | null): void { bearer = token; epoch++; }
export function onUnauthorized(listener: () => void): () => void { revoked.add(listener); return () => revoked.delete(listener); }
interface Options { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; signal?: AbortSignal }
export async function request<T>(path: string, options: Options = {}): Promise<T> {
  return perform<T>(path, options.method ?? 'GET', options.body === undefined ? undefined : JSON.stringify(options.body), options.signal);
}
async function perform<T>(path: string, method: string, body?: string | FormData, signal?: AbortSignal): Promise<T> {
  const generation = epoch;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 20000);
  try {
    const response = await fetch(`${requireApiUrl()}/v1${path}`, { method, body, signal: controller.signal, headers: { Accept: 'application/json', ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) } });
    let payload: unknown;
    try { payload = await response.json(); } catch { throw new ApiError('A API retornou uma resposta inválida.', response.status); }
    if (generation !== epoch) throw new ApiError('A conta ativa mudou. Atualize esta tela.', 409);
    if (!response.ok) {
      if (response.status === 401 && bearer) for (const listener of revoked) listener();
      const message = typeof payload === 'object' && payload && 'message' in payload && typeof payload.message === 'string' ? payload.message : 'Não foi possível concluir esta operação.';
      throw new ApiError(message, response.status);
    }
    if (typeof payload !== 'object' || !payload || !('data' in payload)) throw new ApiError('Resposta incompatível com a API mobile.', 502);
    return payload.data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) throw new ApiError('Solicitação interrompida ou tempo de conexão esgotado.', 408);
    if (error instanceof Error && error.message.startsWith('Configure EXPO_PUBLIC')) throw error;
    throw new ApiError('Não foi possível conectar. Confira sua internet e o endereço da API.', 0);
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}
const id = encodeURIComponent;
const post = <T = Json>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body });
export const api = {
  request, saveEvent,
  logout: () => post('/auth/logout', {}),
  startImpersonation: (userId: string, reason: string) => post<LoginResult>('/admin/impersonation/start', { userId, reason }),
  endImpersonation: () => post<LoginResult>('/admin/impersonation/end', {}),
  sessionStatus: () => request<{ restoreRequired: boolean; session?: LoginResult }>('/admin/impersonation/status'),
  login: (email: string, password: string) => post<LoginResult>('/auth/login', { email, password }),
  googleLogin: (idToken: string) => post<LoginResult>('/auth/google', { idToken }),
  me: () => request<User>('/me'),
  register: (name: string, email: string, password: string) => post('/auth/register', { name, email, password }),
  recovery: (email: string) => post('/auth/recovery', { email }),
  resetPassword: (token: string, password: string) => post('/auth/reset-password', { token, password }),
  resendVerification: (email: string) => post('/auth/resend-verification', { email }),
  events: () => request<Evento[]>('/events'), event: (eventId: string) => request<Evento>(`/events/${id(eventId)}`),
  mine: () => request<Evento[]>('/events/mine'), favorites: () => request<Evento[]>('/favorites'),
  favorite: (eventId: string) => post(`/events/${id(eventId)}/favorite`),
  reminder: (eventId: string, minutes: number | null) => request<Json>(`/events/${id(eventId)}/reminder`, { method: 'PUT', body: { minutes } }),
  notifications: () => request<{ items: NotificationDTO[]; nextBefore: string | null }>('/notifications'),
  readNotification: (notificationId: string) => request<Json>(`/notifications/${id(notificationId)}/read`, { method: 'PATCH' }),
  readAllNotifications: () => request<Json>('/notifications/read-all', { method: 'PATCH' }),
  profile: () => request<User>('/profile'), updateProfile: (body: { name?: string; email: string; password?: string; newPassword?: string }) => request<Json>('/profile', { method: 'PATCH', body }),
  community: (eventId: string) => request<CommunityEventSnapshot>(`/community/events/${id(eventId)}`),
  communityAction: (eventId: string, body: unknown) => post(`/community/events/${id(eventId)}`, body),
  rooms: async () => (await request<{ rooms: CommunityRoomSummary[] }>('/community/rooms')).rooms, createRoom: (body: unknown) => post<{ id: string; name: string }>('/community/rooms', body),
  room: (roomId: string) => request<CommunityRoomSnapshot>(`/community/rooms/${id(roomId)}`), roomAction: (roomId: string, body: unknown) => post(`/community/rooms/${id(roomId)}`, body),
  activity: () => request<ActivitySnapshot>('/community/activity'),
  chatHistory: (eventId: string, before?: number) => request<EventChatHistory>(`/event-chat/${id(eventId)}${before ? `?before=${before}` : ''}`),
  chatSend: (eventId: string, text: string, clientId: string) => post<EventChatSendResult>(`/event-chat/${id(eventId)}`, { text, clientId }),
  party: (eventId: string, after?: string) => request<PartyConnectionsSnapshot>(`/party-connections/${id(eventId)}${after ? `?after=${id(after)}` : ''}`), partyAction: (eventId: string, body: unknown) => post(`/party-connections/${id(eventId)}`, body),
  privateHistory: (eventId: string, matchId: string, before?: number) => request<EventChatHistory>(`/party-connections/${id(eventId)}/matches/${id(matchId)}${before ? `?before=${before}` : ''}`),
  privateSend: (eventId: string, matchId: string, text: string, clientId: string, imageId?: string) => post<EventChatSendResult>(`/party-connections/${id(eventId)}/matches/${id(matchId)}`, { text, clientId, ...(imageId ? { imageId } : {}) }),
  privateControl: (eventId: string, matchId: string, body: { action: 'typing'; active: boolean } | { action: 'receipt'; messageId: number; read: boolean }) => request<Json>(`/party-connections/${id(eventId)}/matches/${id(matchId)}`, { method: 'PATCH', body }),
  registration: (eventId: string) => request<Json>(`/events/${id(eventId)}/registration`), registerEvent: (eventId: string) => post(`/events/${id(eventId)}/registration`), cancelRegistration: (eventId: string) => request<Json>(`/events/${id(eventId)}/registration`, { method: 'DELETE' }),
  checkInToken: (eventId: string) => request<Json>(`/events/${id(eventId)}/check-in-token`), checkIn: (eventId: string, token: string) => post(`/events/${id(eventId)}/check-in`, { token }),
  trackEngagement: (eventId: string, action: 'view' | 'ticket') => post(`/event-engagement/${id(eventId)}`, { action }),
  reportEvent: (eventId: string, reason: string, details: string) => post(`/events/${id(eventId)}/reports`, { reason, details }),
  createEvent: (body: Omit<EventInput, 'banner' | 'carrossel'> | EventInput, media: EventMedia, submit = true) => saveEvent(body, media, undefined, submit), updateEvent: (eventId: string, body: Omit<EventInput, 'banner' | 'carrossel'> | EventInput, media: EventMedia, submit = true) => saveEvent(body, media, eventId, submit),
  deleteEvent: (eventId: string) => request<Json>('/admin/events', { method: 'DELETE', body: { ids: [eventId] } }),
  eventAction: (eventId: string, action: 'cancel' | 'duplicate') => post(`/events/${id(eventId)}/${action}`),
  users: () => request<{ status: string; data: User[]; pagination: Json; counts: Json }>('/admin/users'), adminEvents: () => request<Evento[]>('/admin/events'),
  promoter: (promoterId: string) => request<Json>(`/promoters/${id(promoterId)}`), follow: (promoterId: string) => post(`/promoters/${id(promoterId)}/follow`),
  promoterStats: () => request<Json>('/promoter/stats'),
};
export async function uploadImage(asset: MediaAsset, path = '/upload'): Promise<{ url: string }> {
  if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) throw new ApiError('A imagem deve ter no máximo 5 MB.', 400);
  const form = new FormData();
  if (Platform.OS === 'web') {
    const response = await fetch(asset.uri);
    form.append('file', await response.blob(), asset.fileName ?? 'image.jpg');
  } else {
    // React Native FormData accepts URI descriptors in place of browser Blob values.
    form.append('file', { uri: asset.uri, name: asset.fileName ?? 'image.jpg', type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob);
  }
  return perform(path, 'POST', form);
}

export interface EventMedia { banner?: MediaAsset; carrossel?: MediaAsset[] }
async function appendAsset(form: FormData, field: string, asset: MediaAsset): Promise<void> {
  if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) throw new ApiError('Cada imagem deve ter no máximo 5 MB.', 400);
  if (Platform.OS === 'web') { const response = await fetch(asset.uri); form.append(field, await response.blob(), asset.fileName ?? 'image.jpg'); }
  else form.append(field, { uri: asset.uri, name: asset.fileName ?? 'image.jpg', type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob);
}
export async function saveEvent(body: Omit<EventInput, 'banner' | 'carrossel'> | EventInput, media: EventMedia, eventId?: string, submit = true): Promise<{ success: true; message: string; evento: Evento; id: string }> {
  if ((media.carrossel?.length ?? 0) > 10) throw new ApiError('Selecione até 10 imagens para o carrossel.', 400);
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) if (!['status', 'banner', 'carrossel'].includes(key)) form.append(key, value === null || value === undefined ? '' : String(value));
  if (media.banner) await appendAsset(form, 'banner', media.banner);
  for (const asset of media.carrossel ?? []) await appendAsset(form, 'carrossel', asset);
  const result = await perform<{ success: true; message: string; evento: Evento }>(`/events${eventId ? `/${id(eventId)}` : ''}?submit=${submit}`, eventId ? 'PUT' : 'POST', form);
  return { ...result, id: result.evento.id };
}




export async function uploadChatImage(eventId: string, matchId: string, asset: MediaAsset): Promise<{ id: string; url: string }> {
  const form = new FormData(); await appendAsset(form, 'file', asset);
  return perform(`/party-connections/${id(eventId)}/matches/${id(matchId)}/images`, 'POST', form);
}
export function privateImageSource(path: string): { uri: string; headers: Record<string, string> } {
  if (!path.startsWith('/api/party-connections/')) throw new ApiError('Imagem da conversa indisponível.', 400);
  return { uri: `${requireApiUrl()}/v1${path.slice(4)}`, headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} };
}






