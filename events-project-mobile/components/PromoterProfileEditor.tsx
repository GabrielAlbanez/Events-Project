import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { request } from '../services/api';
import { Button, Card, Input, Label, State } from './ui';
import { useTheme } from '../theme';
interface PublicProfile { bio: string | null; contactUrl: string | null }
interface SaveResult { success: boolean; message: string }
export function PromoterProfileEditor() {
  const theme = useTheme();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [bio, setBio] = useState('');
  const [contactUrl, setContactUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setLoading(true); setError(null);
    try {
      const result = await request<PublicProfile>('/promoter/profile', { signal: current.signal });
      if (current.signal.aborted) return;
      setProfile(result); setBio(result.bio ?? ''); setContactUrl(result.contactUrl ?? '');
    } catch (cause) { if (!current.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o perfil público.'); }
    finally { if (!current.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => { let active = true; void Promise.resolve().then(() => { if (active) return load(); }); return () => { active = false; controller.current?.abort(); }; }, [load]);
  async function save() {
    if (saving) return;
    setError(null); setNotice(null);
    const contact = contactUrl.trim();
    if (contact) {
      try { const url = new URL(contact); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); }
      catch { setError('Use um link completo começando com https:// ou http://.'); return; }
    }
    setSaving(true);
    try {
      const result = await request<SaveResult>('/promoter/profile', { method: 'PUT', body: { bio: bio.trim(), contactUrl: contact } });
      if (!result.success) throw new Error(result.message);
      setProfile({ bio: bio.trim(), contactUrl: contact }); setNotice('Perfil público atualizado.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o perfil público.'); }
    finally { setSaving(false); }
  }
  return <Card><Label bold size={20}>Seu perfil de organizador</Label><Label muted>Apresente seus eventos e compartilhe um canal público de contato.</Label>{loading ? <State loading /> : !profile ? <State error={error || 'Perfil indisponível.'} retry={() => { void load(); }} /> : <><Input label="Sobre você" value={bio} onChangeText={setBio} multiline maxLength={1000} editable={!saving} placeholder="Conte sua experiência e os eventos que organiza." /><Label muted size={12}>{bio.length}/1000 caracteres</Label><Input label="Link de contato público" value={contactUrl} onChangeText={setContactUrl} maxLength={300} editable={!saving} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://seusite.com/contato" />{error && <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text>}{notice && <Text accessibilityLiveRegion="polite" style={{ color: theme.text }}>{notice}</Text>}<Button title="Salvar perfil público" busy={saving} disabled={bio.trim() === (profile.bio ?? '') && contactUrl.trim() === (profile.contactUrl ?? '')} onPress={() => { void save(); }} /></>}</Card>;
}