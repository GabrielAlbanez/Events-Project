"use client";
import React from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
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
  };
  onClose: () => void;
};

const DrawerEventos: React.FC<DrawerEventosProps> = ({ evento, onClose }) => {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const Content = (
    <div className="p-4 h-[500px] overflow-y-auto overflow-x-hidden">
      {/* Banner Principal */}
      <div className="w-full mb-6">
        <img
          src={evento.banner}
          alt="Banner Principal"
          className="w-full h-64 object-cover rounded-lg shadow-lg"
        />
      </div>

      {/* Carrossel de Imagens */}
      {evento.carrossel.length > 0 && (
        <div className="w-full mb-6">
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
            <CarouselPrevious />
            <CarouselNext />
          </Carousel>
        </div>
      )}

      {/* Detalhes do Evento */}
      <p className="mb-2 text-sm">
        <strong>Data:</strong> {evento.data.toLocaleDateString()}
      </p>
      <p className="mb-4 text-sm">{evento.descrição}</p>
      <a
        href={evento.LinkParaCompraIngresso}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Button className="w-full mb-2">Comprar Ingressos</Button>
      </a>
      <Button variant="outline" className="w-full" onClick={onClose}>
        Fechar
      </Button>
    </div>
  );

  // Dialog para Desktop
  if (isDesktop) {
    return (
      <Dialog open={!!evento} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">{evento.nome}</DialogTitle>
          </DialogHeader>
          {Content}
        </DialogContent>
      </Dialog>
    );
  }

  // Drawer para Mobile
  return (
    <Drawer open={!!evento} onOpenChange={onClose}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="text-lg font-semibold">{evento.nome}</DrawerTitle>
        </DrawerHeader>
        {Content}
      </DrawerContent>
    </Drawer>
  );
};

export default DrawerEventos;
