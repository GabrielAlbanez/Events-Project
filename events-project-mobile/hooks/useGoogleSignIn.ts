import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useSession } from '../context/SessionContext';
WebBrowser.maybeCompleteAuthSession();
const clients = { web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID };
export function useGoogleSignIn(onSuccess?: () => void) {
  const { googleSignIn } = useSession();
  const configured = Boolean(Platform.OS === 'ios' ? clients.ios : Platform.OS === 'android' ? clients.android : clients.web);
  const [request, , promptAsync] = Google.useIdTokenAuthRequest({ clientId: 'not-configured.apps.googleusercontent.com', webClientId: clients.web, iosClientId: clients.ios, androidClientId: clients.android, selectAccount: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signIn = useCallback(async () => {
    setError(null);
    if (!configured) { setError('O acesso com Google ainda não está configurado neste aplicativo.'); return; }
    if (!request || busy) return;
    setBusy(true);
    try {
      const result = await promptAsync();
      if (result.type === 'error') throw new Error('Não foi possível entrar com o Google. Tente novamente.');
      if (result.type !== 'success') return;
      const idToken = result.authentication?.idToken ?? result.params.id_token;
      if (!idToken) throw new Error('O Google não retornou uma credencial de acesso.');
      await googleSignIn(idToken);
      onSuccess?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o acesso com Google.'); }
    finally { setBusy(false); }
  }, [configured, request, busy, promptAsync, googleSignIn, onSuccess]);
  return { signIn, busy, error, enabled: configured && Boolean(request) };
}
