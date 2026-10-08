import type { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'EventMap',
  slug: 'events-project-mobile',
  scheme: ['eventmap', 'com.eventmap.mobile'],
  version: '1.0.0',
  icon: './assets/eventmap-app-icon.png',
  userInterfaceStyle: 'automatic',
  orientation: 'default',
  ios: { ...config.ios, supportsTablet: true, bundleIdentifier: 'com.eventmap.mobile' },
  android: { ...config.android, package: 'com.eventmap.mobile', adaptiveIcon: { foregroundImage: './assets/eventmap-app-icon.png' }, predictiveBackGestureEnabled: true, softwareKeyboardLayoutMode: 'resize' },
  extra: { ...config.extra, androidMapsConfigured: Boolean(process.env.GOOGLE_MAPS_ANDROID_API_KEY) },
  plugins: [
    'expo-router', 'expo-secure-store', 'expo-web-browser', 'expo-font',
    ...(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
      ? [['@react-native-google-signin/google-signin', { iosUrlScheme: `com.googleusercontent.apps.${process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID.replace(/\.apps\.googleusercontent\.com$/, '')}` }]] as NonNullable<ExpoConfig['plugins']>
      : ['@react-native-google-signin/google-signin']),
    './plugins/withAndroidObjectPaths.cjs',
    ['expo-camera', { cameraPermission: 'Permita ao EventMap ler o QR de check-in.', recordAudioAndroid: false }],
    ['expo-image-picker', { photosPermission: 'Permita ao EventMap selecionar fotos do perfil e dos eventos.', cameraPermission: 'Permita ao EventMap tirar uma foto.' }],
    ['expo-location', { locationWhenInUsePermission: 'Permita ao EventMap encontrar eventos próximos.' }],
    ...(process.env.GOOGLE_MAPS_ANDROID_API_KEY || process.env.GOOGLE_MAPS_IOS_API_KEY ? [['react-native-maps', { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY, iosGoogleMapsApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY }]] as NonNullable<ExpoConfig['plugins']> : []),
  ],
});



