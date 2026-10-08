import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { api, ApiError, uploadChatImage } from '../services/api';
import { mediaUrl } from '../services/config';
import { onSocket, peerPresence, sendTyping, syncChat } from '../services/realtime';
import { useResource } from '../hooks/useResource';
import { useSession } from '../context/SessionContext';
import { design, useTheme } from '../theme';
import type { EventChatHistory, EventChatMessage } from '../types';
import type { NativeScreenProps } from './NativeScreen';
import { Avatar, Button, Card, Label, State } from '../components/ui';
import { ProtectedChatImage } from '../components/ProtectedChatImage';
import { PartySafetyMenu } from '../components/connections/PartySafetyMenu';
interface Draft { clientId: string; text: string; imageId?: string; imageUrl?: string; createdAt: string; failed: boolean }
type Row = { key: string; message: EventChatMessage; status: string; date: string; pending?: Draft };
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => { const value = Math.floor(Math.random() * 16); return (char === 'x' ? value : value & 3 | 8).toString(16); });
const Bubble = memo(function Bubble({ row, retry, eventId, privateChat, onBlocked }: { row: Row; retry: (draft: Draft) => void; eventId: string; privateChat: boolean; onBlocked: () => void }) {
  const theme = useTheme(); const message = row.message;
  return <View style={{ gap: design.space.sm, paddingVertical: design.space.xs }}>
    {row.date && <View style={{ alignSelf: 'center', borderRadius: design.radius.pill, paddingVertical: design.space.sm, paddingHorizontal: design.space.lg, backgroundColor: theme.surfaceMuted }}><Label muted size={design.type.caption}>{row.date}</Label></View>}
    <View style={{ flexDirection: message.own ? 'row-reverse' : 'row', gap: design.space.sm, alignItems: 'flex-end' }}>
      <Avatar name={message.author.name} uri={mediaUrl(message.author.image)} />
      <View style={{ maxWidth: '78%', padding: design.space.md, borderRadius: design.radius.md, borderBottomRightRadius: message.own ? design.space.xs : design.radius.md, borderBottomLeftRadius: message.own ? design.radius.md : design.space.xs, backgroundColor: message.own ? theme.soft : theme.surfaceElevated, borderWidth: 1, borderColor: theme.border, gap: design.space.xs }}>
        <Label size={12} bold>{message.own ? 'Você' : message.author.name}</Label>
        {message.image?.url && <ProtectedChatImage path={message.image.url} />}
        {Boolean(message.text) && <Label>{message.text}</Label>}
        <Label muted size={design.type.caption}>{new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {row.status}</Label>
        {privateChat && !message.own && message.id > 0 && <PartySafetyMenu eventId={eventId} userId={message.author.id} displayName={message.author.name} messageId={message.id} evidence={message.text} label="Denunciar esta mensagem" onBlocked={onBlocked} />}{row.pending?.failed && <Button title="Reenviar" secondary onPress={() => retry(row.pending!)} />}
      </View>
    </View>
  </View>;
});
function ChatConversation({ route, onBack, navigate }: NativeScreenProps) {
  const eventId = route.id!, matchId = route.matchId; const { user } = useSession(); const theme = useTheme();
  const resource = useResource<EventChatHistory>(() => matchId ? api.privateHistory(eventId, matchId) : api.chatHistory(eventId), `${eventId}:${matchId}`, matchId ? { matchId } : { chatEventId: eventId });
  const [text, setText] = useState(''); const [attachment, setAttachment] = useState<{ id: string; url: string } | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]); const [uploading, setUploading] = useState(false); const [olderBusy, setOlderBusy] = useState(false);
  const [error, setError] = useState<string | null>(null); const [online, setOnline] = useState<boolean | null>(null);
  const [older, setOlder] = useState<EventChatMessage[]>([]); const [hasOlder, setHasOlder] = useState<boolean | null>(null);
  const [typingUntil, setTypingUntil] = useState(0); const [clock, setClock] = useState(() => Date.now()); const [newCount, setNewCount] = useState(0); const [readingAtEnd, setReadingAtEnd] = useState(true);
  const input = useRef<TextInput>(null); const list = useRef<FlatList<Row>>(null);
  const receipt = useRef(0); const delivered = useRef(0); const generation = useRef(0); const alive = useRef(true); const typingAt = useRef(0); const typingStop = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composerClaimed = useRef(false); const atEnd = useRef(true); const sends = useRef(new Set<string>()); const latestId = useRef(0);
  const accessDenied = !resource.loading && Boolean(resource.error) && !resource.data;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (!accessDenied) return; generation.current++; const frame = requestAnimationFrame(() => { setOlder([]); setDrafts([]); setAttachment(null); setText(''); }); return () => cancelAnimationFrame(frame); }, [accessDenied]);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!matchId) return;
    let active = true;
    const presence = () => { void peerPresence(matchId).then(value => { if (active) setOnline(value); }); };
    presence(); syncChat(matchId);
    const timer = setInterval(presence, 10000);
    const unsubscribe = onSocket('typing', (...args) => {
      const signal = args[0];
      if (signal && typeof signal === 'object' && 'room' in signal && signal.room === `match:${matchId}` && 'until' in signal && typeof signal.until === 'number') setTypingUntil(signal.until);
    });
    return () => { active = false; clearInterval(timer); unsubscribe(); if (typingStop.current) clearTimeout(typingStop.current); sendTyping(matchId, false); };
  }, [matchId]);
  useEffect(() => {
    if (!matchId || accessDenied) return;
    const latest = resource.data?.messages.filter(message => !message.own).at(-1);
    if (!latest) return;
    const current = generation.current;
    const failed = () => { if (alive.current && current === generation.current) setError('Não foi possível sincronizar a entrega e leitura. Tente atualizar a conversa.'); };
    if (latest.id > delivered.current) {
      delivered.current = latest.id;
      void api.privateControl(eventId, matchId, { action: 'receipt', messageId: latest.id, read: false }).catch(() => { delivered.current = 0; failed(); });
    }
    if (readingAtEnd && latest.id > receipt.current) {
      receipt.current = latest.id;
      void api.privateControl(eventId, matchId, { action: 'receipt', messageId: latest.id, read: true }).catch(() => { receipt.current = 0; failed(); });
    }
  }, [eventId, matchId, resource.data, readingAtEnd, accessDenied]);
  const rows = useMemo<Row[]>(() => {
    const unique = new Map<number, EventChatMessage>();
    for (const message of [...older, ...(resource.data?.messages ?? [])]) unique.set(message.id, message);
    const messages = Array.from(unique.values()).sort((left, right) => left.id - right.id);
    const confirmed = new Set(messages.map(message => message.clientId));
    const pendingMessages = drafts.filter(draft => !confirmed.has(draft.clientId)).map(draft => ({ id: 0, clientId: draft.clientId, text: draft.text, createdAt: draft.createdAt, author: { id: user?.id ?? '', name: user?.name ?? 'Você', image: user?.image ?? null }, own: true, ...(draft.imageUrl ? { image: { url: draft.imageUrl } } : {}) }));
    let previousDate = '';
    return [...messages, ...pendingMessages].map(message => {
      const draft = drafts.find(entry => entry.clientId === message.clientId && !confirmed.has(entry.clientId));
      const date = new Date(message.createdAt).toLocaleDateString('pt-BR');
      const label = date !== previousDate ? date : ''; previousDate = date;
      const partner = resource.data?.partnerReceipt;
      const status = draft ? draft.failed ? 'Não enviada' : 'Enviando' : message.own ? partner && partner.readThrough >= message.id ? '✓✓ Lida' : partner && partner.deliveredThrough >= message.id ? '✓✓ Entregue' : '✓ Enviada' : '';
      return { key: message.clientId, message, status, date: label, pending: draft };
    });
  }, [older, resource.data, drafts, user]);
  useEffect(() => {
    const confirmed = rows.filter(row => row.message.id > 0);
    const newest = Math.max(0, ...confirmed.map(row => row.message.id));
    const added = latestId.current ? confirmed.filter(row => row.message.id > latestId.current && !row.message.own).length : 0;
    latestId.current = Math.max(latestId.current, newest);
    let frame: number | undefined;
    if (atEnd.current) frame = requestAnimationFrame(() => list.current?.scrollToEnd({ animated: false }));
    else if (added) frame = requestAnimationFrame(() => setNewCount(count => count + added));
    return () => { if (frame !== undefined) cancelAnimationFrame(frame); };
  }, [rows]);
  async function send(retry?: Draft) {
    if (accessDenied) return; const operation = generation.current;
    if (!retry && (!text.trim() && !attachment || uploading || composerClaimed.current)) return;
    if (!retry) composerClaimed.current = true;
    const pending = retry ?? { clientId: uuid(), text: text.trim(), imageId: attachment?.id, imageUrl: attachment?.url, createdAt: new Date().toISOString(), failed: false };
    if (sends.current.has(pending.clientId)) return;
    sends.current.add(pending.clientId); atEnd.current = true; setNewCount(0); setError(null);
    setDrafts(current => [...current.filter(draft => draft.clientId !== pending.clientId), { ...pending, failed: false }]);
    if (!retry) { setText(''); setAttachment(null); input.current?.focus(); }
    try {
      const submit = () => !alive.current || operation !== generation.current ? Promise.reject(new ApiError('A conta ou conversa mudou.', 409)) : matchId ? api.privateSend(eventId, matchId, pending.text, pending.clientId, pending.imageId) : api.chatSend(eventId, pending.text, pending.clientId);
      // Reuse the idempotency key if the acknowledgement was lost in transit.
      const result = await submit().catch(cause => {
        if (cause instanceof ApiError && (cause.status === 0 || cause.status === 408 || cause.status >= 500)) return submit();
        throw cause;
      });
      if (!alive.current || operation !== generation.current) return;
      resource.setData(current => current ? { ...current, messages: [...current.messages.filter(message => message.clientId !== result.message.clientId), result.message] } : current);
      if (resource.data) setDrafts(current => current.filter(draft => draft.clientId !== pending.clientId));
      if (matchId) { sendTyping(matchId, false); syncChat(matchId); }
      void resource.reload();
    } catch (cause) {
      if (!alive.current || operation !== generation.current) return;
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar.');
      setDrafts(current => current.map(draft => draft.clientId === pending.clientId ? { ...draft, failed: true } : draft));
    } finally { sends.current.delete(pending.clientId); }
  }
  async function pick() {
    if (accessDenied) return; const operation = generation.current;
    setUploading(true); setError(null);
    try { const selected = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 }); if (!alive.current || operation !== generation.current) return; if (!selected.canceled && matchId) { const uploaded = await uploadChatImage(eventId, matchId, selected.assets[0]); if (!alive.current || operation !== generation.current) return; setAttachment(uploaded); composerClaimed.current = false; } }
    catch (cause) { if (!alive.current || operation !== generation.current) return; setError(cause instanceof Error ? cause.message : 'Não foi possível anexar a imagem.'); }
    finally { if (alive.current && operation === generation.current) setUploading(false); }
  }
  async function previous() {
    if (accessDenied) return; const operation = generation.current;
    setOlderBusy(true);
    try { const first = rows.find(row => row.message.id > 0)?.message; const history = matchId ? await api.privateHistory(eventId, matchId, first?.id) : await api.chatHistory(eventId, first?.id); if (!alive.current || operation !== generation.current) return; setOlder(current => [...history.messages, ...current]); setHasOlder(history.hasMore); }
    catch (cause) { if (!alive.current || operation !== generation.current) return; setError(cause instanceof Error ? cause.message : 'Não foi possível carregar mensagens anteriores.'); }
    finally { if (alive.current && operation === generation.current) setOlderBusy(false); }
  }
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => { const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent; atEnd.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 80; setReadingAtEnd(atEnd.current); if (atEnd.current && newCount) setNewCount(0); };
  const changeText = (value: string) => {
    composerClaimed.current = false; setText(value); if (!matchId) return;
    if (Date.now() - typingAt.current > 1500) { typingAt.current = Date.now(); sendTyping(matchId, Boolean(value.trim())); }
    if (typingStop.current) clearTimeout(typingStop.current);
    typingStop.current = setTimeout(() => sendTyping(matchId, false), 3000);
  };
  const typing = Math.max(typingUntil, resource.data?.partnerReceipt?.typingUntil ?? 0) > clock;
  if (!resource.data) return <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, padding: design.space.xl }}><State loading={resource.loading} error={resource.error} retry={resource.reload} />{onBack && <Button title="Voltar" secondary onPress={onBack} />}</SafeAreaView>;
  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: theme.background }}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingHorizontal: design.space.lg, paddingVertical: design.space.md, flexDirection: 'row', gap: design.space.md, alignItems: 'center', borderBottomWidth: 1, borderColor: theme.border, backgroundColor: theme.surface }}>
        {onBack && <Pressable accessibilityLabel="Voltar" accessibilityRole="button" onPress={onBack} style={({ pressed }) => ({ minWidth: design.size.touch, minHeight: design.size.touch, alignItems: 'center', justifyContent: 'center', borderRadius: design.radius.md, backgroundColor: theme.surfaceMuted, opacity: pressed ? design.opacity.pressed : 1 })}><Label size={26}>‹</Label></Pressable>}
        <Avatar name={resource.data?.event.name ?? 'Chat'} uri={mediaUrl(resource.data?.event.partnerImage)} />
        <View style={{ flex: 1, gap: design.space.xs }}><Label bold size={design.type.body}>{resource.data?.event.name ?? 'Conversa'}</Label><Label muted size={12}>{typing ? 'Digitando…' : online === true ? 'Online agora' : matchId ? 'Conversa privada' : 'Conversa em grupo'}</Label></View>
        {matchId && resource.data?.event.partnerId && <PartySafetyMenu eventId={eventId} userId={resource.data.event.partnerId} displayName={resource.data.event.name} label="Segurança" onBlocked={() => navigate({ name: 'connections', id: eventId })} />}
      </View>
      <FlatList ref={list} data={rows} keyExtractor={row => row.key} renderItem={({ item }) => <Bubble row={item} eventId={eventId} privateChat={Boolean(matchId)} onBlocked={() => navigate({ name: 'connections', id: eventId })} retry={draft => { void send(draft); }} />} keyboardShouldPersistTaps="handled" initialNumToRender={20} windowSize={7} onScroll={onScroll} scrollEventThrottle={100} contentContainerStyle={{ padding: design.space.lg, gap: design.space.xs }} maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        ListHeaderComponent={(hasOlder ?? resource.data?.hasMore) ? <Button title="Mensagens anteriores" secondary busy={olderBusy} onPress={() => { atEnd.current = false; void previous(); }} /> : null}
        ListEmptyComponent={resource.loading ? <State loading /> : resource.error ? <State error={resource.error} retry={() => { void resource.reload(); }} /> : <State empty="Comece a conversa." />}
        onContentSizeChange={() => { if (atEnd.current) list.current?.scrollToEnd({ animated: false }); }} />
      {newCount > 0 && <Button title={`Ir para o fim · ${newCount} novas`} secondary onPress={() => { atEnd.current = true; setNewCount(0); list.current?.scrollToEnd({ animated: false }); }} />}
      <View style={{ padding: design.space.md, gap: design.space.sm, backgroundColor: theme.surface, borderTopWidth: 1, borderColor: theme.border }}>
        {error && <Label muted size={12}>{error}</Label>}{resource.error && rows.length > 0 && <Label muted size={12}>{resource.error}</Label>}
        {attachment && <Card><Label size={12}>Imagem pronta para enviar</Label><Button title="Remover imagem" secondary onPress={() => setAttachment(null)} /></Card>}
        <View style={{ flexDirection: 'row', gap: design.space.sm, alignItems: 'flex-end' }}>
          {matchId && <Pressable accessibilityRole="button" accessibilityLabel="Anexar imagem" disabled={uploading} onPress={() => { void pick(); }} style={({ pressed }) => ({ minWidth: design.size.touch, minHeight: design.size.touch, alignItems: 'center', justifyContent: 'center', borderRadius: design.radius.md, backgroundColor: theme.surfaceMuted, opacity: uploading ? design.opacity.disabled : pressed ? design.opacity.pressed : 1 })}><Label size={24}>{uploading ? '…' : '＋'}</Label></Pressable>}
          <TextInput ref={input} accessibilityLabel="Mensagem" autoFocus multiline maxLength={1000} value={text} onChangeText={changeText} placeholder="Escreva sua mensagem…" placeholderTextColor={theme.muted} submitBehavior={Platform.OS === 'web' ? 'newline' : 'submit'} onSubmitEditing={() => { if (Platform.OS !== 'web') void send(); }}
            onKeyPress={event => { const native = event.nativeEvent as typeof event.nativeEvent & { shiftKey?: boolean }; if (Platform.OS === 'web' && native.key === 'Enter' && !native.shiftKey) { event.preventDefault(); void send(); } }}
            style={{ flex: 1, minHeight: design.size.touch, maxHeight: 120, color: theme.text, backgroundColor: theme.surfaceMuted, borderWidth: 1, borderColor: theme.border, borderRadius: design.radius.lg, padding: design.space.md, fontSize: design.type.body, fontFamily: design.font.regular }} />
          <Pressable accessibilityRole="button" accessibilityLabel="Enviar mensagem" disabled={!text.trim() && !attachment || uploading} onPress={() => { void send(); }} style={({ pressed }) => ({ backgroundColor: theme.soft, minWidth: design.size.touch, minHeight: design.size.touch, alignItems: 'center', justifyContent: 'center', borderRadius: design.radius.pill, padding: design.space.md, opacity: !text.trim() && !attachment || uploading ? design.opacity.disabled : pressed ? design.opacity.pressed : 1 })}><Label bold>➤</Label></Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

export function ChatScreen(props: NativeScreenProps) { const { user } = useSession(); return <ChatConversation key={`${props.route.id}:${props.route.matchId || ''}:${user?.id || 'guest'}`} {...props} />; }


