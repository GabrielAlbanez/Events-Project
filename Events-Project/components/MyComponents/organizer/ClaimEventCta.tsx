"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { BadgeCheck, CheckCircle2, Loader2 } from "lucide-react";
import { claimEventOwnership } from "@/app/(actions)/organizer/action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { authPathWithReturn } from "@/lib/authReturn";
import { organizerLimits } from "@/lib/organizer/schema";

export interface ClaimEventCtaProps { eventId: string; eventName: string }

/** "Sou o organizador": lets the real organizer of a platform-held (imported) event ask admins for ownership. */
export default function ClaimEventCta({ eventId, eventName }: ClaimEventCtaProps) {
  const id = useId();
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [sent, setSent] = useState("");
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const role = session?.user?.role;

  if (status === "loading" || role === "ADMIN") return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    if (contact.trim().length < 3) { setErrors({ contact: "Informe um contato (e-mail, telefone ou @)." }); setFormError("Revise os campos destacados."); return; }
    lock.current = true; setPending(true); setErrors({}); setFormError("");
    try {
      const result = await claimEventOwnership({ eventId, contact, message });
      if (result.success) { setOpen(false); setSent(result.message); return; }
      setErrors(result.fieldErrors ?? {});
      setFormError(result.message);
    } catch {
      setFormError("Não foi possível enviar agora. Confira sua conexão e tente novamente.");
    } finally {
      lock.current = false; setPending(false);
    }
  }

  const intro = <><p className="flex items-center gap-2 text-sm font-semibold"><BadgeCheck className="h-4 w-4 text-brand" aria-hidden="true" /> Você organiza este evento?</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Este evento foi cadastrado pela equipe do EventMap. Se ele é seu, peça para administrá-lo.</p></>;

  if (status !== "authenticated" || !session?.user?.id) {
    return <section aria-label="Reivindicar evento" className="rounded-[22px] border border-border bg-card p-4 sm:p-5 shadow-[var(--em-shadow-card)]">{intro}<Button asChild variant="outline" className="mt-3"><Link href={authPathWithReturn("/login", `/eventos/${eventId}`)}>Entrar para reivindicar</Link></Button></section>;
  }

  return <section aria-label="Reivindicar evento" className="rounded-[22px] border border-border bg-card p-4 sm:p-5 shadow-[var(--em-shadow-card)]">
    {intro}
    {sent ? <p role="status" className="mt-3 flex items-start gap-2 text-sm text-foreground"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />{sent}</p> :
      <Dialog open={open} onOpenChange={value => { if (!pending) { setOpen(value); setFormError(""); } }}>
        <DialogTrigger asChild><Button type="button" variant="outline" className="mt-3">Sou o organizador deste evento</Button></DialogTrigger>
        <DialogContent className="z-[120] max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl sm:max-w-lg" onEscapeKeyDown={event => { if (pending) event.preventDefault(); }} onPointerDownOutside={event => { if (pending) event.preventDefault(); }}>
          <DialogTitle>Sou o organizador</DialogTitle>
          <DialogDescription>Conte como podemos confirmar que você organiza &quot;{eventName}&quot;. A equipe verifica os dados antes de transferir o evento para sua conta.</DialogDescription>
          <form onSubmit={submit} noValidate className="space-y-4">
            <div><label htmlFor={`${id}-contact`} className="mb-2 block text-sm font-medium">Contato para confirmação</label><Input id={`${id}-contact`} value={contact} onChange={event => setContact(event.target.value)} maxLength={organizerLimits.contact} disabled={pending} aria-invalid={Boolean(errors.contact) || undefined} aria-describedby={errors.contact ? `${id}-contact-error` : undefined} placeholder="E-mail, telefone ou @ oficial do evento" required />{errors.contact && <p id={`${id}-contact-error`} className="mt-1.5 text-sm text-destructive">{errors.contact}</p>}</div>
            <div><label htmlFor={`${id}-message`} className="mb-2 block text-sm font-medium">Mensagem <span className="font-normal text-muted-foreground">(opcional)</span></label><Textarea id={`${id}-message`} value={message} onChange={event => setMessage(event.target.value)} maxLength={organizerLimits.claimMessage} rows={4} disabled={pending} aria-invalid={Boolean(errors.message) || undefined} aria-describedby={errors.message ? `${id}-message-error` : undefined} placeholder="Ex.: sou o produtor; o perfil oficial do evento pode confirmar." />{errors.message && <p id={`${id}-message-error`} className="mt-1.5 text-sm text-destructive">{errors.message}</p>}</div>
            {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" variant="cta" disabled={pending}>{pending ? <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Enviando...</> : "Enviar solicitação"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>}
  </section>;
}
