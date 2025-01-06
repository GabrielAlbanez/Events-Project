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
import { SidebarTrigger } from "@/components/ui/sidebar";
import resetDataProfile from "@/app/(actions)/resetDataProfile/action";
import { useTheme } from "next-themes";

// Schema de validação com Zod
const ProfileSchema = z.object({
  name: z.string().optional(),
  email: z.string().email("Insira um email válido").optional(),
  password: z.string().optional(),
  newPassword: z.string().optional(),
  emailVerified: z.boolean().optional(),
});

const Profile: React.FC = () => {
  const theme = useTheme();
  const backgroundTheme =
    theme.theme === "dark" ? "bg-black/90 text-white" : "bg-white text-gray-700 border-white";
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
    if (user.data) {
      form.reset({
        name: user.data?.name || "",
        email: user.data?.email || "",
        password: "",
        newPassword: "",
        emailVerified: user.data?.emailVerified || false,
      });
      setProfileImage(
        user.data?.image ||
          "https://i.pinimg.com/736x/cb/5e/c0/cb5ec089e95555d7c5792b76a1779fc4.jpg"
      );
    }
  }, [user.data, form]);

  const onSubmit = async (data: z.infer<typeof ProfileSchema>) => {
    setIsPending(true);
    console.log("Dados do formulário:", data);
    const response = await resetDataProfile({
      ...data,
      email: data.email || "",
    });
    if (response.status === "success") {
      toast.success(response.message);
      await user.update();
    } else {
      toast.error(response.message);
    }
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

    // Converter Base64 em Blob
    const base64Data = tempImage.replace(/^data:image\/\w+;base64,/, ""); // Remove o cabeçalho do Base64
    const byteCharacters = atob(base64Data); // Decodifica Base64
    const byteNumbers = new Array(byteCharacters.length)
      .fill(0)
      .map((_, i) => byteCharacters.charCodeAt(i));
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: "image/jpeg" }); // Alterar o tipo MIME conforme necessário

    // Criar o FormData
    const formData = new FormData();
    formData.append("file", blob, "uploaded_image.jpg"); // Nome do arquivo como "uploaded_image.jpg"

    if (user.data) {
      formData.append("userId", user.data.id);
    }

    console.log("Dados enviados ao servidor", user.data?.id, blob);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Erro ao fazer upload da imagem");
      }

      const result = await response.json();
      console.log("Resposta do servidor:", result);
      setProfileImage(result.filePath);
      toast.success("Imagem carregada com sucesso!");
      await user.update({
        user: { ...user, image: result.filePath },
      }); // Atualiza os dados do usuário
    } catch (error) {
      console.error(error);
      toast.error("Erro ao carregar a imagem.");
    } finally {
      setIsPending(false);
      setIsModalOpen(false);
    }
  };

  if (!user?.data) {
    return <div>Você não está logado</div>;
  }

  return (
    <div className={`flex justify-center items-center min-h-screen ${theme.theme === 'dark' ? 'bg-black/40' : 'bg-white/90'} p-4`}>
      <Card className={`w-full max-w-2xl p-6  ${backgroundTheme} `}>
        <CardHeader>
          <SidebarTrigger>
            <button className="  mr-3">
              ☰
            </button>
          </SidebarTrigger>
          <h1 className="text-2xl font-bold text-center">Perfil do Usuário</h1>
        </CardHeader>
        <CardContent>
          <div className="  flex flex-col items-center gap-4 overflow-auto">
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
                onClick={() =>
                  (
                    document.querySelector(
                      'input[type="file"]'
                    ) as HTMLInputElement
                  )?.click()
                }
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
                        disabled={true}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {/* Senha */}
              {user.data?.provider !== "google" && (
                <>
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Senha Atual</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            placeholder="Senha atual"
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
                </>
              )}
              {/* Verificação de Email */}

              <FormItem>
                <FormLabel>Tipo de Provedor</FormLabel>
                <FormControl>
                  <Input
                    value={user.data?.provider || "Não especificado"}
                    disabled={true}
                  />
                </FormControl>
              </FormItem>

              <FormItem>
                <FormLabel>Role</FormLabel>
                <FormControl>
                  <Input value={user.data?.role ?? ""} disabled={true} />
                </FormControl>
              </FormItem>

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
                        checked={
                          user.data?.provider === "google"
                            ? true
                            : user.data?.emailVerified ?? false
                        }
                        onCheckedChange={field.onChange}
                        disabled={true}
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
      <ToastContainer
        position="bottom-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />
    </div>
  );
};

export default Profile;
