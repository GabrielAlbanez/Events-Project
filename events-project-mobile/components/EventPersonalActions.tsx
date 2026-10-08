import React, { useState } from 'react';
import { Linking, Share } from 'react-native';
import type { Evento } from '../types';
import { api, request } from '../services/api';
import { WEB_URL, requireApiUrl } from '../services/config';
import { useSession } from '../context/SessionContext';
import { useResource } from '../hooks/useResource';
import { Button, Card, Label, State } from './ui';
interface SavedState { saved: boolean; reminderMinutes: number | null }
export function EventPersonalActions({ event, onLogin }: { event: Evento; onLogin: () => void }) {
  const session = useSession();
  const saved = useResource<SavedState>(() => session.user ? request(`/events/${encodeURIComponent(event.id)}/favorite`) : Promise.resolve({ saved: false, reminderMinutes: null }), `favorite:${event.id}`, { user: true });
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  async function run(task: () => Promise<unknown>) { if (busy) return; setBusy(true); setMessage(''); try { await task(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível concluir.'); } finally { setBusy(false); } }
  return <Card><Label bold>Guarde esse encontro</Label>{session.user ? <>{saved.error && <State error={saved.error} retry={saved.reload} />}<Button title={saved.data?.saved ? '✓ Salvo · Remover dos favoritos' : 'Salvar nos favoritos'} secondary busy={busy || saved.loading} onPress={() => { void run(async () => { await api.favorite(event.id); await saved.refresh(); }); }} />{saved.data?.saved && <><Label muted size={13}>Lembrete na plataforma</Label>{[{ value: null, label: 'Sem lembrete' }, { value: 60, label: '1 hora antes' }, { value: 1440, label: '1 dia antes' }].map(item => <Button key={String(item.value)} title={`${saved.data?.reminderMinutes === item.value ? '✓ ' : ''}${item.label}`} secondary busy={busy} onPress={() => { void run(async () => { await api.reminder(event.id, item.value); await saved.refresh(); setMessage('Lembrete atualizado.'); }); }} />)}<Label muted size={12}>Acompanhe os avisos em suas notificações.</Label></>}</> : <Button title="Entrar para salvar e receber lembretes" secondary onPress={onLogin} />}{WEB_URL && <Button title="Compartilhar evento" secondary busy={busy} onPress={() => { void run(() => Share.share({ message: `${event.nome}\n${WEB_URL}/eventos/${encodeURIComponent(event.id)}` })); }} />}{event.status && ['PUBLISHED', 'CANCELLED', 'ENDED'].includes(event.status) && <Button title="Adicionar ao calendário" secondary busy={busy} onPress={() => { void run(() => Linking.openURL(`${requireApiUrl()}/v1/event-calendar/${encodeURIComponent(event.id)}`)); }} />}{Boolean(message) && <Label>{message}</Label>}</Card>;
}
