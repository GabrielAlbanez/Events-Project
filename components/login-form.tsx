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
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { validateUser } from "@/app/(actions)/Login/action";
import { useFormStatus } from "react-dom";
import { GoogleButton } from "./MyComponents/GoogleButton";

type LoginFormData = z.infer<typeof loginFormSchema>;

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"form">) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginFormSchema),
  });

  const router = useRouter();
  const { pending } = useFormStatus();

  const onSubmit = async (data: LoginFormData) => {


    // Chama a Server Action para validar as credenciais
    const validationResponse = await validateUser(data);

    console.log(
      validationResponse.status
    )

    if (validationResponse.status === "success") {
      // Se as credenciais forem válidas, chama o signIn
      const signInResponse = await signIn("credentials", {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (signInResponse?.ok) {
        toast.success("Login realizado com sucesso!");
        router.push("/"); // Redireciona para a página inicial
      } else {
        toast.error(validationResponse?.error || "Erro ao realizar login.");
      }
    } else {
      toast.error(validationResponse.error);
    }
  };

  return (
    <form
      className={cn("flex flex-col gap-6", className)}
      onSubmit={handleSubmit(onSubmit)}
      {...props}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Login to your account</h1>
        <p className="text-sm text-muted-foreground">
          Enter your email below to login to your account
        </p>
      </div>
      <div className="grid gap-6">
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
          <div className="flex items-center">
            <Label htmlFor="password">Password</Label>
            <a
              href="#"
              className="ml-auto text-sm underline-offset-4 hover:underline"
            >
              Forgot your password?
            </a>
          </div>
          <Input id="password" type="password" {...register("password")} />
          {errors.password && (
            <p className="text-sm text-red-600">{errors.password.message}</p>
          )}
        </div>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Logando..." : "Login"}
        </Button>
        <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
          <span className="relative z-10 bg-background px-2 text-muted-foreground">
            Ou registre-se com
          </span>
        </div>
        <GoogleButton textBody={"Entrar com google"} />
        
      </div>
      <div className="text-center text-sm">
        Don&apos;t have an account?{" "}
        <a href="/register" className="underline underline-offset-4">
          Sign up
        </a>
      </div>
    </form>
  );
}
