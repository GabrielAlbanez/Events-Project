import React from 'react';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../theme';
export default function TabLayout() {
  const theme = useTheme(); const insets = useSafeAreaInsets();
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: theme.primary, tabBarInactiveTintColor: theme.muted, tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border, height: 64 + insets.bottom, paddingTop: 6, paddingBottom: Math.max(8, insets.bottom) }, tabBarLabelStyle: { fontFamily: 'Geist', fontSize: 11 } }}>
    <Tabs.Screen name="index" options={{ title: 'Descobrir', tabBarIcon: ({ color, size }) => <Ionicons name="compass-outline" color={color} size={size} /> }} />
    <Tabs.Screen name="agenda" options={{ title: 'Agenda', tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" color={color} size={size} /> }} />
    <Tabs.Screen name="activity" options={{ title: 'Atividade', tabBarIcon: ({ color, size }) => <Ionicons name="pulse-outline" color={color} size={size} /> }} />
    <Tabs.Screen name="account" options={{ title: 'Conta', tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" color={color} size={size} /> }} />
  </Tabs>;
}
