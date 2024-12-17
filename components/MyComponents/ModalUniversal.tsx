"use client";
import React, { ReactNode } from "react";
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

type ModalUniversalProps = {
  title: string; // Título do modal
  body: ReactNode; // Conteúdo principal do modal
  footer?: ReactNode; // Conteúdo do rodapé (botões ou ações)
  open: boolean; // Estado aberto/fechado do modal
  onClose: () => void; // Fechar o modal
};

const ModalUniversal: React.FC<ModalUniversalProps> = ({
  title,
  body,
  footer,
  open,
  onClose,
}) => {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const Content = (
    <div className="p-4 space-y-4">
      {/* Body */}
      <div>{body}</div>

      {/* Footer */}
      {footer && <div className="flex gap-4 justify-end">{footer}</div>}
    </div>
  );

  // Dialog para telas maiores
  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {Content}
        </DialogContent>
      </Dialog>
    );
  }

  // Drawer para telas menores
  return (
    <Drawer open={open} onOpenChange={onClose}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        {Content}
      </DrawerContent>
    </Drawer>
  );
};

export default ModalUniversal;
