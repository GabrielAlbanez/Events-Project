"use client";

import { useState, type FormEvent } from "react";
import { Flag, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const partyButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
export const partyInput = "block min-h-11 w-full rounded-xl border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
type Action = (payload: Record<string, unknown>) => Promise<boolean>;
function PartySelect({ value, change, label, options }: { value: string; change: (value: string) => void; label: string; options: { value: string; label: string }[] }) {
  return <Select value={value} onValueChange={change}><SelectTrigger aria-label={label} className="mt-2 min-h-11 rounded-xl bg-background"><SelectValue /></SelectTrigger><SelectContent className="z-[90] max-h-[min(320px,var(--radix-select-content-available-height))] max-w-[calc(100vw_-_2rem)] rounded-xl">{options.map(option => <SelectItem key={option.value} value={option.value} className="min-h-10 rounded-lg">{option.label}</SelectItem>)}</SelectContent></Select>;
}

export function PartyConfirm({ title, description, label, busy, onConfirm, destructive = false }: { title: string; description: string; label: string; busy: boolean; onConfirm: () => Promise<boolean>; destructive?: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const confirm = async () => { setError(""); if (await onConfirm()) setOpen(false); else setError("Não foi possível confirmar. Confira sua conexão e tente novamente."); };
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><button type="button" disabled={busy} className={`${partyButton} border ${destructive ? "text-destructive" : ""}`}>{label}</button></DialogTrigger><DialogContent className="max-w-[calc(100%_-_2rem)] rounded-2xl sm:max-w-md"><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex flex-wrap justify-end gap-3"><button type="button" disabled={busy} className={`${partyButton} border`} onClick={() => setOpen(false)}>Cancelar</button><button type="button" disabled={busy} className={`${partyButton} ${destructive ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"}`} onClick={() => void confirm()}>{busy && <Loader2 size={15} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}Confirmar</button></div></DialogContent></Dialog>;
}

export function PartySafetyActions({ userId, displayName, busy, act, messageIds = [] }: { userId: string; displayName: string; busy: boolean; act: Action; messageIds?: number[] }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("HARASSMENT");
  const [messageId, setMessageId] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setError(""); if (await act({ action: "report", userId, reason, ...(messageId ? { messageId: Number(messageId) } : {}) })) { setOpen(false); setMessageId(""); } else setError("Não foi possível confirmar a denúncia. Confira sua conexão e tente novamente."); };
  return <div className="flex flex-wrap gap-2"><PartyConfirm title={`Bloquear ${displayName}?`} description="Vocês deixam de aparecer um para o outro. Curtidas e mensagens ficam bloqueadas. Você pode remover o bloqueio nas preferências." label="Bloquear" destructive busy={busy} onConfirm={() => act({ action: "block", userId })} /><Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><button type="button" disabled={busy} className={`${partyButton} text-muted-foreground`}><Flag size={14} aria-hidden="true" />Denunciar</button></DialogTrigger><DialogContent className="max-w-[calc(100%_-_2rem)] rounded-2xl sm:max-w-md"><DialogTitle>Denunciar um comportamento</DialogTitle><DialogDescription>A equipe autorizada recebe o motivo e, se escolhida, apenas uma mensagem como evidência. Sua conversa completa permanece privada.</DialogDescription><form onSubmit={submit} className="space-y-4"><label className="block text-sm font-medium">Motivo<PartySelect value={reason} change={setReason} label="Motivo da denúncia" options={[{value:"HARASSMENT",label:"Assédio ou comportamento inadequado"},{value:"SPAM",label:"Spam"},{value:"SAFETY",label:"Risco à segurança"},{value:"OTHER",label:"Outro motivo"}]} /></label>{messageIds.length > 0 && <label className="block text-sm font-medium">Mensagem como evidência (opcional)<PartySelect value={messageId || "none"} change={value => setMessageId(value === "none" ? "" : value)} label="Mensagem como evidência" options={[{value:"none",label:"Não anexar mensagem"},...messageIds.map(id => ({value:String(id),label:`Mensagem #${id}`}))]} /><span className="mt-2 block text-xs text-muted-foreground">O número da mensagem aparece no histórico da conversa.</span></label>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<button type="submit" disabled={busy} className={`${partyButton} bg-primary text-primary-foreground`}>Enviar denúncia</button></form></DialogContent></Dialog></div>;
}
