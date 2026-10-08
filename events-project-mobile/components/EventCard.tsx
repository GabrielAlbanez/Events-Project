import React from 'react';
import { Image, Pressable, View } from 'react-native';
import type { Evento } from '../types';
import { design, useTheme } from '../theme';
import { Card, Label } from './ui';
import { eventDate } from './eventDate';

export function EventCard({ event, onPress, uri }: { event: Evento; onPress: () => void; uri: (path: string) => string }) {
  const t = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${event.nome}`} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? design.opacity.pressed : 1 })}>
    <Card>
      {event.banner ? <Image accessibilityLabel={`Imagem de ${event.nome}`} source={{ uri: uri(event.banner) }} style={{ aspectRatio: 16 / 9, borderRadius: design.radius.md, width: '100%', backgroundColor: t.surfaceMuted }} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: design.space.sm }}>
        <View style={{ backgroundColor: t.soft, borderRadius: design.radius.pill, paddingHorizontal: design.space.md, paddingVertical: design.space.xs }}><Label size={design.type.caption} bold>{event.category || 'EVENTO'}</Label></View>
        <View style={{ flexShrink: 1 }}><Label size={design.type.small} bold>{event.isFree ? 'Gratuito' : event.priceCents ? (event.priceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Ver ingressos'}</Label></View>
      </View>
      <Label size={design.type.title} bold>{event.nome}</Label>
      <View style={{ borderTopWidth: design.border.hairline, borderTopColor: t.border, paddingTop: design.space.md, gap: design.space.xs }}>
        <Label muted size={design.type.small}>{eventDate(event.dataInicio)} · {event.startTime || ''}</Label>
        <Label muted size={design.type.small}>{event.endereco}</Label>
      </View>
    </Card>
  </Pressable>;
}
