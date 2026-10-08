import React, { useCallback } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { NativeScreen, type NativeRoute } from '../screens/NativeScreen';
const tabs: Record<string, '/(tabs)' | '/(tabs)/agenda' | '/(tabs)/activity' | '/(tabs)/account'> = { discovery: '/(tabs)', discover: '/(tabs)', agenda: '/(tabs)/agenda', activity: '/(tabs)/activity', account: '/(tabs)/account' };
export function RouteScreen({ name, back = false }: { name?: string; back?: boolean }) {
  const params = useLocalSearchParams<{ page?: string; id?: string; matchId?: string; token?: string }>();
  const navigate = useCallback((route: NativeRoute) => {
    const tab = tabs[route.name];
    if (tab) router.navigate(tab);
    else router.push({ pathname: '/[page]', params: { page: route.name, ...(route.id ? { id: route.id } : {}), ...(route.matchId ? { matchId: route.matchId } : {}) } });
  }, []);
  return <NativeScreen route={{ name: name ?? params.page ?? 'discovery', id: params.id, matchId: params.matchId, token: params.token }} navigate={navigate} onBack={back ? () => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)'); } : undefined} />;
}
