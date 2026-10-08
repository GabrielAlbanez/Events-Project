import React, { useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, type TextInputProps } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { design, useTheme } from '../theme';

export function Label({ children, muted = false, size = 15, bold = false }: { children: ReactNode; muted?: boolean; size?: number; bold?: boolean }) {
  const t = useTheme();
  return <Text style={{ color: muted ? t.muted : t.text, fontFamily: bold ? design.font.bold : design.font.regular, fontSize: size, fontWeight: bold ? '700' : '400', lineHeight: size * design.lineHeight }}>{children}</Text>;
}
export function Card({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <View style={{ ...design.shadow.card, backgroundColor: t.surface, borderColor: t.border, borderWidth: design.border.hairline, borderRadius: design.radius.lg, padding: design.space.lg, gap: design.space.md }}>{children}</View>;
}
export function Button({ title, onPress, secondary = false, disabled = false, busy = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean; busy?: boolean }) {
  const t = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress}
    style={({ pressed }) => ({ minHeight: design.size.touch, borderRadius: design.radius.md, borderWidth: design.border.hairline, borderColor: secondary ? t.border : t.primary, backgroundColor: secondary ? t.soft : t.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: design.space.lg, paddingVertical: design.space.md, opacity: disabled || busy ? design.opacity.disabled : pressed ? design.opacity.pressed : 1 })}>
    {busy ? <ActivityIndicator color={secondary ? t.primary : t.onPrimary} /> : <Text style={{ fontFamily: design.font.medium, fontSize: design.type.small, fontWeight: '600', lineHeight: design.type.small * design.lineHeight, textAlign: 'center', color: secondary ? t.primary : t.onPrimary }}>{title}</Text>}
  </Pressable>;
}
export function Input({ label, ...props }: TextInputProps & { label: string }) {
  const t = useTheme(); const [focused, setFocused] = useState(false);
  return <View style={{ gap: design.space.sm }}><Label size={design.type.small} bold>{label}</Label>
    <TextInput accessibilityLabel={label} placeholderTextColor={t.muted} {...props} onFocus={event => { setFocused(true); props.onFocus?.(event); }} onBlur={event => { setFocused(false); props.onBlur?.(event); }}
      style={[{ color: t.text, backgroundColor: t.surfaceElevated, borderWidth: design.border.hairline, borderColor: focused ? t.primary : t.border, padding: design.space.lg, borderRadius: design.radius.md, minHeight: design.size.touch, fontFamily: design.font.regular, fontSize: design.type.body, textAlignVertical: props.multiline ? 'top' : 'center' }, props.style]} />
  </View>;
}
export function Avatar({ name, uri }: { name: string; uri?: string | null }) {
  const t = useTheme(); const [failedUri, setFailedUri] = useState<string | null>(null);
  return uri && failedUri !== uri ? <Image onError={() => setFailedUri(uri)} accessibilityLabel={name} source={{ uri }} style={{ width: design.size.avatar, height: design.size.avatar, borderRadius: design.radius.pill, borderWidth: design.border.hairline, borderColor: t.border }} /> :
    <View style={{ width: design.size.avatar, height: design.size.avatar, borderRadius: design.radius.pill, backgroundColor: t.soft, borderWidth: design.border.hairline, borderColor: t.border, alignItems: 'center', justifyContent: 'center' }}><Label size={20} bold>{name.slice(0, 1).toUpperCase()}</Label></View>;
}
export function Screen({ title, subtitle, children, onBack, action }: { title: string; subtitle?: string; children: ReactNode; onBack?: () => void; action?: ReactNode }) {
  const t = useTheme(); const insets = useSafeAreaInsets();
  return <SafeAreaView style={{ flex: 1, backgroundColor: t.background }} edges={['top', 'left', 'right']}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: design.space.lg, paddingBottom: Math.max(40, insets.bottom + design.space.xl), gap: design.space.xl, maxWidth: design.size.contentMax, width: '100%', alignSelf: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: design.space.md, paddingTop: design.space.sm, paddingBottom: design.space.sm }}>
        {onBack && <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onBack} style={({ pressed }) => ({ minHeight: design.size.touch, minWidth: design.size.touch, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface, borderWidth: design.border.hairline, borderColor: t.border, borderRadius: design.radius.md, opacity: pressed ? design.opacity.pressed : 1 })}><Ionicons name="chevron-back" size={design.size.icon} color={t.text} accessible={false} /></Pressable>}
        <View style={{ flex: 1, gap: design.space.xs }}><Label size={design.type.hero} bold>{title}</Label>{Boolean(subtitle) && <Label muted size={design.type.small}>{subtitle}</Label>}</View>{action}
      </View>{children}
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}
export function State({ loading, error, retry, empty }: { loading?: boolean; error?: string | null; retry?: () => void; empty?: string }) {
  const t = useTheme();
  // Static skeleton avoids perpetual shimmer and remains calm with reduced motion.
  if (loading) return <View accessibilityLabel="Carregando" accessibilityState={{ busy: true }} style={{ padding: design.space.xl, gap: design.space.lg, borderWidth: design.border.hairline, borderColor: t.border, borderRadius: design.radius.lg, backgroundColor: t.surface }}>
    <ActivityIndicator color={t.primary} /><View accessible={false} style={{ gap: design.space.md }}><View style={{ height: design.size.skeletonLine, width: '68%', borderRadius: design.radius.pill, backgroundColor: t.surfaceMuted }} /><View style={{ height: design.size.skeletonLine, width: '92%', borderRadius: design.radius.pill, backgroundColor: t.surfaceMuted }} /><View style={{ height: design.size.skeletonLine, width: '46%', borderRadius: design.radius.pill, backgroundColor: t.surfaceMuted }} /></View>
  </View>;
  return <Card><View style={{ width: design.size.touch, height: design.size.touch, borderRadius: design.radius.md, backgroundColor: error ? t.dangerSoft : t.soft, alignItems: 'center', justifyContent: 'center' }} accessible={false}><Ionicons name={error ? 'alert-circle-outline' : 'sparkles-outline'} color={error ? t.danger : t.primary} size={design.size.icon} /></View><Label muted>{error || empty || 'Nenhum resultado por aqui ainda.'}</Label>{error && retry && <Button title="Tentar novamente" secondary onPress={retry} />}</Card>;
}
