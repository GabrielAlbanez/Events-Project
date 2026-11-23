"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import type { Evento } from "@/types";

/** Resolves to an error message, or null when the server confirmed the action. */
type DialogSubmit = () => Promise<string | null>;
const contentClass = "z-[120] max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-lg";
const failure = "Não foi possível concluir. Tente novamente.";

function useSubmit(open: boolean, submit: DialogSubmit, onDone: () => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  useEffect(() => { if (open) setError(""); }, [open]);
  async function run() {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError("");
    try {
      const message = await submit();
      if (message) setError(message);
      else onDone();
    } catch {
      setError(failure);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return { pending, error, run };
}

type CorrectionProps = { event: Evento | null; onClose: () => void; onSubmit: (event: Evento, reason: string) => Promise<string | null>; onCloseAutoFocus: (event: Event) => void };

export function CorrectionDialog({ event, onClose, onSubmit, onCloseAutoFocus }: CorrectionProps) {
  const [reason, setReason] = useState("");
  const eventId = event?.id;
  useEffect(() => { setReason(""); }, [eventId]);
  const trimmed = reason.trim();
  const { pending, error, run } = useSubmit(Boolean(event), () => event ? onSubmit(event, trimmed) : Promise.resolve(failure), onClose);
  return <Dialog open={Boolean(event)} onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent className={contentClass} onCloseAutoFocus={onCloseAutoFocus} onEscapeKeyDown={item => { if (pending) item.preventDefault(); }} onPointerDownOutside={item => { if (pending) item.preventDefault(); }}>
      <DialogTitle>Solicitar correção</DialogTitle>
      <DialogDescription>Explique ao promotor o que precisa mudar em “{event?.nome}”.</DialogDescription>
      <label htmlFor="admin-correction-reason" className="text-sm font-medium">Motivo</label>
      <textarea id="admin-correction-reason" value={reason} onChange={item => setReason(item.target.value)} rows={5} maxLength={1000} aria-describedby="admin-correction-hint" className="w-full rounded-xl border border-input bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Ex.: Atualize o endereço e inclua o horário de início." />
      <p id="admin-correction-hint" className="text-xs text-muted-foreground">Mínimo de 5 caracteres · {reason.length}/1000</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter className="gap-2"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Voltar</Button><Button type="button" disabled={pending || trimmed.length < 5} onClick={() => void run()}>{pending ? "Enviando..." : "Enviar pedido"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

type DeleteProps = { events: Evento[]; onClose: () => void; onConfirm: (events: Evento[]) => Promise<string | null>; onCloseAutoFocus: (event: Event) => void };

export function DeleteDialog({ events, onClose, onConfirm, onCloseAutoFocus }: DeleteProps) {
  const open = events.length > 0;
  const { pending, error, run } = useSubmit(open, () => onConfirm(events), onClose);
  const title = events.length === 1 ? `Excluir “${events[0].nome}”?` : `Excluir ${events.length} eventos?`;
  return <Dialog open={open} onOpenChange={value => { if (!value && !pending) onClose(); }}>
    <DialogContent className={contentClass} onCloseAutoFocus={onCloseAutoFocus} onEscapeKeyDown={item => { if (pending) item.preventDefault(); }} onPointerDownOutside={item => { if (pending) item.preventDefault(); }}>
      <DialogTitle className="break-words pr-6">{open ? title : "Excluir evento"}</DialogTitle>
      <DialogDescription>O evento e seus dados associados serão removidos, e os inscritos serão avisados. Esta ação não pode ser desfeita.</DialogDescription>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter className="gap-2"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Voltar</Button><Button type="button" variant="destructive" disabled={pending} onClick={() => void run()}>{pending ? "Excluindo..." : "Excluir definitivamente"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
