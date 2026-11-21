"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { toast } from "react-toastify";
import { requestOrganizerAccess } from "@/app/(actions)/organizer/action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { organizerLimits, type OrganizerInterest } from "@/lib/organizer/schema";
import { eventCategories } from "@/types/features";

const selectClass = "flex h-11 w-full rounded-xl border border-input bg-background px-3 text-base transition-colors motion-reduce:transition-none hover:border-ring/40 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 md:text-sm";
type Values = { brandName: string; city: string; eventType: string; link: string; message: string };
const empty: Values = { brandName: "", city: "", eventType: "", link: "", message: "" };
const showFormError = (message: string) => toast.error(message, { toastId: `organizer-request:${message}` });

export function OrganizerRequestForm({ interest = "access", submitLabel }: { interest?: OrganizerInterest; submitLabel?: string }) {
  const id = useId();
  const [values, setValues] = useState<Values>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState("");
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const set = (key: keyof Values) => (value: string) => setValues(current => ({ ...current, [key]: value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const local: Record<string, string> = {};
    if (values.brandName.trim().length < 2) local.brandName = "Informe o nome da produtora ou marca.";
    if (values.city.trim().length < 2) local.city = "Informe a cidade.";
    if (!values.eventType) local.eventType = "Escolha o tipo de evento.";
    setErrors(local);
    const firstInvalid = Object.keys(local)[0];
    if (firstInvalid) { showFormError("Revise os campos destacados."); document.getElementById(`${id}-${firstInvalid}`)?.focus(); return; }
    lock.current = true; setPending(true);
    try {
      const result = await requestOrganizerAccess({ ...values, eventType: values.eventType as (typeof eventCategories)[number], interest });
      if (result.success) { setSent(result.message); setValues(empty); return; }
      setErrors(result.fieldErrors ?? {});
      showFormError(result.message);
    } catch {
      showFormError("Não foi possível enviar agora. Confira sua conexão e tente novamente.");
    } finally {
      lock.current = false; setPending(false);
    }
  }

  if (sent) {
    return <div role="status" className="flex items-start gap-3 rounded-2xl border border-brand/30 bg-brand/5 p-5"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" /><div><p className="font-semibold">{interest === "plans" ? "Interesse registrado" : "Pedido enviado"}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{sent}</p></div></div>;
  }

  const field = (key: keyof Values) => ({ id: `${id}-${key}`, "aria-invalid": Boolean(errors[key]) || undefined, "aria-describedby": errors[key] ? `${id}-${key}-error` : undefined, disabled: pending });
  const error = (key: keyof Values) => errors[key] ? <p id={`${id}-${key}-error`} className="mt-1.5 text-sm text-destructive">{errors[key]}</p> : null;

  return <form onSubmit={submit} noValidate className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <div><label htmlFor={`${id}-brandName`} className="mb-2 block text-sm font-medium">Produtora ou marca</label><Input {...field("brandName")} value={values.brandName} onChange={event => set("brandName")(event.target.value)} maxLength={organizerLimits.brandName} autoComplete="organization" placeholder="Ex.: Coletivo Noite Viva" required />{error("brandName")}</div>
      <div><label htmlFor={`${id}-city`} className="mb-2 block text-sm font-medium">Cidade</label><Input {...field("city")} value={values.city} onChange={event => set("city")(event.target.value)} maxLength={organizerLimits.city} autoComplete="address-level2" placeholder="Ex.: São Paulo" required />{error("city")}</div>
      <div><label htmlFor={`${id}-eventType`} className="mb-2 block text-sm font-medium">Tipo de evento</label><select {...field("eventType")} value={values.eventType} onChange={event => set("eventType")(event.target.value)} className={selectClass} required><option value="">Selecione</option>{eventCategories.map(option => <option key={option} value={option}>{option}</option>)}</select>{error("eventType")}</div>
      <div><label htmlFor={`${id}-link`} className="mb-2 block text-sm font-medium">Instagram ou site <span className="font-normal text-muted-foreground">(opcional)</span></label><Input {...field("link")} value={values.link} onChange={event => set("link")(event.target.value)} maxLength={organizerLimits.link} inputMode="url" autoCapitalize="none" spellCheck={false} placeholder="@suaprodutora ou https://..." />{error("link")}</div>
    </div>
    <div><label htmlFor={`${id}-message`} className="mb-2 block text-sm font-medium">Mensagem <span className="font-normal text-muted-foreground">(opcional)</span></label><Textarea {...field("message")} value={values.message} onChange={event => set("message")(event.target.value)} maxLength={organizerLimits.message} rows={4} placeholder={interest === "plans" ? "Conte quantos eventos você faz por mês e o que precisa em um plano." : "Conte que eventos você organiza e com que frequência."} /><p className="mt-1 text-xs text-muted-foreground">{values.message.length}/{organizerLimits.message} caracteres</p>{error("message")}</div>
    <p className="text-xs leading-5 text-muted-foreground">Os administradores do EventMap recebem estes dados com o nome e o e-mail da sua conta para analisar o pedido.</p>
    <Button type="submit" variant="cta" disabled={pending} className="w-full sm:w-auto">{pending ? <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Enviando...</> : <><Send className="h-4 w-4" aria-hidden="true" /> {submitLabel ?? (interest === "plans" ? "Entrar na lista" : "Enviar pedido")}</>}</Button>
  </form>;
}
