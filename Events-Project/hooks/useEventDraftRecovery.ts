"use client";
import { useEffect, useRef, useState } from "react";
import { eventDraftSchema, parseStoredEventDraft, type DraftEnvelope, type EventDraft } from "@/lib/eventDraftStorage";
export function useEventDraftRecovery(accountId: string | undefined, eventId: string | undefined, fingerprint: string, base: string, dirty: boolean) {
  const key = accountId ? `eventmap:event-draft:v1:${accountId}:${eventId || "new"}` : null;
  const owner = useRef<string | null>(null);
  if (accountId && owner.current === null) owner.current = accountId;
  const sameOwner = !accountId || owner.current === accountId;
  const identity = useRef(key); identity.current = key;
  // A changed identity must never persist fields left over from another account.
  const baseline = useRef({ key, fingerprint });
  if (baseline.current.key !== key) baseline.current = { key, fingerprint };
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<DraftEnvelope | null>(null);
  const [message, setMessage] = useState("");
  const saved = useRef(false);
  const last = useRef(fingerprint); last.current = fingerprint;
  useEffect(() => {
    setRecovery(null); setMessage(""); saved.current = false;
    if (!key || !sameOwner) { setLoadedKey(null); return; }
    try { const raw = localStorage.getItem(key); const draft = parseStoredEventDraft(raw); if (raw && !draft) localStorage.removeItem(key); setRecovery(draft); } catch { setMessage("O navegador não permite salvar rascunhos locais. Seu formulário continua disponível."); }
    setLoadedKey(key);
  }, [key, sameOwner]);
  useEffect(() => {
    if (!key || !sameOwner || loadedKey !== key || recovery || !dirty || fingerprint === baseline.current.fingerprint || saved.current) return;
    const write = () => {
      if (identity.current !== key || saved.current) return;
      try { const draft = eventDraftSchema.parse(JSON.parse(last.current)); localStorage.setItem(key, JSON.stringify({ version: 1, savedAt: Date.now(), base, draft })); setMessage("Salvo neste navegador"); } catch { setMessage("Não foi possível salvar o rascunho neste navegador. Salve manualmente para preservar as alterações."); }
    };
    const timer = window.setTimeout(write, 800);
    const flush = () => { if (document.visibilityState === "hidden") write(); };
    document.addEventListener("visibilitychange", flush); window.addEventListener("pagehide", write);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", flush); window.removeEventListener("pagehide", write); };
  }, [key, sameOwner, loadedKey, recovery, dirty, fingerprint, base]);
  const discard = () => { if (key && sameOwner) { try { localStorage.removeItem(key); setMessage(""); } catch { setMessage("Não foi possível remover o rascunho local."); } } setRecovery(null); };
  const clearSaved = () => { saved.current = true; discard(); };
  const recover = (): EventDraft | null => { if (!key || !sameOwner || loadedKey !== key || !recovery) return null; const draft = recovery.draft; setRecovery(null); return draft; };
  return { recovery: sameOwner && loadedKey === key ? recovery : null, message: !sameOwner ? "A conta mudou. Reabra esta página para ativar o salvamento local com a nova conta." : loadedKey === key ? message : "", conflict: recovery?.base !== base, recover, discard, clearSaved };
}
