type GoogleSdk = typeof import('@react-native-google-signin/google-signin');
let initialized = false;

export async function configureGoogle(): Promise<GoogleSdk> {
  const sdk = await import('@react-native-google-signin/google-signin');
  if (!initialized) {
    sdk.GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      offlineAccess: false,
    });
    initialized = true;
  }
  return sdk;
}

// Dependency injection keeps native result handling testable without a device.
export async function requestGoogleToken(sdk: GoogleSdk, android: boolean): Promise<string | null> {
  if (android) await sdk.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await sdk.GoogleSignin.signIn();
  if (!sdk.isSuccessResponse(response)) return null;
  if (!response.data.idToken) throw new Error('O Google n\u00e3o retornou uma credencial de acesso.');
  return response.data.idToken;
}

export async function signOutGoogle(injectedSdk?: GoogleSdk): Promise<void> {
  const sdk = injectedSdk ?? await configureGoogle();
  await sdk.GoogleSignin.signOut();
}
