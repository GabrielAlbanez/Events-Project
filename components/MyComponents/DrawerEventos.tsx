"use client";
import React, { useState } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { GoogleMap, DirectionsRenderer } from "@react-google-maps/api";
import {
  Drawer as NextUIDrawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  Button,
  Image,
} from "@nextui-org/react";
import {
  Drawer as ShadDrawer,
  DrawerContent as ShadDrawerContent,
  DrawerHeader as ShadDrawerHeader,
  DrawerTitle as ShadDrawerTitle,
} from "@/components/ui/drawer";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

type DrawerEventosProps = {
  evento: {
    nome: string;
    banner: string;
    carrossel: string[];
    descrição: string;
    data: Date;
    LinkParaCompraIngresso: string;
    lat: number;
    lng: number;
  };
  onClose: () => void;
  onTraceRoute: () => void;
  isRouteTracing: boolean;
};

const DrawerEventos: React.FC<DrawerEventosProps> = ({
  evento,
  onClose,
  onTraceRoute,
  isRouteTracing,
}) => {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [directions, setDirections] =
    useState<google.maps.DirectionsResult | null>(null);

  const Content = (
    <>
      {/* Banner */}
      <div className="mb-6">
        <Image
          alt="Banner Principal"
          className="rounded-lg shadow-lg"
          src={evento.banner}
        />
      </div>

      {/* Carrossel */}
      {evento.carrossel.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2">Galeria de Imagens</h3>
          <Carousel className="w-full">
            <CarouselContent>
              {evento.carrossel.map((image, index) => (
                <CarouselItem key={index} className="basis-full">
                  <div className="w-full h-40 flex items-center justify-center">
                    <img
                      src={image}
                      alt={`Imagem ${index}`}
                      className="w-full h-full object-cover rounded-lg shadow-md"
                    />
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        </div>
      )}

      {/* Descrição */}
      <p className="mb-2 text-sm">
        <strong>Data:</strong> {evento.data.toLocaleDateString()}
      </p>
      <p className="mb-4 text-sm">{evento.descrição}</p>

      {/* Botões de ação */}
      <div>
        <Button className="w-full mb-2" onPress={onTraceRoute}>
          Traçar Rota
        </Button>
      </div>
      <a
        href={evento.LinkParaCompraIngresso}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Button className="w-full mb-2">Comprar Ingressos</Button>
      </a>

      {/* Mapa para traçar rota */}
      {directions && (
        <div className="mt-4">
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "400px" }}
            center={{ lat: evento.lat, lng: evento.lng }}
            zoom={14}
          >
            <DirectionsRenderer directions={directions} />
          </GoogleMap>
        </div>
      )}
    </>
  );

  if (isDesktop) {
    // Drawer do NextUI para Desktop
    return (
      <NextUIDrawer
        isOpen={!!evento}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        backdrop="blur"
        classNames={{
          base: "data-[placement=right]:sm:m-2 data-[placement=left]:sm:m-2 rounded-medium",
        }}
      >
        <DrawerContent>
          <DrawerHeader className="flex flex-col items-start">
            <h1 className="text-2xl font-bold">{evento.nome}</h1>
          </DrawerHeader>
          <DrawerBody className="pt-4">{Content}</DrawerBody>
        </DrawerContent>
      </NextUIDrawer>
    );
  } else {
    // Drawer do Shadcn UI para Mobile
    return (
      <NextUIDrawer
        isOpen={!!evento}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        placement="bottom"
        backdrop="blur"
        classNames={{
          base: "data-[placement=right]:sm:m-2 data-[placement=left]:sm:m-2 rounded-medium",
        }}
      >
        <DrawerContent>
          <DrawerHeader className="flex flex-col items-start">
            <h1 className="text-2xl font-bold">{evento.nome}</h1>
          </DrawerHeader>
          <DrawerBody className="pt-4">{Content}</DrawerBody>
        </DrawerContent>
      </NextUIDrawer>
    );
  }
};

export default DrawerEventos;
