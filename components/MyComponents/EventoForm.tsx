"use client";

import React, { useRef, useState, useTransition } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { salvarEvento } from "@/app/(actions)/eventos/actions";
import { DatePicker, DateRangePicker, RangeCalendar } from "@heroui/react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { socket } from "@/lib/socketClient";
import { today, getLocalTimeZone } from "@internationalized/date";
import { motion } from "framer-motion";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "../ui/carousel";
import { XCircle } from "lucide-react";

type EventoFormData = {
  nome: string;
  descricao: string;
  dataInicio: string; // Nova estrutura para range de datas
  dataFim: string;
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
      dataInicio: "",
      dataFim: "",
      LinkParaCompraIngresso: "",
      endereco: "",
    },
  });

  const { handleSubmit, reset, setValue, formState } = form;

  const { data } = useCurrentUser();
  const { errors } = formState;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const carouselInputRef = useRef<HTMLInputElement | null>(null);

  const [previewBanner, setPreviewBanner] = useState<string | null>(null);
  const [selectedBanner, setSelectedBanner] = useState<File | null>(null);
  const [carouselImages, setCarouselImages] = useState<string[]>([]);
  const [selectedCarouselFiles, setSelectedCarouselFiles] = useState<File[]>(
    []
  );

  const [selectedDateRange, setSelectedDateRange] = useState({
    start: today(getLocalTimeZone()),
    end: today(getLocalTimeZone()).add({ weeks: 1 }),
  });

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

    if (data?.id) {
      startTransition(async () => {
        try {
          const formData = new FormData();
          formData.append("nome", dataForm.nome);
          formData.append("descricao", dataForm.descricao);
          formData.append("dataInicio", selectedDateRange.start.toString());
          formData.append("dataFim", selectedDateRange.end.toString());
          formData.append(
            "LinkParaCompraIngresso",
            dataForm.LinkParaCompraIngresso
          );
          formData.append("endereco", dataForm.endereco);

          if (selectedBanner) {
            formData.append("banner", selectedBanner);
          }

          selectedCarouselFiles.forEach((file) => {
            formData.append("carrossel", file);
          });

          const result = await salvarEvento(formData, data?.id ?? ""); // Substitua pelo ID do usuário real

          if (result.success) {
            const event = formData;
            toast.success("Evento criado com sucesso!");
            socket.emit("create-event", { user: data });

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
    }
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

        {/* Intervalo de datas */}
        <FormItem>
          <FormLabel>Período do Evento</FormLabel>
          <FormControl>
            <DateRangePicker
              isRequired
              className="max-w-xs"
              defaultValue={selectedDateRange}
              label="Selecione o período"
              onChange={(value) => {
                if (value) {
                  setSelectedDateRange(value);
                }
              }}
            />
          </FormControl>
        </FormItem>

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
              <FormMessage>
                {errors.LinkParaCompraIngresso?.message}
              </FormMessage>
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
            <div className="relative">
              <Carousel opts={{ align: "start", loop: true }}>
                <CarouselContent className="-ml-4">
                  {carouselImages.map((image, index) => (
                    <CarouselItem key={index} className="pl-4 basis-1/3">
                      <div className="relative">
                        {/* Botão de exclusão */}
                        <button
                          className="absolute top-2 right-2 bg-white p-1 rounded-full shadow-md"
                          onClick={(e) => {
                            e.stopPropagation(); 
                            e.preventDefault();
                            const updatedImages = carouselImages.filter(
                              (_, i) => i !== index
                            );
                            const updatedFiles = selectedCarouselFiles.filter(
                              (_, i) => i !== index
                            );
                            setCarouselImages(updatedImages);
                            setSelectedCarouselFiles(updatedFiles);

                            // Atualiza o valor do input
                            if (carouselInputRef.current) {
                              const dataTransfer = new DataTransfer();
                              updatedFiles.forEach((file) =>
                                dataTransfer.items.add(file)
                              );
                              carouselInputRef.current.files =
                                dataTransfer.files;
                            }

                            if (updatedImages.length === 0) {
                              toast.info("Todas as imagens foram removidas.");
                            }
                          }}
                        >
                          <XCircle
                            type="button"
                            size={20}
                            className="text-red-500"
                          />
                        </button>
                        <img
                          src={image}
                          alt={`Carrossel ${index}`}
                          className="h-32 w-full object-cover rounded"
                        />
                      </div>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious type="button" />
                <CarouselNext type="button" />
              </Carousel>
            </div>
          )}
        </FormItem>
        {/* Botão de envio */}
        <Button type="submit" className=" w-full ">
          {isPending ? "Enviando..." : "Enviar Evento"}
        </Button>
      </form>
    </FormProvider>
  );
}
