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
import { validateUser } from "@/app/(actions)/Login/action";
import { GoogleButton } from "./MyComponents/GoogleButton";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";
import { useSocket } from "@/context/SocketContext";
import styles from "./MyComponents/LoginPage.module.css";
import { authPathWithReturn, safeReturnPath } from "@/lib/authReturn";

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

  useEffect(() => {
    const error = searchParams.get("error"); // Captura o erro da URL
    if (error) {
      // Exibe o erro como um toast
      toast.error(decodeURIComponent(error));
    }
  }, [searchParams]);

  const onSubmit = async (data: LoginFormData) => {
    try {
      // Chama a Server Action para validar as credenciais e verificar vínculos
      const validationResponse = await validateUser(data);

      if (validationResponse.status === "error") {
        toast.error(validationResponse.error);
        return;
      }

      // Se a validação passar, chama o signIn
      const signInResponse = await signIn("credentials", {
        email: data.email,
        password: data.password,
        redirect: false,
        callbackUrl,
      });

      if (signInResponse?.ok) {
        socket.disconnect();
        await update();
        toast.success("Login realizado com sucesso!");


        // Adiciona um refresh explícito
        setTimeout(() => {
          router.refresh(); // Atualiza o estado antes do redirecionamento
          setTimeout(() => {
            router.replace(callbackUrl); // Retoma a página que iniciou o login.
          }, 500); // Pequeno atraso para garantir o estado atualizado
        }, 500);
      } else {
        toast.error(
          (signInResponse?.error === "AccountSuspended" ? "Sua conta está suspensa. Entre em contato com a administração." : signInResponse?.error) ||
            "Erro ao realizar login. Verifique as credenciais."
        );
      }
    } catch (error) {
      console.error("Erro inesperado durante o login:", error);
      toast.error("Erro inesperado durante o login.");
    }
  };

  return (
    <form
      className={cn(styles.form, className)}
      aria-busy={isSubmitting}
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
      <p className="text-sm leading-6 text-muted-foreground">Saiba como usamos seus dados de acesso na <Link href="/privacidade" className="rounded-sm font-medium text-brand underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Política de privacidade</Link>. Para acesso, correção ou exclusão, use o <Link href="/privacidade/solicitacoes" className="rounded-sm font-medium text-brand underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">canal de privacidade</Link>.</p>
      <div className={styles.fields}>
        <div className={styles.field}>
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            placeholder="voce@exemplo.com"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...register("email")}
          />
          {errors.email && (
            <p id="email-error" role="alert" className={styles.fieldError}>{errors.email.message}</p>
          )}
        </div>
        <div className={styles.field}>
          <div className={styles.passwordLabel}>
            <Label htmlFor="password">Senha</Label>
            <a
              href="/recuperar-senha"
              className={styles.recoveryLink}
            >
              Esqueceu sua senha?
            </a>
          </div>
          <div className="relative">
            <Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Sua senha" className="pr-12" aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : undefined} {...register("password")} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword} className={styles.passwordToggle}>{showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}</button>
          </div>
          {errors.password && (
            <p id="password-error" role="alert" className={styles.fieldError}>{errors.password.message}</p>
          )}
        </div>
        <Button type="submit" variant="cta" className={styles.submit} disabled={isSubmitting}>
          {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Entrando...</> : <>Entrar na minha conta<ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
        </Button>
        <div className={styles.divider}><span aria-hidden="true" />ou continue com<span aria-hidden="true" /></div>
        <div className={styles.googleButton}><GoogleButton textBody="Continuar com Google" callbackUrl={callbackUrl} /></div>
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
