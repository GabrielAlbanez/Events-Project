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
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { useSocket } from "@/context/SocketContext";
import styles from "./MyComponents/LoginPage.module.css";
import { authPathWithReturn, safeReturnPath } from "@/lib/authReturn";
import { credentialsErrorMessages, GENERIC_LOGIN_ERROR, loginErrorMessage } from "@/lib/auth/errorMessages";

type LoginFormData = z.infer<typeof loginFormSchema>;

// URL notices are whitelisted here; any other ?notice= value is ignored.
const LOGIN_NOTICES: Record<string, { type: "error" | "warning" | "info"; message: string; persistent?: boolean }> = {
  "account-suspended": { type: "warning", persistent: true, message: "Sua conta está suspensa. A administração suspendeu seu acesso e encerrou suas sessões. Sua conta foi preservada; entre em contato com a administração para obter orientações." },
  "account-removed": { type: "error", persistent: true, message: "Sua conta foi banida do site. O administrador removeu sua conta e sua sessão foi encerrada. Se acredita que houve um engano, entre em contato com a administração." },
  "credentials-changed": { type: "info", message: "Sessão encerrada por segurança. Sua sessão anterior deixou de ser válida. Entre novamente para continuar." },
};

function showLoginError(message: string) {
  // toastId keyed by message prevents duplicates from re-renders or React strict mode.
  toast.error(message, { toastId: `login-error:${message}` });
}

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"form">) {
  const {
    register,
    handleSubmit,
    setFocus,
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
  const notice = searchParams.get("notice");
  const [redirecting, setRedirecting] = useState(false);
  const submittingRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // Only whitelisted NextAuth codes become text; raw query values are never rendered.
    const urlMessage = loginErrorMessage(urlError);
    if (urlMessage) showLoginError(urlMessage);
  }, [urlError]);

  useEffect(() => {
    const config = notice ? LOGIN_NOTICES[notice] : undefined;
    if (!config) return;
    toast(config.message, { type: config.type, toastId: `login-notice:${notice}`, autoClose: config.persistent ? false : 6000 });
  }, [notice]);

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
      showLoginError(loginErrorMessage(signInResponse?.error) ?? GENERIC_LOGIN_ERROR);
      setFocus("password");
    } catch {
      showLoginError(credentialsErrorMessages.ServiceUnavailable);
    } finally {
      if (!keepLocked) submittingRef.current = false;
    }
  };

  const busy = isSubmitting || redirecting;
  const describedBy = (fieldError: string | null) => fieldError ?? undefined;

  return (
    <form
      className={cn(styles.form, className)}
      aria-busy={busy}
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      {...props}
    >
      <div className={styles.formHeading}>
        <h1>Bom ter você de volta</h1>
        <p>
          Entre para acompanhar seus eventos e conexões.
        </p>
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
