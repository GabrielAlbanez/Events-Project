"use client";

import React, { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, CheckCircle2, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import * as z from "zod";
import resetDataProfile from "@/app/(actions)/resetDataProfile/action";
import ModalUniversal from "@/components/MyComponents/ModalUniversal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useSocket } from "@/context/SocketContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { determineDefaultAvatar } from "@/utils/avatarUtils";
import { getMyPublicProfile, updatePromoterProfile } from "@/app/(actions)/engagement/action";
import { Textarea } from "@/components/ui/textarea";

const profileSchema = z.object({
  name: z.string().trim().min(2, "Informe pelo menos 2 caracteres."),
  password: z.string(),
  newPassword: z.string(),
}).refine((values) => !values.password && !values.newPassword || Boolean(values.password && values.newPassword), {
  message: "Preencha a senha atual e a nova senha.",
  path: ["newPassword"],
});

type ProfileValues = z.infer<typeof profileSchema>;

const roleLabels: Record<string, string> = {
  ADMIN: "Administrador",
  PROMOTER: "Promotor",
  BASIC: "Usuário",
};

export default function Profile() {
  const user = useCurrentUser();
  const socket = useSocket();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, setIsPending] = useState(false);
  const [isImagePending, setIsImagePending] = useState(false);
  const [profileImage, setProfileImage] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewImage, setPreviewImage] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [bio, setBio] = useState("");
  const [contactUrl, setContactUrl] = useState("");
  const [publicProfileLoading, setPublicProfileLoading] = useState(false);
  const [publicProfileSaving, setPublicProfileSaving] = useState(false);
  const [publicProfileError, setPublicProfileError] = useState("");
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: "", password: "", newPassword: "" },
  });

  useEffect(() => {
    if (!user.data) return;
    form.reset({ name: user.data.name || "", password: "", newPassword: "" });
    setProfileImage(user.data.image || determineDefaultAvatar(user.data.name));
  }, [user.data, form]);

  useEffect(() => () => {
    if (previewImage) URL.revokeObjectURL(previewImage);
  }, [previewImage]);

  useEffect(() => {
    if (user.data?.role !== "PROMOTER") return;
    let active = true;
    setPublicProfileLoading(true);
    void getMyPublicProfile().then((profile) => {
      if (!active) return;
      setBio(profile.bio ?? "");
      setContactUrl(profile.contactUrl ?? "");
      setPublicProfileError("");
    }).catch(() => { if (active) setPublicProfileError("Não foi possível carregar o perfil público."); }).finally(() => { if (active) setPublicProfileLoading(false); });
    return () => { active = false; };
  }, [user.data?.id, user.data?.role]);

  const savePublicProfile = async () => {
    if (publicProfileSaving) return;
    if (contactUrl.trim()) {
      try { const url = new URL(contactUrl.trim()); if (!(["http:", "https:"].includes(url.protocol))) throw new Error("Invalid protocol"); }
      catch { setPublicProfileError("Use um link completo começando com https://."); return; }
    }
    setPublicProfileSaving(true);
    try {
      const result = await updatePromoterProfile({ bio: bio.trim(), contactUrl: contactUrl.trim() });
      if (!result.success) { setPublicProfileError(result.message); return; }
      setPublicProfileError("");
      toast.success("Perfil público atualizado.");
    } catch { setPublicProfileError("Não foi possível salvar o perfil público."); }
    finally { setPublicProfileSaving(false); }
  };

  const account = user.data;
  const canChangePassword = account?.provider !== "google" && account?.provider !== "dev-admin";
  const name = form.watch("name");
  const password = form.watch("password");
  const newPassword = form.watch("newPassword");
  const hasChanges = Boolean(account && (name.trim() !== (account.name || "") || password || newPassword));

  const onSubmit = async (values: ProfileValues) => {
    if (!account?.email || !hasChanges) return;
    setIsPending(true);
    try {
      const response = await resetDataProfile({
        email: account.email,
        name: values.name.trim() === (account.name || "") ? undefined : values.name.trim(),
        password: canChangePassword ? values.password : undefined,
        newPassword: canChangePassword ? values.newPassword : undefined,
      });
      if (response.status !== "success") {
        toast.error(response.message);
        return;
      }
      toast.success(response.message);
      await user.update();
      socket?.emit("request-update-users");
      form.reset({ name: values.name.trim(), password: "", newPassword: "" });
    } catch {
      toast.error("Não foi possível atualizar o perfil. Tente novamente.");
    } finally {
      setIsPending(false);
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      toast.error("Escolha uma imagem de até 5 MB.");
      event.target.value = "";
      return;
    }
    setSelectedImage(file);
    setPreviewImage(URL.createObjectURL(file));
    setIsModalOpen(true);
    event.target.value = "";
  };

  const closeImageModal = () => {
    if (isImagePending) return;
    setIsModalOpen(false);
    setSelectedImage(null);
    setPreviewImage("");
  };

  const handleConfirmImage = async () => {
    if (isImagePending || !selectedImage || !account?.id) return;
    setIsImagePending(true);
    try {
      const payload = new FormData();
      payload.append("file", selectedImage);
      payload.append("userId", account.id);
      const response = await fetch("/api/upload", { method: "POST", body: payload });
      if (!response.ok) throw new Error("Upload failed");
      const result: { filePath?: string } = await response.json();
      if (!result.filePath) throw new Error("Missing image path");
      setProfileImage(result.filePath);
      await user.update();
      socket?.emit("request-update-users");
      toast.success("Foto atualizada com sucesso!");
      setIsModalOpen(false);
      setSelectedImage(null);
      setPreviewImage("");
    } catch {
      toast.error("Não foi possível atualizar a foto. Tente novamente.");
    } finally {
      setIsImagePending(false);
    }
  };

  if (user.status === "loading") {
    return <main className="flex flex-1 items-center justify-center p-6"><p role="status" className="text-muted-foreground">Carregando perfil...</p></main>;
  }
  if (!account) {
    return <main className="flex flex-1 items-center justify-center p-6"><p className="text-muted-foreground">Entre na sua conta para ver o perfil.</p></main>;
  }

  return (
    <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-start gap-4">
          <SidebarTrigger className="mt-1 shrink-0" />
          <div><p className="mb-2 text-sm font-semibold uppercase tracking-widest text-primary">Minha conta</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Meu perfil</h1><p className="mt-2 text-muted-foreground">Mantenha suas informações e sua foto atualizadas.</p></div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
          <Card className="overflow-hidden rounded-2xl shadow-sm">
            <div className="h-24 bg-gradient-to-r from-primary/20 via-primary/10 to-accent/70" />
            <CardContent className="relative px-6 pb-6 pt-0">
              <img src={profileImage || determineDefaultAvatar(account.name)} alt={`Foto de perfil de ${account.name || "usuário"}`} className="-mt-12 h-24 w-24 rounded-2xl border-4 border-card bg-muted object-cover shadow-sm" />
              <h2 className="mt-4 break-words text-xl font-semibold">{account.name || "Seu nome"}</h2>
              <p className="mt-1 break-all text-sm text-muted-foreground">{account.email}</p>
              <div className="mt-5">
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" aria-label="Selecionar foto do perfil" onChange={handleImageUpload} />
                <Button type="button" variant="outline" className="w-full" disabled={isImagePending} onClick={() => fileInputRef.current?.click()}><Camera className="h-4 w-4" /> Alterar foto</Button>
                <p className="mt-2 text-xs text-muted-foreground">JPG, PNG, WebP ou AVIF de até 5 MB.</p>
              </div>
            </CardContent>
          </Card>

          <div className="min-w-0 space-y-6">
            {account.role === "PROMOTER" && <Card className="rounded-2xl shadow-sm"><CardContent className="p-5 sm:p-7"><h2 className="text-xl font-semibold">Perfil público do promotor</h2><p className="mt-1 text-sm text-muted-foreground">Apresente quem organiza seus eventos e informe um canal de contato.</p>{publicProfileLoading ? <p role="status" className="mt-5 text-sm text-muted-foreground">Carregando perfil público...</p> : <div className="mt-5 space-y-4"><div><label htmlFor="promoter-bio" className="mb-2 block text-sm font-medium">Sobre você</label><Textarea id="promoter-bio" value={bio} onChange={(event) => setBio(event.target.value)} maxLength={600} rows={5} placeholder="Conte sua experiência e o tipo de eventos que organiza." /><p className="mt-1 text-xs text-muted-foreground">{bio.length}/600 caracteres</p></div><div><label htmlFor="promoter-contact" className="mb-2 block text-sm font-medium">Link de contato</label><Input id="promoter-contact" type="url" value={contactUrl} onChange={(event) => setContactUrl(event.target.value)} placeholder="https://seusite.com/contato" /><p className="mt-1 text-xs text-muted-foreground">Pode ser seu site ou uma página de contato pública.</p></div>{publicProfileError && <p role="alert" className="text-sm text-destructive">{publicProfileError}</p>}<Button type="button" onClick={() => void savePublicProfile()} disabled={publicProfileSaving}>{publicProfileSaving ? "Salvando..." : "Salvar perfil público"}</Button></div>}</CardContent></Card>}
            <Card className="rounded-2xl shadow-sm">
              <CardContent className="p-5 sm:p-7">
                <div className="mb-6 flex items-start gap-3"><UserRound className="mt-0.5 h-5 w-5 text-primary" /><div><h2 className="text-xl font-semibold">Dados pessoais</h2><p className="mt-1 text-sm text-muted-foreground">Atualize seu nome de exibição. Seu email identifica esta conta.</p></div></div>
                <Form {...form}>
                  <form id="profile-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                    <FormField control={form.control} name="name" render={({ field }) => <FormItem><FormLabel>Nome de exibição</FormLabel><FormControl><Input autoComplete="name" placeholder="Como você quer ser chamado" disabled={isPending} {...field} /></FormControl><FormMessage /></FormItem>} />
                    <div><label htmlFor="profile-email" className="mb-2 block text-sm font-medium">Email</label><div className="relative"><Mail aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="profile-email" type="email" value={account.email || ""} readOnly aria-describedby="profile-email-help" className="pl-10 text-muted-foreground" /></div><p id="profile-email-help" className="mt-2 text-xs text-muted-foreground">O email não pode ser alterado nesta página.</p></div>
                    {canChangePassword && <div className="border-t border-border pt-6"><div className="mb-5 flex items-start gap-3"><LockKeyhole className="mt-0.5 h-5 w-5 text-primary" /><div><h3 className="font-semibold">Alterar senha</h3><p className="mt-1 text-sm text-muted-foreground">Preencha os dois campos apenas se quiser trocar a senha.</p></div></div><div className="grid gap-5 sm:grid-cols-2">
                      <FormField control={form.control} name="password" render={({ field }) => <FormItem><FormLabel>Senha atual</FormLabel><FormControl><Input type="password" autoComplete="current-password" disabled={isPending} {...field} /></FormControl><FormMessage /></FormItem>} />
                      <FormField control={form.control} name="newPassword" render={({ field }) => <FormItem><FormLabel>Nova senha</FormLabel><FormControl><Input type="password" autoComplete="new-password" disabled={isPending} {...field} /></FormControl><FormMessage /></FormItem>} />
                    </div></div>}
                    <Button type="submit" disabled={isPending || !hasChanges} className="w-full sm:w-auto">{isPending ? "Salvando..." : "Salvar alterações"}</Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm"><CardContent className="p-5 sm:p-7"><div className="mb-5 flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-primary" /><div><h2 className="text-xl font-semibold">Informações da conta</h2><p className="mt-1 text-sm text-muted-foreground">Esses dados são definidos pelo seu acesso.</p></div></div><dl className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl bg-muted/60 p-4"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tipo de conta</dt><dd className="mt-2 font-medium">{roleLabels[account.role || ""] || account.role || "Não informado"}</dd></div><div className="rounded-xl bg-muted/60 p-4"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Acesso</dt><dd className="mt-2 font-medium">{account.provider === "google" ? "Google" : account.provider === "dev-admin" ? "Conta de desenvolvimento" : "Email e senha"}</dd></div><div className="rounded-xl bg-muted/60 p-4 sm:col-span-2"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email verificado</dt><dd className="mt-2 flex items-center gap-2 font-medium">{account.provider === "google" || account.emailVerified ? <><CheckCircle2 className="h-4 w-4 text-primary" /> Sim</> : "Ainda não verificado"}</dd></div></dl></CardContent></Card>
          </div>
        </div>
      </div>
      <ModalUniversal open={isModalOpen} onClose={closeImageModal} title="Confirmar foto do perfil" imageSrc={previewImage} onConfirm={handleConfirmImage} />
    </main>
  );
}
