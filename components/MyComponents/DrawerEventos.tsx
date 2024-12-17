"use client";
import React from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from "@/components/ui/drawer";

type DrawerEventosProps = {
  evento: {
    nome: string;
    image: string;
    descrição: string;
    data: Date;
    LinkParaCompraIngresso: string;
  };
  onClose: () => void;
};

const DrawerEventos: React.FC<DrawerEventosProps> = ({ evento, onClose }) => {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const Content = (
    <div className="p-4">
      <img
        src={evento.image}
        alt={evento.nome}
        className="w-full h-40 object-cover rounded mb-4"
      />
      <p className="mb-2">
        <strong>Data:</strong> {evento.data.toLocaleDateString()}
      </p>
      <p className="mb-4">{evento.descrição}</p>
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

  if (isDesktop) {
    // Exibe Dialog em telas maiores
    return (
      <Dialog open={!!evento} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{evento.nome}</DialogTitle>
            <DialogDescription>{evento.descrição}</DialogDescription>
          </DialogHeader>
          {Content}
        </DialogContent>
      </Dialog>
    );
  }

  // Exibe Drawer em telas menores
  return (
    <Drawer open={!!evento} onOpenChange={onClose}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{evento.nome}</DrawerTitle>
          <DrawerDescription>{evento.descrição}</DrawerDescription>
        </DrawerHeader>
        {Content}
      </DrawerContent>
    </Drawer>
  );
};

export default DrawerEventos;
