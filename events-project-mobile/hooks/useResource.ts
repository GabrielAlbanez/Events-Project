import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { isAccessFailure } from '../services/resourcePolicy';
import { useSession } from '../context/SessionContext';
import { onReconnect, subscribeDomain, type Subscription } from '../services/realtime';
interface Resource<T> { identity: string; data: T | null; loading: boolean; error: string | null }
export function useResource<T>(load: () => Promise<T>, key: string, subscription?: Subscription) {
  const { user } = useSession();
  const subscriptionKey = JSON.stringify(subscription ?? null);
  const identity = `${key}:${user?.id ?? 'guest'}:${subscriptionKey}`;
  const [state, setState] = useState<Resource<T>>(() => ({ identity, data: null, loading: true, error: null }));
  const loader = useRef(load);
  useEffect(() => { loader.current = load; }, [load]);
  const serial = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++serial.current;
    setState(current => current.identity === identity ? { ...current, loading: current.data === null, error: null } : { identity, data: null, loading: true, error: null });
    try {
      const data = await loader.current();
      if (version === serial.current) setState({ identity, data, loading: false, error: null });
    } catch (cause) {
      if (version === serial.current) setState(current => ({ identity, data: current.identity === identity && !isAccessFailure(cause) ? current.data : null, loading: false, error: cause instanceof Error ? cause.message : 'Não foi possível carregar.' }));
    }
  }, [identity]);
  const invalidate = useCallback(() => { serial.current++; }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) return refresh(); });
    const payload = JSON.parse(subscriptionKey) as Subscription | null;
    const unsubscribe = payload ? subscribeDomain(payload, () => { void refresh(); }) : () => {};
    const reconnect = onReconnect(() => { void refresh(); });
    const lifecycle = AppState.addEventListener('change', next => { if (next === 'active') void refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 15000);
    return () => { active = false; invalidate(); unsubscribe(); reconnect(); lifecycle.remove(); clearInterval(timer); };
  }, [identity, subscriptionKey, refresh, invalidate]);
  const setData = useCallback((next: T | null | ((value: T | null) => T | null)) => setState(current => ({ identity, data: typeof next === 'function' ? (next as (value: T | null) => T | null)(current.identity === identity ? current.data : null) : next, loading: false, error: null })), [identity]);
  const current = state.identity === identity ? state : { data: null, loading: true, error: null };
  return { ...current, refresh, reload: refresh, setData };
}
