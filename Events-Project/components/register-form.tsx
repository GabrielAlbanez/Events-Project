"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerFormSchema } from "@/schemas/registerFormSchema";
import { GoogleButton } from "./MyComponents/GoogleButton";
import { toast } from "react-toastify";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { useSocket } from "@/context/SocketContext";
import styles from "./MyComponents/LoginPage.module.css";
import { authPathWithReturn, safeReturnPath } from "@/lib/authReturn";

type RegisterFormData = z.infer<typeof registerFormSchema>;

export function RegisterForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"form">) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerFormSchema),
  });

  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeReturnPath(searchParams.get("callbackUrl"));
  const [showPassword, setShowPassword] = useState(false);

  const socket = useSocket()

  const onSubmit = async (data: RegisterFormData) => {
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const responseData = await response.json();
      if (responseData.status === "success") {
        toast.success("Registro realizado com sucesso! Verifique seu email.");
        if (socket) {
          socket.emit("request-update-users"); // novo evento
        }
        router.push(authPathWithReturn("/login", callbackUrl));
      } else {
        toast.error(responseData.error || "Erro ao registrar o usuário.");
      }
    } catch (error) {
      toast.error("Erro inesperado durante o registro.");
    }
  };

  return (
    <form
      className={cn(styles.form, styles.registerForm, className)}
      aria-busy={isSubmitting}
      onSubmit={handleSubmit(onSubmit)}
      {...props}
    >
      <div className={styles.formHeading}>
        <h1>Crie sua conta</h1>
        <p>
          Encontre sua próxima experiência. Comece por aqui.
        </p>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        Usamos nome, e-mail e dados de acesso para criar e proteger sua conta. Ao continuar com Google, recebemos os dados de perfil autorizados. Antes de continuar, consulte a{" "}
        <Link href="/privacidade" className="rounded-sm font-medium text-brand underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Política de privacidade</Link>{" "}
        e saiba como <Link href="/privacidade/solicitacoes" className="rounded-sm font-medium text-brand underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">exercer seus direitos</Link>.
      </p>
      <div className={styles.fields}>
        <div className={styles.field}>
          <Label htmlFor="name">Nome</Label>
          <Input id="name" placeholder="Como você se chama?" autoComplete="name" aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-error" : undefined} {...register("name")} />
          {errors.name && (
            <p id="name-error" role="alert" className={styles.fieldError}>{errors.name.message}</p>
          )}
        </div>
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
          <Label htmlFor="password">Senha</Label>
          <div className="relative">
            <Input id="password" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="Crie uma senha" className="pr-12" aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error password-help" : "password-help"} {...register("password")} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword} className={styles.passwordToggle}>{showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}</button>
          </div>
          <p id="password-help" className={styles.passwordHelp}>Use de 6 a 50 caracteres.</p>
          {errors.password && (
            <p id="password-error" role="alert" className={styles.fieldError}>{errors.password.message}</p>
          )}
        </div>
        <div className={styles.field}>
          <Label htmlFor="confirmPassword">Confirme a senha</Label>
          <Input
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={errors.confirmPassword ? "confirm-password-error" : undefined}
            placeholder="Confirme sua senha"
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <p id="confirm-password-error" role="alert" className={styles.fieldError}>
              {errors.confirmPassword.message}
            </p>
          )}
        </div>
        <Button type="submit" variant="cta" className={styles.submit} disabled={isSubmitting}>
          {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Criando conta...</> : <>Criar minha conta<ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
        </Button>
        <div className={styles.divider}><span aria-hidden="true" />ou continue com<span aria-hidden="true" /></div>
        <div className={styles.googleButton}><GoogleButton textBody="Continuar com Google" callbackUrl={callbackUrl} /></div>
      </div>
      <div className={styles.formFooter}>
        <p className={styles.registerPrompt}>
        Já tem uma conta?{" "}
        <Link href={authPathWithReturn("/login", callbackUrl)} className={styles.registerLink}>
          Entrar na conta
        </Link>
        </p>
      </div>
    </form>
  );
}
