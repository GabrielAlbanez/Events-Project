"use client";

import { maximumUploadImageBytes } from "@/lib/uploadLimits";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Camera, Check, Heart, Loader2, Sparkles, UsersRound, X } from "lucide-react";
import type { PartyIntent, PartyOwnProfile } from "@/types/partyConnections";
import PartyAvatar from "./PartyAvatar";
import { partyButton, partyInput } from "./PartyActions";
import { showsMobileBottomNav } from "./MobileBottomNav";

export const partyIntents: Record<PartyIntent, { label: string; description: string }> = {
  FRIENDSHIP: { label: "Amizade", description: "Conhecer gente e ampliar sua turma" },
  COMPANY: { label: "Companhia", description: "Encontrar alguém para curtir o evento" },
  DATING: { label: "Paquera · 18+", description: "Conexões com interesse romântico" },
};
const intentIcons = { FRIENDSHIP: UsersRound, COMPANY: Sparkles, DATING: Heart } as const;
const nameMax = 60;
const bioMax = 300;
const interestMax = 6;
const interestLength = 30;
const photoTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const card = "rounded-[22px] border bg-card p-4 shadow-[var(--em-shadow-card)] sm:p-5";
const errorText = "mt-2 text-sm text-destructive";

type Draft = { displayName: string; photoUrl: string; bio: string; interests: string[]; intent: PartyIntent; adultDeclared: boolean };
type Field = "photo" | "name" | "interests" | "adult";
type FieldErrors = Partial<Record<Field, string>>;
const fieldIds: Record<Field, string> = { photo: "party-photo", name: "party-name", interests: "party-interest-input", adult: "party-adult" };
const splitInterests = (text: string) => text.split(",").map(value => value.trim()).filter(Boolean);
const unique = (items: string[]) => Array.from(new Set(items));
const sameDraft = (a: Draft, b: Draft) => a.displayName === b.displayName && a.photoUrl === b.photoUrl && a.bio === b.bio && a.intent === b.intent && a.adultDeclared === b.adultDeclared && a.interests.length === b.interests.length && a.interests.every((value, index) => value === b.interests[index]);

