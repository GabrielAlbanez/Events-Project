import React from 'react';
import { View } from 'react-native';
import { design, useThemeMode, type ThemeMode } from '../theme';
import { Button, Label } from './ui';
export function ThemeChoice() { const { mode, setMode } = useThemeMode(); return <View style={{ gap: design.space.md }}><Label bold size={design.type.small}>Aparência</Label><View style={{ flexDirection: 'row', gap: design.space.sm, padding: design.space.xs, borderRadius: design.radius.md + design.space.xs }}>{([{ value: 'light', label: 'Claro' },{ value: 'dark', label: 'Escuro' },{ value: 'system', label: 'Sistema' }] as { value: ThemeMode; label: string }[]).map(v => <View key={v.value} style={{ flex: 1, borderRadius: design.radius.md }}><Button title={`${mode === v.value ? '✓ ' : ''}${v.label}`} secondary onPress={() => setMode(v.value)} /></View>)}</View></View>; }

