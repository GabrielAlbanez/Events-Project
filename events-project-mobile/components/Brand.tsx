import React from 'react';
import { Image, View } from 'react-native';
import { design } from '../theme';
import { Label } from './ui';
export function Brand() { return <View accessible accessibilityLabel="EventMap" style={{ flexDirection: 'row', gap: design.space.md, alignItems: 'center', paddingVertical: design.space.xs }}><Image source={require('../assets/eventmap-app-icon.png')} accessibilityIgnoresInvertColors style={{ width: design.size.touch - design.space.sm, height: design.size.touch - design.space.sm }} resizeMode="contain" /><Label bold size={design.type.title}>EventMap</Label></View>; }
