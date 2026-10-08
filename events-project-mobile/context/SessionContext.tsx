import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api, onUnauthorized, setApiToken } from '../services/api';
import { loadCredential, saveCredential, type Credential } from '../services/credentials';
import { onSocket, startRealtime, stopRealtime } from '../services/realtime';
import type { LoginResult, User } from '../types';
import { signOutGoogle } from '../services/googleNative';
import { signalAction, signalMessage, type SessionSignal } from '../services/sessionPolicy';
interface Session { user: User | null; loading: boolean; error: string | null; signIn(email: string, password: string): Promise<void>; googleSignIn(idToken: string): Promise<void>; signOut(): Promise<void>; refresh(): Promise<void>; applyProfileImage(image: string): void; startImpersonation(userId: string, reason: string): Promise<void>; endImpersonation(): Promise<void> }
const Context = createContext<Session | null>(null);
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeUser = user !== null;
  const activeUserId = user?.id;
  const impersonationId = user?.impersonation?.id;
  const credential = useRef<Credential | null>(null);
  const generation = useRef(0);
  const clearSession = useCallback(async () => { generation.current++; stopRealtime(); credential.current = null; setApiToken(null); setUser(null); setError(null); try { await saveCredential(null); } catch { setError('Não foi possível remover a sessão salva. Tente novamente.'); } }, []);
  const signOut = useCallback(async () => { try { if (credential.current) await api.logout(); } catch { /* Local access must close even while offline; server audit expires independently. */ } finally {
      await clearSession();
      if (user?.provider === 'google') {
        try { await signOutGoogle(); } catch { /* Local logout still succeeds if native cleanup fails. */ }
      }
    } }, [clearSession, user?.provider]);
  const install = useCallback(async (result: LoginResult) => { const version = ++generation.current; stopRealtime(); setApiToken(null); setUser(null); credential.current = null; const saved = { token: result.token, expiresAt: result.expiresAt, impersonating: Boolean(result.user.impersonation ?? result.impersonation) }; await saveCredential(saved); if (version !== generation.current) return; credential.current = saved; setApiToken(saved.token); setUser({ ...result.user, ...(result.impersonation ? { impersonation: result.impersonation } : {}) }); setError(null); }, []);
  const refresh = useCallback(async () => { if (!credential.current) return; const version = generation.current; if (credential.current.impersonating) { const status = await api.sessionStatus(); if (version !== generation.current) return; if (status.restoreRequired && status.session) { await install(status.session); return; } } const current = await api.me(); if (version === generation.current) { setUser(current); setError(null); } }, [install]);
  const applyProfileImage = useCallback((image: string) => { setUser(current => current ? { ...current, image } : current); }, []);
  const signIn = useCallback(async (email: string, password: string) => { await install(await api.login(email, password)); }, [install]);
  const googleSignIn = useCallback(async (idToken: string) => { await install(await api.googleLogin(idToken)); }, [install]);
  const startImpersonation = useCallback(async (userId: string, reason: string) => { await install(await api.startImpersonation(userId, reason)); }, [install]);
  const endImpersonation = useCallback(async () => { await install(await api.endImpersonation()); }, [install]);
  useEffect(() => { let active = true; const version = generation.current; const unsubscribe = onUnauthorized(() => { void clearSession(); }); void (async () => { try { const saved = await loadCredential(); if (!active || version !== generation.current) return; if (saved && Date.parse(saved.expiresAt) > Date.now()) { credential.current = saved; setApiToken(saved.token); if (saved.impersonating) { const status = await api.sessionStatus(); if (status.restoreRequired && status.session) { if (active && version === generation.current) await install(status.session); return; } } const current = await api.me(); if (active && version === generation.current) setUser(current); } else await saveCredential(null); } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível restaurar sua sessão.'); } finally { if (active) setLoading(false); } })(); return () => { active = false; unsubscribe(); stopRealtime(); }; }, [clearSession, install]);
  useEffect(() => {
    const stop = startRealtime(activeUser ? credential.current?.token ?? null : null);
    let restoring = false;
    const revoked = (signal: SessionSignal) => {
      if (!credential.current || restoring) return;
      stopRealtime();
      if (signalAction(Boolean(credential.current.impersonating)) === 'restore') {
        restoring = true;
        // Hide the previous private view while the API verifies the original admin.
        setApiToken(credential.current.token); setUser(null); setLoading(true);
        void refresh().catch(() => setError(credential.current
          ? 'Não foi possível restaurar a sessão de suporte. Sua credencial foi preservada; tente novamente.'
          : signalMessage(signal))).finally(() => { restoring = false; setLoading(false); });
      } else {
        const version = generation.current + 1;
        void clearSession().then(() => { if (generation.current === version) setError(signalMessage(signal)); });
      }
    };
    const signals: SessionSignal[] = ['session-expired', 'account-removed', 'account-suspended', 'account-impersonated'];
    const stops = signals.map(signal => onSocket(signal, () => revoked(signal)));
    const changed = onSocket('role-mudar', () => { void refresh().catch(() => setError('Não foi possível atualizar as permissões.')); });
    const profileChanged = onSocket('profile-image-updated', payload => {
      if (!payload || typeof payload !== 'object' || !('userId' in payload) || payload.userId !== activeUserId) return;
      void refresh().catch(() => setError('Não foi possível atualizar a foto do perfil.'));
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (credential.current) timer = setTimeout(() => { void clearSession(); }, Math.max(0, Date.parse(credential.current.expiresAt) - Date.now()));
    return () => { stop(); stops.forEach(unsubscribe => unsubscribe()); changed(); profileChanged(); clearTimeout(timer); };
  }, [activeUser, activeUserId, impersonationId, clearSession, refresh]);
  useEffect(() => { if (!user?.impersonation) return; const refreshActive = () => { if (AppState.currentState === 'active') void refresh().catch(() => setError('Não foi possível atualizar a sessão de suporte.')); }; const interval = setInterval(refreshActive, 15000); const timeout = setTimeout(refreshActive, Math.max(0, Date.parse(user.impersonation.expiresAt) - Date.now())); const listener = AppState.addEventListener('change', state => { if (state === 'active') refreshActive(); }); return () => { clearInterval(interval); clearTimeout(timeout); listener.remove(); }; }, [user?.impersonation, refresh]);
  useEffect(() => {
    if (user?.impersonation) return;
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active' && credential.current) {
        void refresh().catch(() => setError('Não foi possível atualizar a sessão do app.'));
      }
    });
    return () => listener.remove();
  }, [user?.impersonation, refresh]);
  useEffect(() => {
    if (activeUser || !error || !credential.current?.impersonating) return;
    const retry = () => { if (AppState.currentState === 'active') void refresh().catch(() => {}); };
    const interval = setInterval(retry, 15000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') retry(); });
    return () => { clearInterval(interval); listener.remove(); };
  }, [activeUser, error, refresh]);
  return <Context.Provider value={{ user, loading, error, signIn, googleSignIn, signOut, refresh, applyProfileImage, startImpersonation, endImpersonation }}>{children}</Context.Provider>;
}
export function useSession(): Session { const context = useContext(Context); if (!context) throw new Error('useSession requer SessionProvider.'); return context; }


