import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import { useSession } from '../context/SessionContext';
import { configureGoogle, requestGoogleToken } from '../services/googleNative';
type GoogleSdk = typeof import('@react-native-google-signin/google-signin');

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
export function useGoogleSignIn(onSuccess?: () => void) {
  const { googleSignIn } = useSession();
  const configured = Boolean(webClientId && (Platform.OS !== 'ios' || iosClientId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const signIn = useCallback(async () => {
    if (inFlight.current) return;
    setError(null);
    if (isRunningInExpoGo()) {
      setError('O login Google exige a development build do EventMap; não funciona no Expo Go.');
      return;
    }
    if (!configured) {
      setError('O acesso com Google ainda não está configurado neste aplicativo.');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    let sdk: GoogleSdk | undefined;
    try {
      sdk = await configureGoogle();
      const idToken = await requestGoogleToken(sdk, Platform.OS === 'android');
      if (!idToken) return;
      await googleSignIn(idToken);
      if (mounted.current) onSuccess?.();
    } catch (cause) {
      if (!mounted.current) return;
      if (sdk?.isErrorWithCode(cause)) {
        const { statusCodes } = sdk;
        if (cause.code === statusCodes.SIGN_IN_CANCELLED) return;
        if (cause.code === statusCodes.IN_PROGRESS) {
          setError('O acesso com Google já está em andamento.');
        } else if (cause.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          setError('Atualize os serviços do Google Play para entrar com o Google.');
        } else if (cause.code === '10' || cause.code === 'DEVELOPER_ERROR') {
          setError('A configuração Google não corresponde a este app ou certificado. Confira o package e o SHA-1 da build.');
        } else if (cause.code === '7' || cause.code === 'NETWORK_ERROR') {
          setError('Falha de rede ao conectar ao Google. Confira sua internet e tente novamente.');
        } else {
          setError('Não foi possível entrar com o Google. Tente novamente.');
        }
      } else {
        setError(!sdk ? 'O módulo Google não está disponível nesta instalação. Atualize o aplicativo e tente novamente.' : cause instanceof Error ? cause.message : 'Não foi possível entrar com o Google.');
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [configured, googleSignIn, onSuccess]);

  return { signIn, busy, error, enabled: configured };
}
