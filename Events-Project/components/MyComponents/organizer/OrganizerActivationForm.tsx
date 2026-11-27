"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, Rocket } from "lucide-react";
import { activateOrganizerAccess } from "@/app/(actions)/organizer/action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { organizerLimits } from "@/lib/organizer/schema";

type Values = { brandName: string; city: string; acceptTerms: boolean };
type FieldKey = keyof Values;
const fieldOrder: FieldKey[] = ["brandName", "city", "acceptTerms"];

/** Self-service activation for verified BASIC accounts: the role changes on submit and every event still goes through review. */
export function OrganizerActivationForm() {
  const id = useId();
  const router = useRouter();
  const { update } = useSession();
  const [values, setValues] = useState<Values>({ brandName: "", city: "", acceptTerms: false });
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);
  const lock = useRef(false);

  function focusFirst(found: Partial<Record<FieldKey, string>>) {
    const first = fieldOrder.find(key => found[key]);
    if (first) document.getElementById(`${id}-${first}`)?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const local: Partial<Record<FieldKey, string>> = {};
    if (values.brandName.trim().length < 2) local.brandName = "Informe o nome da produtora ou marca.";
    if (values.city.trim().length < 2) local.city = "Informe a cidade.";
    if (!values.acceptTerms) local.acceptTerms = "Aceite as regras para organizadores para continuar.";
    setErrors(local);
    setFormError("");
    if (Object.keys(local).length) { focusFirst(local); return; }
    lock.current = true; setPending(true);
    try {
      const result = await activateOrganizerAccess({ acceptTerms: true, brandName: values.brandName, city: values.city });
      if (result.success) {
        setSuccess(result.message);
        try { await update(); } catch { /* the next page load re-reads the role from the database */ }
        router.push("/CriarEvento?boasvindas=1");
        router.refresh();
        return;
      }
      const fieldErrors: Partial<Record<FieldKey, string>> = {};
      for (const key of fieldOrder) if (result.fieldErrors?.[key]) fieldErrors[key] = result.fieldErrors[key];
      setErrors(fieldErrors);
      setFormError(result.message);
      focusFirst(fieldErrors);
    } catch {
      setFormError("Não foi possível ativar agora. Confira sua conexão e tente novamente.");
    } finally {
      lock.current = false; setPending(false);
    }
  }

  const busy = pending || Boolean(success);
  const field = (key: FieldKey) => ({ id: `${id}-${key}`, "aria-invalid": Boolean(errors[key]) || undefined, "aria-describedby": errors[key] ? `${id}-${key}-error` : undefined, disabled: busy });
  const error = (key: FieldKey) => errors[key] ? <p id={`${id}-${key}-error`} className="mt-1.5 text-sm text-destructive">{errors[key]}</p> : null;

  return <form onSubmit={submit} noValidate className="space-y-4" aria-busy={pending || undefined}>
    <div className="grid gap-4 sm:grid-cols-2">
      <div><label htmlFor={`${id}-brandName`} className="mb-2 block text-sm font-medium">Produtora ou marca</label><Input {...field("brandName")} value={values.brandName} onChange={event => setValues(current => ({ ...current, brandName: event.target.value }))} maxLength={organizerLimits.brandName} autoComplete="organization" placeholder="Ex.: Coletivo Noite Viva" required />{error("brandName")}</div>
      <div><label htmlFor={`${id}-city`} className="mb-2 block text-sm font-medium">Cidade</label><Input {...field("city")} value={values.city} onChange={event => setValues(current => ({ ...current, city: event.target.value }))} maxLength={organizerLimits.city} autoComplete="address-level2" placeholder="Ex.: São Paulo" required />{error("city")}</div>
    </div>
    <div>
      <div className="flex min-h-11 items-start gap-3">
        <input {...field("acceptTerms")} type="checkbox" checked={values.acceptTerms} onChange={event => setValues(current => ({ ...current, acceptTerms: event.target.checked }))} className="mt-1 size-5 shrink-0 cursor-pointer rounded accent-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background" required />
        <label htmlFor={`${id}-acceptTerms`} className="cursor-pointer text-sm leading-6">Li e aceito as <Link href="/termos" className="rounded-sm font-medium text-brand underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">regras para organizadores</Link></label>
      </div>
      {error("acceptTerms")}
    </div>
    <p className="text-xs leading-5 text-muted-foreground">O acesso é liberado na hora. Cada evento que você criar passa por uma triagem automática antes de aparecer no mapa; o primeiro é conferido pela equipe.</p>
    <div aria-live="polite">
      {formError && <p role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{formError}</p>}
      {success && <p role="status" className="rounded-2xl border border-brand/30 bg-brand/5 px-4 py-3 text-sm">{success} Abrindo a criação de eventos...</p>}
    </div>
    <Button type="submit" variant="cta" disabled={busy} className="min-h-11 w-full sm:w-auto">{busy ? <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Ativando...</> : <><Rocket className="h-4 w-4" aria-hidden="true" /> Ativar acesso de organizador</>}</Button>
  </form>;
}
