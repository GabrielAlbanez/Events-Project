import React from 'react';
import { Image, Pressable, View } from 'react-native';
import type { Evento } from '../types';
import { Card, Label } from './ui';
import { eventDate } from './eventDate';
export function EventCard({ event, onPress, uri }: { event: Evento; onPress: () => void; uri: (path: string) => string }) { return <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${event.nome}`} onPress={onPress}><Card>{event.banner ? <Image accessibilityLabel={`Imagem de ${event.nome}`} source={{ uri: uri(event.banner) }} style={{ height: 170, borderRadius: 15, width: '100%' }} /> : null}<View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><Label size={12} muted>{event.category || 'EVENTO'}</Label><Label size={12} bold>{event.isFree ? 'Gratuito' : event.priceCents ? (event.priceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Ver ingressos'}</Label></View><Label size={20} bold>{event.nome}</Label><Label muted size={13}>{eventDate(event.dataInicio)} · {event.startTime || ''}</Label><Label muted size={13}>{event.endereco}</Label></Card></Pressable>; }

