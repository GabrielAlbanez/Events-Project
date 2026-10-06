import React from 'react';
import type { Evento } from '../types';
import { Card, Label } from './ui';
export function EventMap({ events, onSelect }: { events: Evento[]; onSelect: (id: string) => void }) { return <Card><Label bold>Mapa nativo disponível no aplicativo Android e iOS</Label><Label muted>A prévia web exibe os cartões de eventos. Abra o aplicativo em um dispositivo para explorar o mapa.</Label></Card>; }
