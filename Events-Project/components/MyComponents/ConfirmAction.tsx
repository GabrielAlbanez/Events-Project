"use client";

import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function ConfirmAction({ title, description, label, busy = false, onConfirm }: { title: string; description: string; label: string; busy?: boolean; onConfirm: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function confirm() {
    if (lock.current || busy) return;
    lock.current = true; setPending(true); setError("");
    try { const result = await onConfirm(); if (result === false) { setError("Não foi possível concluir. Confira o aviso da página e tente novamente."); } else setOpen(false); }
    catch { setError("Não foi possível concluir. Tente novamente."); }
    finally { lock.current = false; setPending(false); }
  }
  return <Dialog open={open} onOpenChange={value => { if (!pending) { setOpen(value); setError(""); } }}><DialogTrigger asChild><Button type="button" variant="outline" disabled={busy}>{label}</Button></DialogTrigger><DialogContent className="z-[120] max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-lg" onEscapeKeyDown={event => { if (pending) event.preventDefault(); }} onPointerDownOutside={event => { if (pending) event.preventDefault(); }}><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter className="gap-2"><Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Voltar</Button><Button type="button" disabled={pending || busy} onClick={() => void confirm()}>{pending ? "Aguarde..." : label}</Button></DialogFooter></DialogContent></Dialog>;
}
