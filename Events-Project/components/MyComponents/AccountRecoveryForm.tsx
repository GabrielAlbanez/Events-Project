"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { KeyRound, MailCheck, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type RecoveryMode = "recovery" | "reset" | "resend";
export function AccountRecoveryForm({ mode }: { mode: RecoveryMode }) {
  const params = useSearchParams();
  const token = params.get("token");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const lock = useRef(false);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  const reset = mode === "reset";
  const resend = mode === "resend";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    setError(""); setMessage("");
    if (reset && (!token || password !== confirmation)) { setError(!token ? "O link está incompleto. Solicite outro link de recuperação." : "As senhas precisam ser iguais."); return; }
    lock.current = true; setBusy(true);
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`/api/account/${reset ? "reset-password" : resend ? "resend-verification" : "recovery"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reset ? { token, password } : { email: email.trim() }), signal: controller.signal, cache: "no-store" });
      const body: unknown = await response.json();
      if (!mounted.current) return;
      const text = body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : "Não foi possível concluir. Tente novamente.";
      if (!response.ok) { setError(text); return; }
      setMessage(text); setComplete(reset); setPassword(""); setConfirmation("");
    } catch { if (mounted.current) setError("Não foi possível conectar. Confira sua conexão e tente novamente."); }
    finally { clearTimeout(timeout); lock.current = false; if (mounted.current) setBusy(false); }
  }
  return <div className="space-y-6"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">{reset ? <KeyRound aria-hidden="true" /> : <MailCheck aria-hidden="true" />}</span><div><h1 className="text-2xl font-bold tracking-tight">{reset ? "Escolha uma nova senha" : resend ? "Confirme seu e-mail" : "Recupere sua conta"}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{reset ? "Use uma senha única para proteger seus eventos e conexões." : resend ? "Informe o e-mail do cadastro para receber um novo link. Confira também a pasta de spam." : "Enviaremos um link para você definir uma nova senha, se houver uma conta elegível."}</p></div>
    {!complete && <form onSubmit={event => void submit(event)} className="space-y-4" aria-busy={busy}>{reset ? <><div className="space-y-2"><Label htmlFor="recovery-password">Nova senha</Label><Input id="recovery-password" type="password" autoComplete="new-password" minLength={6} maxLength={50} required value={password} disabled={busy || !token} onChange={event => setPassword(event.target.value)} /><p className="text-xs text-muted-foreground">Use entre 6 e 50 caracteres.</p></div><div className="space-y-2"><Label htmlFor="recovery-confirmation">Repita a nova senha</Label><Input id="recovery-confirmation" type="password" autoComplete="new-password" maxLength={50} required value={confirmation} disabled={busy || !token} onChange={event => setConfirmation(event.target.value)} /></div></> : <div className="space-y-2"><Label htmlFor="recovery-email">Seu e-mail</Label><Input id="recovery-email" type="email" autoComplete="email" maxLength={254} required value={email} disabled={busy} onChange={event => setEmail(event.target.value)} placeholder="voce@exemplo.com" /></div>}<Button type="submit" disabled={busy || (reset && !token)} className="min-h-11 w-full rounded-xl">{busy && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}{busy ? "Enviando..." : reset ? "Salvar nova senha" : "Enviar link"}</Button></form>}
    {error && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-red-600 dark:text-red-400">{error}</p>}{message && <p role="status" className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">{message}</p>}{reset && !token && <p role="alert" className="text-sm text-red-600 dark:text-red-400">Este link não contém um código de recuperação.</p>}
    <div className="flex flex-col gap-3 text-sm"><Link href="/login" className="font-semibold text-primary hover:underline">Voltar para entrar</Link>{reset && <Link href="/recuperar-senha" className="text-muted-foreground hover:underline">Solicitar outro link</Link>}{!reset && <Link href={resend ? "/recuperar-senha" : "/confirmar-email"} className="text-muted-foreground hover:underline">{resend ? "Preciso recuperar minha senha" : "Reenviar confirmação de e-mail"}</Link>}</div>
  </div>;
}
