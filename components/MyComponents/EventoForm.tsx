"use client";

import React, { useRef, useState, useTransition } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Card, CardContent } from "@/components/ui/card";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { salvarEvento } from "@/app/(actions)/eventos/actions";

type EventoFormData = {
  nome: string;
  descricao: string;
  data: string;
  LinkParaCompraIngresso: string;
  endereco: string;
};

export function EventoForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"form">) {
  const form = useForm<EventoFormData>({
    defaultValues: {
      nome: "",
      descricao: "",
      data: "",
      LinkParaCompraIngresso: "",
      endereco: "",
    },
  });

  const { handleSubmit, reset, formState } = form;
  const { errors } = formState;

  const { data } = useCurrentUser();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const carouselInputRef = useRef<HTMLInputElement | null>(null);

  const [previewBanner, setPreviewBanner] = useState<string | null>(null);
  const [selectedBanner, setSelectedBanner] = useState<File | null>(null);
  const [carouselImages, setCarouselImages] = useState<string[]>([]);
  const [selectedCarouselFiles, setSelectedCarouselFiles] = useState<File[]>([]);

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedBanner(file);
      setPreviewBanner(URL.createObjectURL(file));
    }
  };

  const handleRemoveBanner = () => {
    setPreviewBanner(null);
    setSelectedBanner(null);
    if (bannerInputRef.current) {
      bannerInputRef.current.value = "";
    }
  };

  const handleCarouselChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length) {
      const previews = files.map((file) => URL.createObjectURL(file));
      setCarouselImages((prev) => [...prev, ...previews]);
      setSelectedCarouselFiles((prev) => [...prev, ...files]);
    }
  };

  const handleRemoveCarouselImage = (index: number) => {
    setCarouselImages((prev) => prev.filter((_, i) => i !== index));
    setSelectedCarouselFiles((prev) => prev.filter((_, i) => i !== index));
    if (carouselInputRef.current) {
      carouselInputRef.current.value = "";
    }
  };

  const onSubmit = (dataForm: EventoFormData) => {
    console.log("Dados enviados:", dataForm);
    console.log("Banner selecionado:", selectedBanner);
    console.log("Arquivos do carrossel:", selectedCarouselFiles);

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("nome", dataForm.nome);
        formData.append("descricao", dataForm.descricao);
        formData.append("data", dataForm.data);
        formData.append("LinkParaCompraIngresso", dataForm.LinkParaCompraIngresso);
        formData.append("endereco", dataForm.endereco);

        if (selectedBanner) {
          formData.append("banner", selectedBanner);
        }

        selectedCarouselFiles.forEach((file) => {
          formData.append("carrossel", file);
        });

        if (!data?.id) {
          toast.error("Erro: ID do usuário não encontrado.");
          return;
        }

        const result = await salvarEvento(formData, data.id);

        if (result.success) {
          toast.success("Evento criado com sucesso!");
          reset();
          handleRemoveBanner();
          setCarouselImages([]);
          setSelectedCarouselFiles([]);
          router.push("/");
        } else {
          toast.error(result.message || "Erro ao salvar o evento.");
        }
      } catch (error) {
        console.error("Erro ao criar o evento:", error);
        toast.error("Erro inesperado ao criar o evento.");
      }
    });
  };

  return (
    <FormProvider {...form}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className={`space-y-4 ${className}`}
        {...props}
      >
        {/* Nome */}
        <FormField
          name="nome"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome do Evento</FormLabel>
              <FormControl>
                <Input placeholder="Digite o nome do evento" {...field} />
              </FormControl>
              <FormMessage>{errors.nome?.message}</FormMessage>
            </FormItem>
          )}
        />

        {/* Descrição */}
        <FormField
          name="descricao"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrição</FormLabel>
              <FormControl>
                <Textarea placeholder="Descreva o evento" {...field} />
              </FormControl>
              <FormMessage>{errors.descricao?.message}</FormMessage>
            </FormItem>
          )}
        />

        {/* Endereço */}
        <FormField
          name="endereco"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Endereço</FormLabel>
              <FormControl>
                <Input placeholder="Digite o endereço do evento" {...field} />
              </FormControl>
              <FormMessage>{errors.endereco?.message}</FormMessage>
            </FormItem>
          )}
        />

        {/* Link para Compra */}
        <FormField
          name="LinkParaCompraIngresso"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Link para Compra</FormLabel>
              <FormControl>
                <Input placeholder="https://exemplo.com/ingressos" {...field} />
              </FormControl>
              <FormMessage>{errors.LinkParaCompraIngresso?.message}</FormMessage>
            </FormItem>
          )}
        />

        {/* Banner */}
        <FormItem>
          <FormLabel>Banner Principal</FormLabel>
          <FormControl>
            <Input
              type="file"
              accept="image/*"
              ref={bannerInputRef}
              onChange={handleBannerChange}
            />
          </FormControl>
          {previewBanner && (
            <div className="mt-4">
              <img
                src={previewBanner}
                alt="Preview do banner"
                className="w-full h-56 object-cover rounded mb-2"
              />
              <Button
                type="button"
                variant="destructive"
                onClick={handleRemoveBanner}
              >
                Remover
              </Button>
            </div>
          )}
        </FormItem>

        {/* Carrossel */}
        <FormItem>
          <FormLabel>Imagens do Carrossel</FormLabel>
          <FormControl>
            <Input
              type="file"
              accept="image/*"
              multiple
              ref={carouselInputRef}
              onChange={handleCarouselChange}
            />
          </FormControl>
          {carouselImages.length > 0 && (
            <Carousel className="w-full mt-4">
              <CarouselContent>
                {carouselImages.map((image, index) => (
                  <CarouselItem key={index}>
                    <Card>
                      <CardContent className="p-2">
                        <img
                          src={image}
                          alt={`Carrossel ${index}`}
                          className="h-32 w-full object-cover rounded"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRemoveCarouselImage(index)}
                        >
                          Remover
                        </Button>
                      </CardContent>
                    </Card>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
          )}
        </FormItem>

        {/* Botão de envio */}
        <Button type="submit" className="w-full">
          {isPending ? "Enviando..." : "Enviar Evento"}
        </Button>
      </form>
    </FormProvider>
  );
}
