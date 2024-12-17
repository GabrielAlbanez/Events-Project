"use client";
import React, { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { eventoSchema } from "@/schemas/eventoSchema";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { salvarEvento } from "@/app/eventos/actions";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Card, CardContent } from "@/components/ui/card";

type EventoFormData = z.infer<typeof eventoSchema>;

export default function EventoForm() {
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const carouselInputRef = useRef<HTMLInputElement | null>(null);

  const [previewBanner, setPreviewBanner] = useState<string | null>(null);
  const [selectedBanner, setSelectedBanner] = useState<File | null>(null);

  const [carouselImages, setCarouselImages] = useState<string[]>([]);
  const [selectedCarouselFiles, setSelectedCarouselFiles] = useState<File[]>([]);

  const form = useForm<EventoFormData>({
    resolver: zodResolver(eventoSchema),
    defaultValues: {
      nome: "",
      descrição: "",
      data: "",
      LinkParaCompraIngresso: "",
      banner: null || undefined,
      carrossel: [],
    },
  });

  // Função para o banner principal
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

  // Função para o carrossel de imagens
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

  const onSubmit = async (values: EventoFormData) => {
    const formData = new FormData();
    formData.append("nome", values.nome);
    formData.append("descrição", values.descrição);
    formData.append("data", values.data);
    formData.append("LinkParaCompraIngresso", values.LinkParaCompraIngresso);

    if (selectedBanner) {
      formData.append("banner", selectedBanner);
    }

    selectedCarouselFiles.forEach((file, index) => {
      formData.append("carrossel", file);
    });

    const result = await salvarEvento(formData);

    if (result.success) {
      console.log("Sucesso:", result.message);
      form.reset();
      handleRemoveBanner();
      setCarouselImages([]);
      setSelectedCarouselFiles([]);
    } else {
      console.error("Erro:", result.message);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Nome */}
        <FormField
          control={form.control}
          name="nome"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome do Evento</FormLabel>
              <FormControl>
                <Input placeholder="Digite o nome do evento" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Descrição */}
        <FormField
          control={form.control}
          name="descrição"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrição</FormLabel>
              <FormControl>
                <Textarea placeholder="Descreva o evento" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Banner Principal */}
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
                alt="Banner Preview"
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

        {/* Carrossel de Imagens */}
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
                  <CarouselItem key={index} className="basis-1/2">
                    <Card className="relative">
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
                          className="absolute top-1 right-1"
                          onClick={() => handleRemoveCarouselImage(index)}
                        >
                          Remover
                        </Button>
                      </CardContent>
                    </Card>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious type="button"/>
              <CarouselNext  type="button"/>
            </Carousel>
          )}
        </FormItem>

        {/* Link para Compra */}
        <FormField
          control={form.control}
          name="LinkParaCompraIngresso"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Link para Compra</FormLabel>
              <FormControl>
                <Input placeholder="https://exemplo.com/ingressos" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Botão de Envio */}
        <Button type="submit" className="w-full">
          Enviar Evento
        </Button>
      </form>
    </Form>
  );
}
