import React, { createContext, useContext, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
export const palette = {
  light: { background: '#FFFFFF', surface: '#FFFFFF', text: '#181620', muted: '#726E81', border: '#E8E5EF', primary: '#6D25DA', soft: '#EEE8FF', danger: '#B42337' },
  dark: { background: '#080808', surface: '#111111', text: '#FAFAFA', muted: '#A3A3A3', border: '#1C1C1C', primary: '#AC89FA', soft: '#252033', danger: '#FF8797' },
};
export type ThemeMode = 'system' | 'light' | 'dark';
interface ThemePreference { mode: ThemeMode; setMode: (mode: ThemeMode) => void }
const Context = createContext<ThemePreference>({ mode: 'system', setMode: () => {} });
export function ThemeProvider({ children }: { children: ReactNode }) { const [mode, setMode] = useState<ThemeMode>('system'); return React.createElement(Context.Provider, { value: { mode, setMode } }, children); }
export function useThemeMode() { return useContext(Context); }
export function useTheme() { const system = useColorScheme(); const { mode } = useThemeMode(); return palette[(mode === 'system' ? system : mode) === 'dark' ? 'dark' : 'light']; }
