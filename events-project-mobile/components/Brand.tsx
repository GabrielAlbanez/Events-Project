import React from 'react';
import { Image, View } from 'react-native';
import { Label } from './ui';
export function Brand() { return <View accessible accessibilityLabel="EventMap" style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><Image source={require('../assets/eventmap-app-icon.png')} accessibilityIgnoresInvertColors style={{ width: 40, height: 40 }} resizeMode="contain" /><Label bold size={19}>EventMap</Label></View>; }
