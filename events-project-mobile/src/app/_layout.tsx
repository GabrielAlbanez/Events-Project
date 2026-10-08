import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular';
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold';
import { Geist_700Bold } from '@expo-google-fonts/geist/700Bold';
import { SessionProvider, useSession } from '../../context/SessionContext';
import { ThemeProvider, useTheme } from '../../theme';
function Navigation() {
  const theme = useTheme();
  const { user, endImpersonation, error: sessionError, refresh, loading } = useSession();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fontsLoaded, fontError] = useFonts({ Geist: Geist_400Regular, GeistSemiBold: Geist_600SemiBold, GeistBold: Geist_700Bold });
  const leave = async () => { setLeaving(true); setError(null); try { await endImpersonation(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível sair da visualização.'); } finally { setLeaving(false); } };
  const retrySession = async () => { if (retrying) return; setRetrying(true); setRetryError(null); try { await refresh(); } catch { setRetryError('Não foi possível verificar a sessão. Confira sua conexão e tente novamente.'); } finally { setRetrying(false); } };
  if (!fontsLoaded && !fontError) return <View accessibilityLabel="Preparando EventMap" style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={theme.primary} /></View>;
  return <View style={{ flex: 1 }}><StatusBar style={theme.background === '#FFFFFF' ? 'dark' : 'light'} />
    {sessionError && <SafeAreaView edges={['top']} style={{ backgroundColor: theme.soft }}><View style={{ padding: 12, gap: 8 }}><Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: theme.text, fontFamily: 'Geist' }}>{sessionError}</Text><Pressable accessibilityRole="button" accessibilityLabel="Verificar sessão novamente" accessibilityState={{ busy: retrying, disabled: retrying || loading }} disabled={retrying || loading} onPress={() => { void retrySession(); }} style={{ alignSelf: 'flex-start', minHeight: 44, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: theme.surface }}><Text style={{ color: theme.primary, fontFamily: 'GeistSemiBold' }}>{retrying ? 'Verificando…' : 'Tentar novamente'}</Text></Pressable>{retryError && <Text accessibilityRole="alert" style={{ color: theme.danger }}>{retryError}</Text>}</View></SafeAreaView>}
    {user?.impersonation && <SafeAreaView edges={['top']} style={{ backgroundColor: theme.soft }}><View style={{ padding: 12, gap: 8 }}><Text style={{ color: theme.text, fontFamily: 'GeistSemiBold' }}>Você está logado como {user.impersonation.userName}</Text><Pressable accessibilityRole="button" accessibilityLabel="Sair da visualização" disabled={leaving} onPress={() => { void leave(); }} style={{ alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: theme.surface }}><Text style={{ color: theme.primary, fontFamily: 'GeistSemiBold' }}>{leaving ? 'Restaurando sua sessão…' : 'Sair da visualização'}</Text></Pressable>{error && <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text>}</View></SafeAreaView>}
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background }, animation: 'fade' }} />
  </View>;
}
export default function RootLayout() {
  return <SafeAreaProvider><ThemeProvider><SessionProvider><Navigation /></SessionProvider></ThemeProvider></SafeAreaProvider>;
}
