import React from 'react';
import { View, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { design, useTheme } from '../../../theme';
export default function TabLayout() {
  const theme = useTheme(); const insets = useSafeAreaInsets();
  const icon = (name: React.ComponentProps<typeof Ionicons>['name'], color: ColorValue, size: number, focused: boolean) => <View style={{ minWidth: design.size.touch, height: design.size.touch - design.space.md, borderRadius: design.radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? theme.soft : 'transparent' }}><Ionicons name={name} color={color} size={size} /></View>;
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: theme.primary, tabBarInactiveTintColor: theme.muted, tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border, height: design.size.touch + design.space.xl + insets.bottom, paddingTop: design.space.sm, paddingBottom: Math.max(design.space.sm, insets.bottom) }, tabBarItemStyle: { minHeight: design.size.touch }, tabBarLabelStyle: { fontFamily: design.font.medium, fontSize: design.type.caption, marginTop: design.space.xs } }}>
    <Tabs.Screen name="index" options={{ title: 'Descobrir', tabBarIcon: ({ color, size, focused }) => icon('compass-outline', color, size, focused) }} />
    <Tabs.Screen name="agenda" options={{ title: 'Agenda', tabBarIcon: ({ color, size, focused }) => icon('calendar-outline', color, size, focused) }} />
    <Tabs.Screen name="activity" options={{ title: 'Atividade', tabBarIcon: ({ color, size, focused }) => icon('pulse-outline', color, size, focused) }} />
    <Tabs.Screen name="account" options={{ title: 'Conta', tabBarIcon: ({ color, size, focused }) => icon('person-circle-outline', color, size, focused) }} />
  </Tabs>;
}

