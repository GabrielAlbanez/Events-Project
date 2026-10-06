const normalize = (value: string | undefined): string => value?.trim().replace(/\/+$/, '') ?? '';
export const API_URL = normalize(process.env.EXPO_PUBLIC_API_URL);
export const SOCKET_URL = normalize(process.env.EXPO_PUBLIC_SOCKET_URL);
export const WEB_URL = normalize(process.env.EXPO_PUBLIC_WEB_URL) || SOCKET_URL;
export function requireApiUrl(): string {
  if (!API_URL || !/^https?:\/\//.test(API_URL)) throw new Error('Configure EXPO_PUBLIC_API_URL com o endereço da API mobile.');
  return API_URL;
}
export function mediaUrl(path: string): string;
export function mediaUrl(path: string | null | undefined): string | undefined;
export function mediaUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  const origin = SOCKET_URL || API_URL;
  return origin ? `${origin}/${path.replace(/^\//, '')}` : path;
}
