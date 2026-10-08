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
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { useSocket } from "@/context/SocketContext";

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
        router.push("/login");
      } else {
        toast.error(responseData.error || "Erro ao registrar o usuário.");
      }
    } catch (error) {
      toast.error("Erro inesperado durante o registro.");
    }
  };

  return (
    <form
      className={cn("flex flex-col gap-6 [&_input]:h-12 [&_input]:rounded-xl [&_input]:bg-background [&_input]:shadow-none [&_input]:focus-visible:ring-2 [&_button]:min-h-11", className)}
      aria-busy={isSubmitting}
      onSubmit={handleSubmit(onSubmit)}
      {...props}
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Crie sua conta</h1>
        <p className="text-sm text-muted-foreground">
          Encontre sua próxima experiência. Comece por aqui.
        </p>
      </div>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" placeholder="Como você se chama?" autoComplete="name" aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-error" : undefined} {...register("name")} />
          {errors.name && (
            <p id="name-error" role="alert" className="text-sm text-red-600 dark:text-red-400">{errors.name.message}</p>
          )}
        </div>
        <div className="grid gap-2">
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
            <p id="email-error" role="alert" className="text-sm text-red-600 dark:text-red-400">{errors.email.message}</p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Senha</Label>
          <div className="relative">
            <Input id="password" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="Crie uma senha" className="pr-12" aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error password-help" : "password-help"} {...register("password")} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword} className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}</button>
          </div>
          <p id="password-help" className="text-xs text-muted-foreground">Use de 6 a 50 caracteres.</p>
          {errors.password && (
            <p id="password-error" role="alert" className="text-sm text-red-600 dark:text-red-400">{errors.password.message}</p>
          )}
        </div>
        <div className="grid gap-2">
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
            <p id="confirm-password-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>
        <Button type="submit" className="h-12 w-full rounded-xl text-sm font-semibold" disabled={isSubmitting}>
          {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Criando conta...</> : <>Criar minha conta<ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
        </Button>
        <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" aria-hidden="true" />ou continue com<span className="h-px flex-1 bg-border" aria-hidden="true" /></div>
        <div className="[&_button]:h-12 [&_button]:rounded-xl"><GoogleButton textBody="Continuar com Google" /></div>
      </div>
      <div className="text-center text-sm">
        Já tem uma conta?{" "}
        <Link href="/login" className="rounded-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Entrar na conta
        </Link>
      </div>
    </form>
  );
}
