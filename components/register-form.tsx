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
import { registerUser } from "@/app/(actions)/Registro/action";
import { useFormStatus } from "react-dom";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

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

  const { pending } = useFormStatus();

  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const onSubmit = async (data: RegisterFormData) => {
    startTransition(async () => {
      try {
        const responseData = await registerUser(data);
        if (responseData.status === "sucess") {
          toast.success("Registro realizado com sucesso! Redirecionando...");
          router.push("/login");
        } else {
          toast.error(responseData.error || "Erro ao registrar o usuário.");
        }
      } catch (error) {
        toast.error("Erro inesperado durante o registro.");
      }
    });
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
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Registrando..." : "Registrar"}
        </Button>
        <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
          <span className="relative z-10 bg-background px-2 text-muted-foreground">
            Ou registre-se com
          </span>
        </div>
        <GoogleButton textBody={"Se registrar com google"} />
      </div>
      <div className="text-center text-sm">
        Já tem uma conta?{" "}
        <a href="/login" className="underline underline-offset-4">
          Faça login
        </a>
      </div>
    </form>
  );
}