export default function PartyProfileForm({ profile, busy, eligible, act, global = false, needsReview = false }: { profile: (Omit<PartyOwnProfile, "active"> & { active?: boolean }) | null; global?: boolean; needsReview?: boolean; busy: boolean; eligible: boolean; act: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [baseline, setBaseline] = useState<Draft>(() => ({ displayName: profile?.displayName ?? "", photoUrl: profile?.photoUrl ?? "", bio: profile?.bio ?? "", interests: profile?.interests ?? [], intent: profile?.intent ?? "FRIENDSHIP", adultDeclared: profile?.adultDeclared ?? false }));
  const [displayName, setDisplayName] = useState(baseline.displayName);
  const [photoUrl, setPhotoUrl] = useState(baseline.photoUrl);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [bio, setBio] = useState(baseline.bio);
  const [interests, setInterests] = useState<string[]>(baseline.interests);
  const [interestDraft, setInterestDraft] = useState("");
  const [intent, setIntent] = useState<PartyIntent>(baseline.intent);
  const [adultDeclared, setAdultDeclared] = useState(baseline.adultDeclared);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [existing, setExisting] = useState(global ? !!profile : !!profile?.active);
  const [reviewPending, setReviewPending] = useState(needsReview);
  const locked = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { if (!photo) { setPreview(""); return; } const url = URL.createObjectURL(photo); setPreview(url); return () => URL.revokeObjectURL(url); }, [photo]);
  useEffect(() => () => controller.current?.abort(), []);

  const values = unique([...interests, ...splitInterests(interestDraft)]);
  const current: Draft = { displayName, photoUrl, bio, interests: values, intent, adultDeclared };
  const dirty = !!photo || !sameDraft(current, baseline);
  const disabled = busy || saving;
  const showBar = !existing || reviewPending || dirty || saving || !!formError;
  const avatarUrl = preview || photoUrl;
  const previewName = displayName.trim() || "Seu nome";

  const edited = (field?: Field) => {
    setSaved(false);
    setFormError("");
    if (field) setErrors(old => ({ ...old, [field]: undefined }));
  };
  const commitInterests = (parts: string[]) => {
    const next = [...interests];
    const rejected: string[] = [];
    let message = "";
    for (const part of parts) {
      if (next.includes(part)) continue;
      if (part.length > interestLength) { rejected.push(part); message = `Cada interesse pode ter até ${interestLength} caracteres.`; continue; }
      if (next.length >= interestMax) { rejected.push(part); message = `Use até ${interestMax} interesses.`; continue; }
      next.push(part);
    }
    setInterests(next);
    setErrors(old => ({ ...old, interests: message || undefined }));
    return rejected;
  };
  const changeInterestDraft = (value: string) => {
    edited();
    if (!value.includes(",")) { setInterestDraft(value); return; }
    const parts = value.split(",");
    const last = parts.pop() ?? "";
    const rejected = commitInterests(parts.map(part => part.trim()).filter(Boolean));
    setInterestDraft([...rejected, last.trimStart()].filter(Boolean).join(", "));
  };
  const interestKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      edited();
      setInterestDraft(commitInterests(splitInterests(interestDraft)).join(", "));
    } else if (event.key === "Backspace" && !interestDraft && interests.length) {
      edited("interests");
      setInterests(old => old.slice(0, -1));
    }
  };
  const removeInterest = (value: string) => { edited("interests"); setInterests(old => old.filter(item => item !== value)); };
  const validate = (): FieldErrors => {
    const found: FieldErrors = {};
    if (displayName.trim().length < 2) found.name = "Informe um nome com pelo menos 2 caracteres.";
    if (values.length > interestMax || values.some(value => value.length > interestLength)) found.interests = `Use até ${interestMax} interesses, com até ${interestLength} caracteres cada.`;
    if (intent === "DATING" && !adultDeclared) found.adult = "Para participar da paquera, declare que tem 18 anos ou mais.";
    return found;
  };
  const discard = () => {
    setDisplayName(baseline.displayName); setPhotoUrl(baseline.photoUrl); setPhoto(null); setBio(baseline.bio);
    setInterests(baseline.interests); setInterestDraft(""); setIntent(baseline.intent); setAdultDeclared(baseline.adultDeclared);
    setErrors({}); setFormError(""); setSaved(false);
  };
  const save = async () => {
    if (locked.current || busy || !eligible) return;
    const found = validate();
    const firstInvalid = (Object.keys(fieldIds) as Field[]).find(field => found[field]);
    if (firstInvalid) {
      setErrors(found); setFormError("Revise os campos destacados.");
      if (typeof document !== "undefined") document.getElementById(fieldIds[firstInvalid])?.focus();
      return;
    }
    locked.current = true; setSaving(true); setErrors({}); setFormError(""); setSaved(false);
    try {
      let finalPhoto = photoUrl;
      if (photo) {
        if (!session?.user?.id) throw new Error("Entre novamente para enviar sua foto.");
        controller.current = new AbortController();
        const timeout = setTimeout(() => controller.current?.abort(), 30000);
        try {
          const body = new FormData(); body.append("file", photo); body.append("userId", session.user.id);
          const response = await fetch("/api/upload?purpose=party", { method: "POST", body, signal: controller.current.signal });
          const result: unknown = await response.json();
          if (!response.ok || typeof result !== "object" || result === null || !("filePath" in result) || typeof result.filePath !== "string") throw new Error("Não foi possível enviar a foto. Tente novamente.");
          finalPhoto = result.filePath; setPhotoUrl(finalPhoto); setPhoto(null);
        } finally { clearTimeout(timeout); }
      }
      const name = displayName.trim();
      if (!await act({ action: "profile.save", displayName: name, photoUrl: finalPhoto, bio, interests: values, intent, adultDeclared })) {
        setFormError("Não foi possível confirmar o perfil. Seus dados foram preservados; tente novamente.");
      } else {
        setBaseline({ displayName: name, photoUrl: finalPhoto, bio, interests: values, intent, adultDeclared });
        setDisplayName(name); setInterests(values); setInterestDraft("");
        setExisting(true); setReviewPending(false); setSaved(true);
      }
    } catch { setFormError("Não foi possível enviar ou salvar. Confira sua conexão e tente novamente."); }
    finally { locked.current = false; setSaving(false); }
  };

  const barOffset = showsMobileBottomNav(pathname) ? "bottom-[calc(4.75rem_+_env(safe-area-inset-bottom))]" : "bottom-[calc(0.75rem_+_env(safe-area-inset-bottom))]";
  const barMessage = saving ? "Enviando e salvando…" : formError ? formError : !existing ? "Revise e crie seu perfil." : reviewPending && !dirty ? "Confirme os dados trazidos de um evento anterior." : "Alterações não salvas";
  const saveLabel = saving ? "Enviando e salvando…" : formError && !Object.values(errors).some(Boolean) ? "Tentar salvar novamente" : existing ? "Salvar perfil" : "Criar perfil";

  return <section className="space-y-4" aria-busy={disabled} aria-labelledby="party-profile-title">
    <header className="space-y-1">
      <h2 id="party-profile-title" className="text-xl font-semibold">{global ? (existing ? "Seu perfil de conexões" : "Crie seu perfil de conexões") : "Seu perfil nesta festa"}</h2>
      <p className="text-sm text-muted-foreground">{global ? "Separado do seu perfil público · salvar não entra em nenhum evento." : "Separado do seu perfil público · vale só para este evento."}</p>
      {reviewPending && <p role="status" className="mt-2 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">Trouxemos dados de um evento anterior. Revise e salve para confirmar seu perfil único; suas participações são preservadas.</p>}
    </header>

    <article aria-label="Prévia do seu perfil" className="rounded-[22px] border bg-card p-4 shadow-[var(--em-shadow-elevated)] sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">Como outras pessoas veem você</p>
        <p role="status" aria-live="polite" className="text-xs font-semibold">{saved && !dirty ? <span className="inline-flex items-center gap-1 rounded-full bg-cta px-2.5 py-1 text-cta-foreground"><Check size={14} aria-hidden="true" />Perfil salvo</span> : null}</p>
      </div>
      <div className="mt-4 flex items-center gap-4">
        <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-[18px] bg-primary/10 text-2xl font-bold text-brand"><PartyAvatar key={avatarUrl} url={avatarUrl} name={previewName} decorative /></span>
        <div className="min-w-0">
          <h3 className="break-words text-lg font-semibold">{previewName}</h3>
          <p className="mt-1 inline-flex rounded-full bg-muted px-3 py-1 text-xs font-medium">{partyIntents[intent].label}</p>
        </div>
      </div>
      {bio.trim() ? <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{bio}</p> : <p className="mt-4 text-sm italic text-muted-foreground">Sua bio aparece aqui.</p>}
      {values.length > 0 && <ul aria-label="Interesses na prévia" className="mt-3 flex flex-wrap gap-2">{values.map(value => <li key={value} className="rounded-full bg-muted px-3 py-1 text-xs">{value}</li>)}</ul>}
    </article>

    <fieldset disabled={disabled} className="min-w-0 space-y-4">
      <legend className="sr-only">Editar perfil de conexões</legend>

      <div className={card}>
        <h3 className="text-base font-semibold">Foto</h3>
        <div className="mt-3 flex items-center gap-4">
          <label htmlFor="party-photo" className="relative grid size-24 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-[18px] bg-primary/10 text-3xl font-bold text-brand focus-within:ring-2 focus-within:ring-ring">
            <PartyAvatar key={avatarUrl} url={avatarUrl} name={previewName} decorative />
            <span className="absolute inset-x-0 bottom-0 grid h-8 place-items-center bg-foreground/55 text-background"><Camera size={16} aria-hidden="true" /><span className="sr-only">Trocar foto</span></span>
          </label>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap gap-2">
              <label htmlFor="party-photo" className={`${partyButton} cursor-pointer border focus-within:ring-2 focus-within:ring-ring`}><Camera size={16} aria-hidden="true" />{avatarUrl ? "Trocar foto" : "Escolher foto"}</label>
              {(photo || photoUrl) && <button type="button" className={`${partyButton} text-muted-foreground`} onClick={() => { edited("photo"); setPhoto(null); setPhotoUrl(""); }}>Remover foto</button>}
            </div>
            <p id="party-photo-help" className="text-xs text-muted-foreground">Opcional · JPG, PNG, WebP ou AVIF · até 4 MB. Enviada ao salvar.</p>
          </div>
        </div>
        <input id="party-photo" type="file" accept="image/*" className="sr-only" aria-label="Escolher foto do perfil de conexões" aria-invalid={!!errors.photo} aria-describedby={errors.photo ? "party-photo-help party-photo-error" : "party-photo-help"} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; if (!photoTypes.includes(file.type)) { setErrors(old => ({ ...old, photo: "Escolha uma imagem JPG, PNG, WebP ou AVIF." })); return; } if (file.size > maximumUploadImageBytes || !file.size) { setErrors(old => ({ ...old, photo: "Escolha uma imagem de até 4 MB." })); return; } edited("photo"); setPhoto(file); }} />
        {errors.photo && <p id="party-photo-error" role="alert" className={errorText}>{errors.photo}</p>}
      </div>

      <div className={`${card} space-y-4`}>
        <h3 className="text-base font-semibold">Nome e bio</h3>
        <div>
          <div className="flex items-baseline justify-between gap-3"><label htmlFor="party-name" className="text-sm font-medium">Como quer ser chamado</label><span className="text-xs text-muted-foreground" aria-hidden="true">{displayName.length}/{nameMax}</span></div>
          <input id="party-name" className={`${partyInput} mt-2`} value={displayName} onChange={event => { edited("name"); setDisplayName(event.target.value); }} minLength={2} maxLength={nameMax} autoComplete="off" placeholder="Seu nome ou apelido" aria-invalid={!!errors.name} aria-describedby={errors.name ? "party-name-error" : undefined} />
          {errors.name && <p id="party-name-error" role="alert" className={errorText}>{errors.name}</p>}
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-3"><label htmlFor="party-bio" className="text-sm font-medium">Um pouco sobre você</label><span className="text-xs text-muted-foreground" aria-hidden="true">{bio.length}/{bioMax}</span></div>
          <textarea id="party-bio" className={`${partyInput} mt-2 min-h-24 resize-y`} value={bio} onChange={event => { edited(); setBio(event.target.value); }} maxLength={bioMax} rows={3} placeholder="O que você mais quer aproveitar na festa?" aria-describedby="party-bio-help" />
          <p id="party-bio-help" className="mt-2 text-xs text-muted-foreground">Não inclua contato ou localização exata.</p>
        </div>
      </div>

      <fieldset className={card}>
        <legend className="float-left w-full text-base font-semibold">O que você procura</legend>
        <div className="clear-both grid gap-3 pt-3 sm:grid-cols-3">{(Object.keys(partyIntents) as PartyIntent[]).map(value => { const Icon = intentIcons[value]; const selected = intent === value; return <label key={value} className={`relative flex min-h-11 cursor-pointer items-start gap-3 rounded-[18px] border p-4 focus-within:ring-2 focus-within:ring-ring sm:flex-col sm:gap-2 ${selected ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}><input type="radio" name="party-intent" value={value} checked={selected} onChange={() => { edited("adult"); setIntent(value); }} className="sr-only" /><Icon size={20} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{partyIntents[value].label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{partyIntents[value].description}</span></span><span aria-hidden="true" className={`absolute right-3 top-3 grid size-5 place-items-center rounded-full border ${selected ? "border-primary bg-primary text-primary-foreground" : ""}`}>{selected && <Check size={12} />}</span></label>; })}</div>
        {intent === "DATING" && <div className="mt-3 rounded-[18px] border border-primary/20 bg-primary/5 p-4">
          <label className="flex min-h-11 items-start gap-3 text-sm font-medium"><input id="party-adult" type="checkbox" checked={adultDeclared} onChange={event => { edited("adult"); setAdultDeclared(event.target.checked); }} className="mt-1 size-5 shrink-0 accent-primary" aria-invalid={!!errors.adult} aria-describedby={errors.adult ? "party-adult-help party-adult-error" : "party-adult-help"} />Declaro que tenho 18 anos ou mais.</label>
          <p id="party-adult-help" className="ml-8 text-xs leading-5 text-muted-foreground">Autodeclaração privada, não uma verificação de identidade ou idade.</p>
          {errors.adult && <p id="party-adult-error" role="alert" className={`${errorText} ml-8`}>{errors.adult}</p>}
        </div>}
      </fieldset>

      <div className={card}>
        <div className="flex items-baseline justify-between gap-3"><h3 className="text-base font-semibold"><label htmlFor="party-interest-input">Interesses</label></h3><span className="text-xs text-muted-foreground">{Math.min(values.length, interestMax)}/{interestMax}</span></div>
        {interests.length > 0 && <ul aria-label="Seus interesses" className="mt-3 flex flex-wrap gap-2">{interests.map(value => <li key={value} className="inline-flex min-h-11 items-center gap-1 rounded-full border bg-muted/50 pl-4 text-sm"><span className="break-all">{value}</span><button type="button" aria-label={`Remover interesse ${value}`} onClick={() => removeInterest(value)} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X size={16} aria-hidden="true" /></button></li>)}</ul>}
        <input id="party-interest-input" className={`${partyInput} mt-3`} value={interestDraft} onChange={event => changeInterestDraft(event.target.value)} onKeyDown={interestKey} maxLength={190} enterKeyHint="done" autoComplete="off" placeholder="Música, dança, gastronomia…" aria-invalid={!!errors.interests} aria-describedby={errors.interests ? "party-interest-help party-interest-error" : "party-interest-help"} />
        <p id="party-interest-help" className="mt-2 text-xs text-muted-foreground">Digite e tecle Enter ou vírgula · até {interestMax}, com {interestLength} caracteres cada.</p>
        {errors.interests && <p id="party-interest-error" role="alert" className={errorText}>{errors.interests}</p>}
      </div>
    </fieldset>

    {showBar && <div className={`sticky z-30 ${barOffset} flex flex-wrap items-center justify-between gap-3 rounded-[22px] border bg-card p-3 shadow-[var(--em-shadow-elevated)] motion-safe:duration-200 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 md:static md:p-4 md:shadow-[var(--em-shadow-card)]`}>
      <p role={formError ? "alert" : undefined} aria-live={formError ? undefined : "polite"} className={`min-w-0 flex-1 basis-40 text-sm ${formError ? "text-destructive" : "font-medium"}`}>{barMessage}</p>
      <div className="flex flex-wrap gap-2">
        {existing && dirty && <button type="button" disabled={disabled} className={`${partyButton} border`} onClick={discard}>Descartar</button>}
        <button type="button" disabled={disabled || !eligible} className={`${partyButton} bg-cta text-cta-foreground hover:bg-cta/90`} onClick={() => void save()}>{disabled ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}{saveLabel}</button>
      </div>
    </div>}
  </section>;
}
