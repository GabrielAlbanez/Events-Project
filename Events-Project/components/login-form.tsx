"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginFormSchema } from "@/schemas/LoiginSchema";
import { toast } from "react-toastify";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { GoogleButton } from "./MyComponents/GoogleButton";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";
import { useSocket } from "@/context/SocketContext";
import styles from "./MyComponents/LoginPage.module.css";
import { authPathWithReturn, safeReturnPath } from "@/lib/authReturn";
import { credentialsErrorMessages, GENERIC_LOGIN_ERROR, loginErrorMessage } from "@/lib/auth/errorMessages";

type LoginFormData = z.infer<typeof loginFormSchema>;

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"form">) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginFormSchema),
  });

  const router = useRouter();
  const socket = useSocket();
  const { update } = useSession();
  const [showPassword, setShowPassword] = useState(false);
  const searchParams = useSearchParams()
  const callbackUrl = safeReturnPath(searchParams.get("callbackUrl"));
  const urlError = searchParams.get("error");
  const [formError, setFormError] = useState<string | null>(() => loginErrorMessage(urlError));
  const [redirecting, setRedirecting] = useState(false);
  const submittingRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // Only whitelisted NextAuth codes become text; raw query values are never rendered.
    setFormError(loginErrorMessage(urlError));
  }, [urlError]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.length = 0;
    };
  }, []);

  const schedule = (callback: () => void, delay: number) => {
    timersRef.current.push(setTimeout(callback, delay));
  };

  const onSubmit = async (data: LoginFormData) => {
    // Guards against double submits that happen before React re-renders the button.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setFormError(null);
    let keepLocked = false;
    try {
      const signInResponse = await signIn("credentials", {
        email: data.email.trim(),
        password: data.password,
        redirect: false,
        callbackUrl,
      });

      if (signInResponse?.ok && !signInResponse.error) {
        keepLocked = true;
        setRedirecting(true);
        socket.disconnect();
        await update();
        toast.success("Login realizado com sucesso!");
        // Refresh server components before returning to the page that started the login.
        schedule(() => {
          router.refresh();
          schedule(() => router.replace(callbackUrl), 500);
        }, 500);
        return;
      }
      setFormError(loginErrorMessage(signInResponse?.error) ?? GENERIC_LOGIN_ERROR);
    } catch {
      setFormError(credentialsErrorMessages.ServiceUnavailable);
    } finally {
      if (!keepLocked) submittingRef.current = false;
    }
  };

  const busy = isSubmitting || redirecting;
  const describedBy = (fieldError: string | null) => [fieldError, formError ? "login-form-error" : null].filter(Boolean).join(" ") || undefined;

  return (
    <form
      className={cn(styles.form, className)}
      aria-busy={busy}
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      {...props}
    >
      {searchParams.get("notice") === "account-suspended" && <div role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4"><p className="text-sm font-semibold">Sua conta está suspensa</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">A administração suspendeu seu acesso e encerrou suas sessões. Sua conta foi preservada. Entre em contato com a administração para obter orientações.</p></div>}
      {searchParams.get("notice") === "account-removed" && (
        <div role="alert" className="flex gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-foreground">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive"><ShieldAlert className="h-5 w-5" aria-hidden="true" /></span>
          <div className="space-y-1"><p className="text-sm font-semibold">Sua conta foi banida do site</p><p className="text-sm leading-relaxed text-muted-foreground">O administrador removeu sua conta e sua sessão foi encerrada. Se acredita que houve um engano, entre em contato com a administração.</p></div>
        </div>
      )}
      {searchParams.get("notice") === "credentials-changed" && <div role="status" className="rounded-2xl border border-primary/30 bg-primary/5 p-4"><p className="text-sm font-semibold">Sessão encerrada por segurança</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Sua sessão anterior deixou de ser válida. Entre novamente para continuar.</p></div>}
      <div className={styles.formHeading}>
        <h1>Bom ter você de volta</h1>
        <p>
          Entre para acompanhar seus eventos e conexões.
        </p>
      </div>
      <div id="login-form-error" role="alert" aria-live="assertive" className={formError ? "flex gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-foreground" : "sr-only"}>
        {formError && (
          <>
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <p className="leading-relaxed">{formError}</p>
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Campos marcados com <span aria-hidden="true" className="text-destructive">*</span><span className="sr-only">asterisco</span> são obrigatórios.</p>
      <div className={styles.fields}>
        <div className={styles.field}>
          <Label htmlFor="email">E-mail <span aria-hidden="true" className="text-destructive">*</span></Label>
          <Input
            id="email"
            type="email"
            placeholder="voce@exemplo.com"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            aria-required="true"
            aria-invalid={!!errors.email}
            aria-describedby={describedBy(errors.email ? "email-error" : null)}
            {...register("email")}
          />
          {errors.email && (
            <p id="email-error" role="alert" className={styles.fieldError}>{errors.email.message}</p>
          )}
        </div>
        <div className={styles.field}>
          <div className={styles.passwordLabel}>
            <Label htmlFor="password">Senha <span aria-hidden="true" className="text-destructive">*</span></Label>
            <a
              href="/recuperar-senha"
              className={styles.recoveryLink}
            >
              Esqueceu sua senha?
            </a>
          </div>
          <div className="relative">
            <Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Sua senha" className="pr-12" aria-required="true" aria-invalid={!!errors.password} aria-describedby={describedBy(errors.password ? "password-error" : null)} {...register("password")} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword} className={styles.passwordToggle}>{showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}</button>
          </div>
          {errors.password && (
            <p id="password-error" role="alert" className={styles.fieldError}>{errors.password.message}</p>
          )}
        </div>
        <Button type="submit" variant="cta" className={styles.submit} disabled={busy}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Entrando...</> : <>Entrar na minha conta<ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
        </Button>
        <div className={styles.divider}><span aria-hidden="true" />ou continue com<span aria-hidden="true" /></div>
        <div className={styles.googleButton}><GoogleButton textBody="Continuar com Google" callbackUrl={callbackUrl} /></div>
        <p className="text-xs leading-5 text-muted-foreground">Saiba como usamos seus dados de acesso na <Link href="/privacidade" className="rounded-sm font-medium text-brand underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Política de privacidade</Link>. Para acesso, correção ou exclusão, use o <Link href="/privacidade/solicitacoes" className="rounded-sm font-medium text-brand underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">canal de privacidade</Link>.</p>
      </div>
      <div className={styles.formFooter}>
        <Link href="/confirmar-email" className={styles.confirmationLink}>Reenviar confirmação de e-mail</Link>
        <p className={styles.registerPrompt}>
        Ainda não tem uma conta?{" "}
        <Link href={authPathWithReturn("/register", callbackUrl)} className={styles.registerLink}>
          Criar uma conta
        </Link>
        </p>
      </div>
    </form>
  );
}
