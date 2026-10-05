"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { AnimatePresence, LazyMotion, m, useReducedMotion } from "framer-motion";
import { Camera, Check, Heart, Loader2, Sparkles, UsersRound } from "lucide-react";
import type { PartyIntent, PartyOwnProfile } from "@/types/partyConnections";
import { loadAnimationFeatures } from "@/components/animations/config";
import PartyAvatar from "./PartyAvatar";
import { partyButton, partyInput } from "./PartyActions";

export const partyIntents: Record<PartyIntent, { label: string; description: string }> = {
  FRIENDSHIP: { label: "Amizade", description: "Conhecer gente e ampliar sua turma" },
  COMPANY: { label: "Companhia", description: "Encontrar alguém para curtir o evento" },
  DATING: { label: "Paquera · 18+", description: "Conexões com interesse romântico" },
};
const steps = ["Foto", "Dados básicos", "Interesses", "Revisão"];
const maxPhotoBytes = 5 * 1024 * 1024;
export default function PartyProfileForm({ profile, busy, eligible, act }: { profile: PartyOwnProfile | null; busy: boolean; eligible: boolean; act: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const { data: session } = useSession();
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [photoUrl, setPhotoUrl] = useState(profile?.photoUrl ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [interests, setInterests] = useState(profile?.interests.join(", ") ?? "");
  const [intent, setIntent] = useState<PartyIntent>(profile?.intent ?? "FRIENDSHIP");
  const [adultDeclared, setAdultDeclared] = useState(profile?.adultDeclared ?? false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const locked = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { if (!photo) { setPreview(""); return; } const url = URL.createObjectURL(photo); setPreview(url); return () => URL.revokeObjectURL(url); }, [photo]);
  useEffect(() => () => controller.current?.abort(), []);
  const values = Array.from(new Set(interests.split(",").map(value => value.trim()).filter(Boolean)));
  const validate = (current: number) => {
    if (current === 1 && displayName.trim().length < 2) return "Informe um nome com pelo menos 2 caracteres.";
    if (current === 2 && (values.length > 6 || values.some(value => value.length > 30))) return "Use até 6 interesses, com até 30 caracteres cada.";
    if (current === 2 && intent === "DATING" && !adultDeclared) return "Para participar da paquera, declare que tem 18 anos ou mais.";
    return "";
  };
  const advance = () => { const message = validate(step); setError(message); if (!message) setStep(value => Math.min(3, value + 1)); };
  const save = async () => {
    if (locked.current || busy || !eligible || step !== 3) return;
    const message = validate(1) || validate(2); if (message) { setError(message); return; }
    locked.current = true; setSaving(true); setError("");
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
      if (!await act({ action: "profile.save", displayName: displayName.trim(), photoUrl: finalPhoto, bio, interests: values, intent, adultDeclared })) setError("Não foi possível confirmar o perfil. Seus dados foram preservados; tente novamente.");
      else setError("");
    } catch { setError("Não foi possível enviar ou salvar. Confira sua conexão e tente novamente."); }
    finally { locked.current = false; setSaving(false); }
  };
  const disabled = busy || saving;
  return <LazyMotion features={loadAnimationFeatures} strict><section className="space-y-6 rounded-3xl border bg-card p-5 sm:p-7" aria-busy={disabled}><div><h2 className="text-xl font-semibold">Seu perfil nesta festa</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Você decide o que compartilhar. Este perfil é separado do seu perfil público e vale apenas para este evento.</p></div><ol aria-label="Etapas do perfil" className="grid grid-cols-4 gap-2">{steps.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className="space-y-2"><span className={`flex h-1 rounded-full ${index <= step ? "bg-primary" : "bg-muted"}`} /><span className={`block text-xs ${index === step ? "font-semibold text-primary" : "text-muted-foreground"}`}>{index + 1}. {label}</span></li>)}</ol><fieldset disabled={disabled} className="min-w-0"><AnimatePresence mode="wait" initial={false}><m.div key={step} initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : -12 }} transition={{ duration: reduced ? 0 : .2 }} className="space-y-5">
  {step === 0 && <div className="space-y-4"><div className="mx-auto grid size-32 place-items-center overflow-hidden rounded-3xl bg-primary/10 text-4xl text-primary"><PartyAvatar key={preview || photoUrl} url={preview || photoUrl} name={displayName || "Você"} /></div><label htmlFor="party-photo" className="block text-sm font-medium">Sua foto (opcional)</label><input id="party-photo" type="file" accept="image/*" className={`${partyInput} file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-primary`} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) { setError("Escolha uma imagem JPG, PNG, WebP ou AVIF."); return; } if (file.size > maxPhotoBytes || !file.size) { setError("Escolha uma imagem de até 5 MB."); return; } setError(""); setPhoto(file); }} aria-describedby="party-photo-help" /><p id="party-photo-help" className="text-xs text-muted-foreground">Escolha da galeria ou câmera. JPG, PNG, WebP ou AVIF · até 5 MB. A foto será enviada ao salvar seu perfil.</p>{(photo || photoUrl) && <button type="button" className={`${partyButton} border`} onClick={() => { setPhoto(null); setPhotoUrl(""); setError(""); }}>Remover foto</button>}<p className="flex items-center gap-2 text-xs text-muted-foreground"><Camera size={16} aria-hidden="true" />Você pode continuar sem foto.</p></div>}
  {step === 1 && <><label className="block text-sm font-medium">Como quer ser chamado<input className={`${partyInput} mt-2`} value={displayName} onChange={event => setDisplayName(event.target.value)} minLength={2} maxLength={60} autoComplete="off" placeholder="Seu nome ou apelido" aria-invalid={!!error} /></label><label className="block text-sm font-medium">Um pouco sobre você<textarea className={`${partyInput} mt-2 min-h-24 resize-y`} value={bio} onChange={event => setBio(event.target.value)} maxLength={300} rows={3} placeholder="O que você mais quer aproveitar na festa?" /><span className="mt-2 block text-xs text-muted-foreground">{bio.length}/300 · Não inclua contato ou localização exata.</span></label></>}
  {step === 2 && <><label className="block text-sm font-medium">Seus interesses<input className={`${partyInput} mt-2`} value={interests} onChange={event => setInterests(event.target.value)} maxLength={190} placeholder="Música, dança, gastronomia…" /><span className="mt-2 block text-xs text-muted-foreground">Até 6 interesses, separados por vírgula.</span></label><fieldset><legend className="text-sm font-semibold">O que você procura?</legend><div className="mt-3 grid gap-3 sm:grid-cols-3">{(Object.keys(partyIntents) as PartyIntent[]).map(value => { const Icon = value === "FRIENDSHIP" ? UsersRound : value === "COMPANY" ? Sparkles : Heart; return <label key={value} className={`relative flex cursor-pointer flex-col gap-2 rounded-2xl border p-4 focus-within:ring-2 focus-within:ring-ring ${intent === value ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}><input type="radio" name="party-intent" checked={intent === value} onChange={() => setIntent(value)} className="absolute right-4 top-4 accent-primary" /><Icon size={20} className="text-primary" aria-hidden="true" /><span className="text-sm font-semibold">{partyIntents[value].label}</span><span className="text-xs leading-5 text-muted-foreground">{partyIntents[value].description}</span></label>; })}</div></fieldset>{intent === "DATING" && <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4"><label className="flex items-start gap-3 text-sm font-medium"><input type="checkbox" checked={adultDeclared} onChange={event => setAdultDeclared(event.target.checked)} className="mt-1 size-4 shrink-0 accent-primary" />Declaro que tenho 18 anos ou mais.</label><p className="ml-7 mt-2 text-xs leading-5 text-muted-foreground">A declaração fica privada. Ela é uma autodeclaração, não uma verificação de identidade ou de idade.</p></div>}</>}
  {step === 3 && <div className="space-y-4 rounded-2xl border bg-muted/20 p-5"><div className="flex items-center gap-4"><span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-primary/10 text-xl font-bold text-primary"><PartyAvatar key={preview || photoUrl} url={preview || photoUrl} name={displayName} /></span><div><h3 className="break-words font-semibold">{displayName}</h3><p className="text-sm text-muted-foreground">{partyIntents[intent].label}</p></div></div>{bio && <p className="whitespace-pre-wrap break-words text-sm">{bio}</p>}<div className="flex flex-wrap gap-2">{values.map(value => <span key={value} className="rounded-full bg-muted px-3 py-1 text-xs">{value}</span>)}</div><p className="text-xs leading-5 text-muted-foreground">Ao clicar em {profile?.active ? "Salvar perfil" : "Criar perfil"}, você aparece para outros participantes que também optaram por entrar. Você pode sair a qualquer momento.</p></div>}
  </m.div></AnimatePresence></fieldset>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex items-center justify-between gap-3 border-t pt-5"><button type="button" disabled={disabled || step === 0} className={`${partyButton} border`} onClick={() => { setError(""); setStep(value => Math.max(0, value - 1)); }}>Voltar</button>{step < 3 ? <m.button type="button" disabled={disabled} whileTap={{ scale: reduced ? 1 : .98 }} className={`${partyButton} bg-primary text-primary-foreground`} onClick={advance}>Continuar</m.button> : <m.button type="button" disabled={disabled || !eligible} whileTap={{ scale: reduced ? 1 : .98 }} className={`${partyButton} bg-primary text-primary-foreground`} onClick={() => void save()}>{disabled ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}{saving ? "Enviando e salvando…" : error ? "Tentar salvar novamente" : profile?.active ? "Salvar perfil" : "Criar perfil"}</m.button>}</div></section></LazyMotion>;
}
