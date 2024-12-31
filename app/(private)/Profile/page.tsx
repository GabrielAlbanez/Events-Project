"use client";

import React, { useState, useEffect } from "react";
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
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { FaEdit } from "react-icons/fa";
import ModalUniversal from "@/components/MyComponents/ModalUniversal";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// Schema de validação com Zod
const ProfileSchema = z.object({
  name: z.string().min(1, "O nome é obrigatório"),
  email: z.string().email("Insira um email válido"),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
  newPassword: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
  emailVerified: z.boolean(),
});

const Profile: React.FC = () => {
  const [isPending, setIsPending] = useState(false);
  const [profileImage, setProfileImage] = useState<string>(
    "https://i.pinimg.com/736x/cb/5e/c0/cb5ec089e95555d7c5792b76a1779fc4.jpg"
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tempImage, setTempImage] = useState<string>("");

  const user = useCurrentUser();

  const form = useForm<z.infer<typeof ProfileSchema>>({
    resolver: zodResolver(ProfileSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      newPassword: "",
      emailVerified: false,
    },
  });

  useEffect(() => {
    if (user) {
      form.reset({
        name: user.name || "",
        email: user.email || "",
        password: "",
        newPassword: "",
        emailVerified: user.emailVerified || false,
      });
      setProfileImage(user.image || "https://i.pinimg.com/736x/cb/5e/c0/cb5ec089e95555d7c5792b76a1779fc4.jpg");
    }
  }, [user, form]);

  const onSubmit = (data: z.infer<typeof ProfileSchema>) => {
    setIsPending(true);
    console.log("Dados do formulário:", data);
    setTimeout(() => setIsPending(false), 2000); // Simula uma requisição
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setTempImage(reader.result as string);
        setIsModalOpen(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleConfirmImage = async () => {
    setIsPending(true);
    const formData = new FormData();
    formData.append("file", tempImage);
    if (user) {
      formData.append("userId", user.id);
    }

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      setProfileImage(result.filePath);
      toast.success("Imagem carregada com sucesso!");
    } catch (error) {
      toast.error("Erro ao carregar a imagem.");
    } finally {
      setIsPending(false);
      setIsModalOpen(false);
    }
  };

  if (!user) {
    return <div>Você não está logado</div>;
  }

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100 p-4">
      <Card className="w-full max-w-2xl p-6">
        <CardHeader>
          <h1 className="text-2xl font-bold text-center">Perfil do Usuário</h1>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4 overflow-auto">
            <div className="relative">
              <img
                src={profileImage}
                alt="User Avatar"
                className="w-32 h-32 rounded-full object-cover transition-transform duration-300 ease-in-out transform hover:scale-105"
              />
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="absolute bottom-0 right-0 opacity-0 w-full h-full cursor-pointer"
              />
              <Button
                className="absolute bottom-0 right-0 p-2 bg-blue-600 text-white rounded-full shadow-md"
                onClick={() => document.querySelector('input[type="file"]')?.click()}
                disabled={isPending}
              >
                <FaEdit />
              </Button>
            </div>
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
                    <FormLabel>Nova Senha</FormLabel>
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
                        checked={user?.provider === "google" || field.value}
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
      <ModalUniversal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Preview da Imagem"
        imageSrc={tempImage}
        onConfirm={handleConfirmImage}
      />
      <ToastContainer position="bottom-right" autoClose={5000} hideProgressBar={false} newestOnTop={false} closeOnClick rtl={false} pauseOnFocusLoss draggable pauseOnHover theme="light" />
    </div>
  );
};

export default Profile;