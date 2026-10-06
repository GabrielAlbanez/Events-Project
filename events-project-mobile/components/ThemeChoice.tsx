import React from 'react';
import { View } from 'react-native';
import { useThemeMode, type ThemeMode } from '../theme';
import { Button, Label } from './ui';
export function ThemeChoice() { const { mode, setMode } = useThemeMode(); return <View style={{ gap: 10 }}><Label bold size={13}>Aparência</Label><View style={{ flexDirection: 'row', gap: 8 }}>{([{ value: 'light', label: 'Claro' },{ value: 'dark', label: 'Escuro' },{ value: 'system', label: 'Sistema' }] as { value: ThemeMode; label: string }[]).map(v => <View key={v.value} style={{ flex: 1 }}><Button title={`${mode === v.value ? '✓ ' : ''}${v.label}`} secondary onPress={() => setMode(v.value)} /></View>)}</View></View>; }
