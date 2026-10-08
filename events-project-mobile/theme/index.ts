import React, { createContext, useContext, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
/** Visual tokens only: theme preference and selection behavior remain unchanged. */
export const design = {
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 12, md: 16, lg: 24, pill: 999 },
  type: { caption: 12, small: 14, body: 16, title: 22, hero: 30 },
  font: { regular: 'Geist', medium: 'GeistSemiBold', bold: 'GeistBold' },
  lineHeight: 1.5,
  border: { hairline: 1 },
  size: { touch: 48, avatar: 52, icon: 20, contentMax: 760, cover: 176, skeletonLine: 12 },
  opacity: { pressed: 0.82, disabled: 0.5 },
  shadow: { card: { shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 } },
  overlay: '#00000088',
};
export const palette = {
  light: { background: '#F7F6FA', surface: '#FFFFFF', surfaceElevated: '#FFFFFF', surfaceMuted: '#F0EEF5', text: '#181620', muted: '#625E70', border: '#E5E1EC', primary: '#6D25DA', onPrimary: '#FFFFFF', soft: '#EEE8FF', danger: '#B42337', dangerSoft: '#FFF0F2', success: '#21734F', successSoft: '#EAF6EF' },
  dark: { background: '#080808', surface: '#111111', surfaceElevated: '#18171B', surfaceMuted: '#1E1C23', text: '#FAFAFA', muted: '#B1ADB9', border: '#29262F', primary: '#AC89FA', onPrimary: '#100B1A', soft: '#252033', danger: '#FF8797', dangerSoft: '#301A21', success: '#85D6B0', successSoft: '#172A22' },
};
export type ThemeMode = 'system' | 'light' | 'dark';
interface ThemePreference { mode: ThemeMode; setMode: (mode: ThemeMode) => void }
const Context = createContext<ThemePreference>({ mode: 'system', setMode: () => {} });
export function ThemeProvider({ children }: { children: ReactNode }) { const [mode, setMode] = useState<ThemeMode>('system'); return React.createElement(Context.Provider, { value: { mode, setMode } }, children); }
export function useThemeMode() { return useContext(Context); }
export function useTheme() { const system = useColorScheme(); const { mode } = useThemeMode(); return palette[(mode === 'system' ? system : mode) === 'dark' ? 'dark' : 'light']; }
