"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useSession } from "next-auth/react";

// Schema de validação com Zod
const ProfileSchema = z.object({
  name: z.string().min(1, "O nome é obrigatório"),
  email: z.string().email("Insira um email válido"),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
  newPassword : z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
  emailVerified: z.boolean(),
});

const Profile: React.FC = () => {
  const [isPending, setIsPending] = useState(false);
  const [profileImage, setProfileImage] = useState<string>("/default-avatar.png");

  const form = useForm<z.infer<typeof ProfileSchema>>({
    resolver: zodResolver(ProfileSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      newPassword : "",
      emailVerified: false,
    },
  });

  const onSubmit = (data: z.infer<typeof ProfileSchema>) => {
    setIsPending(true);
    console.log("Dados do formulário:", data);
    setTimeout(() => setIsPending(false), 2000); // Simula uma requisição
  };

  const user = useSession().data?.user
   
    if (!user) {
        return <div>Você não está logado</div>;
    }

  return (
    <div className="flex justify-center items-center min-h-screen  bg-gray-100 p-4">
      <Card className="w-full max-w-2xl p-6">
        <CardHeader>
          <h1 className="text-2xl font-bold text-center">Perfil do Usuário</h1>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4 overflow-auto">
            <img
              src={"https://i.pinimg.com/736x/cb/5e/c0/cb5ec089e95555d7c5792b76a1779fc4.jpg"}
              alt="User Avatar"
              className="w-32 h-32 rounded-full object-cover"
            />
            <Button
              onClick={() => alert("Upload de imagem ainda não implementado")}
              disabled={isPending}
            >
              Alterar Imagem
            </Button>
          </div>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4 mt-6"
            >
              {/* Nome */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Digite seu nome"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {/* Email */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Digite seu email"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {/* Senha */}
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="Digite sua senha"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

<FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="Digite sua nova senha"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {/* Verificação de Email */}
              <FormField
                control={form.control}
                name="emailVerified"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between">
                    <div>
                      <FormLabel>Email Verificado</FormLabel>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isPending}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              {/* Botão de envio */}
              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? "Atualizando..." : "Atualizar Perfil"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Profile;
