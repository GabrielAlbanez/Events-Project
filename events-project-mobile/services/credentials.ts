import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
const KEY = 'eventmap.mobile.session';
export interface Credential { token: string; expiresAt: string; impersonating?: boolean }
let memory: Credential | null = null;
export async function loadCredential(): Promise<Credential | null> {
  if (Platform.OS === 'web') return memory;
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || !value || !('token' in value) || typeof value.token !== 'string' || !('expiresAt' in value) || typeof value.expiresAt !== 'string') return null;
    return { token: value.token, expiresAt: value.expiresAt, impersonating: 'impersonating' in value && value.impersonating === true };
  } catch { await SecureStore.deleteItemAsync(KEY); return null; }
}
let writes: Promise<void> = Promise.resolve();
export function saveCredential(value: Credential | null): Promise<void> {
  const next = writes.catch(() => {}).then(() => persistCredential(value)); writes = next; return next;
}
async function persistCredential(value: Credential | null): Promise<void> {
  if (Platform.OS === 'web') { memory = value; return; }
  if (value) await SecureStore.setItemAsync(KEY, JSON.stringify(value), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  else await SecureStore.deleteItemAsync(KEY);
}


