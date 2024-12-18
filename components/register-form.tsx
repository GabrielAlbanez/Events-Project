"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerFormSchema } from "@/schemas/registerFormSchema";

type RegisterFormData = z.infer<typeof registerFormSchema>;

export function RegisterForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"form">) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerFormSchema),
  });

  const onSubmit = (data: RegisterFormData) => {
    console.log("Dados do registro:", data);
  };

  return (
    <form
      className={cn("flex flex-col gap-6", className)}
      onSubmit={handleSubmit(onSubmit)}
      {...props}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Crie sua conta</h1>
        <p className="text-sm text-muted-foreground">
          Preencha os dados abaixo para criar sua conta
        </p>
      </div>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" placeholder="Seu nome" {...register("name")} />
          {errors.name && (
            <p className="text-sm text-red-600">{errors.name.message}</p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="m@example.com"
            {...register("email")}
          />
          {errors.email && (
            <p className="text-sm text-red-600">{errors.email.message}</p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            placeholder="Sua senha"
            {...register("password")}
          />
          {errors.password && (
            <p className="text-sm text-red-600">{errors.password.message}</p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="confirmPassword">Confirme a senha</Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="Confirme sua senha"
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <p className="text-sm text-red-600">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>
        <Button type="submit" className="w-full">
          Registrar
        </Button>
        <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
          <span className="relative z-10 bg-background px-2 text-muted-foreground">
            Ou registre-se com
          </span>
        </div>
        <Button variant="outline" className="w-full">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            className="w-6 h-6"
          >
            <path
              fill="#4285F4"
              d="M23.49 12.27c0-.79-.07-1.55-.18-2.27H12v4.3h6.47c-.3 1.5-1.18 2.77-2.5 3.63v3h4.03c2.35-2.17 3.7-5.36 3.7-8.66z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.93l-4.03-3c-1.12.75-2.55 1.2-3.9 1.2-3 0-5.54-2.03-6.44-4.77H1.4v3.04C3.35 21.3 7.38 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.56 14.5c-.25-.75-.4-1.55-.4-2.38s.15-1.63.4-2.38V6.7H1.4C.5 8.47 0 10.17 0 12s.5 3.53 1.4 5.3l4.16-2.8z"
            />
            <path
              fill="#EA4335"
              d="M12 4.76c1.77 0 3.35.61 4.6 1.8l3.43-3.43C18.92 1.08 16.21 0 12 0 7.38 0 3.35 2.7 1.4 6.7l4.16 2.8c.9-2.74 3.44-4.74 6.44-4.74z"
            />
          </svg>
          Registrar com Google
        </Button>
      </div>
      <div className="text-center text-sm">
        Já tem uma conta?{" "}
        <a href="#" className="underline underline-offset-4">
          Faça login
        </a>
      </div>
    </form>
  );
}
