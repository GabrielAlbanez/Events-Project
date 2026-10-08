import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useSession } from '../context/SessionContext';

WebBrowser.maybeCompleteAuthSession();
const clients = { web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID };
type NativeGoogleModule = typeof import('@react-native-google-signin/google-signin');
let configuredNative = false;

export function useGoogleSignIn(onSuccess?: () => void) {
  const { googleSignIn } = useSession();
  const configured = Boolean(clients.web && (Platform.OS !== 'ios' || clients.ios));
  const [request, , promptAsync] = Google.useIdTokenAuthRequest({ clientId: clients.web, webClientId: clients.web, iosClientId: clients.ios, androidClientId: clients.android, selectAccount: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const signIn = useCallback(async () => {
    if (inFlight.current) return;
    setError(null);
    if (Platform.OS !== 'web' && isRunningInExpoGo()) {
      setError('O login Google precisa da versão de desenvolvimento instalada do EventMap. No Expo Go, entre com e-mail e senha.');
      return;
    }
    if (!configured) { setError('O acesso com Google ainda não está configurado neste aplicativo.'); return; }
    if (Platform.OS === 'web' && !request) return;
    inFlight.current = true;
    setBusy(true);
    let native: NativeGoogleModule | undefined;
    try {
      let idToken: string | null | undefined;
      if (Platform.OS === 'web') {
        const result = await promptAsync();
        if (result.type === 'error') throw new Error('Não foi possível entrar com o Google. Tente novamente.');
        if (result.type !== 'success') return;
        idToken = result.authentication?.idToken ?? result.params.id_token;
      } else {
        // Load only after the Expo Go guard: the native module is absent from Expo Go.
        native = await import('@react-native-google-signin/google-signin');
        if (!configuredNative) {
          native.GoogleSignin.configure({ webClientId: clients.web, iosClientId: clients.ios, offlineAccess: false });
          configuredNative = true;
        }
        if (Platform.OS === 'android') await native.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        const result = await native.GoogleSignin.signIn();
        if (!native.isSuccessResponse(result)) return;
        idToken = result.data.idToken;
      }
      if (!idToken) throw new Error('O Google não retornou uma credencial de acesso.');
      await googleSignIn(idToken);
      onSuccess?.();
    } catch (cause) {
      if (native?.isErrorWithCode(cause)) {
        if (cause.code === native.statusCodes.SIGN_IN_CANCELLED) return;
        if (cause.code === native.statusCodes.IN_PROGRESS) { setError('Já existe um acesso com Google em andamento.'); return; }
        if (cause.code === native.statusCodes.PLAY_SERVICES_NOT_AVAILABLE) { setError('Atualize o Google Play Services para entrar com Google.'); return; }
        if (cause.code === '10' || cause.code === 'DEVELOPER_ERROR') { setError('A configuração Google desta versão Android não corresponde ao aplicativo e ao certificado.'); return; }
      }
      setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o acesso com Google.');
    } finally { inFlight.current = false; setBusy(false); }
  }, [configured, request, promptAsync, googleSignIn, onSuccess]);
  return { signIn, busy, error, enabled: Platform.OS === 'web' ? configured && Boolean(request) : configured };
}
