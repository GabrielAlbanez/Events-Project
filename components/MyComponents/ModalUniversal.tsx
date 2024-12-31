import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

interface ModalUniversalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  imageSrc: string;
  onConfirm: () => void;
}

const ModalUniversal: React.FC<ModalUniversalProps> = ({ open, onClose, title, imageSrc, onConfirm }) => {
  // Modal para telas maiores
  if (typeof window !== "undefined" && window.innerWidth >= 640) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center">
            <img src={imageSrc} alt="Preview" className="w-64 h-64 rounded-full object-cover" />
            <div className="mt-4 flex gap-4">
              <button onClick={onConfirm} className="bg-green-500 text-white py-2 px-4 rounded">
                Confirmar
              </button>
              <button onClick={onClose} className="bg-red-500 text-white py-2 px-4 rounded">
                Cancelar
              </button>
            </div>
          </div>
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
        <div className="flex flex-col items-center">
          <img src={imageSrc} alt="Preview" className="w-64 h-64 rounded-full object-cover" />
          <div className="mt-4 flex gap-4">
            <button onClick={onConfirm} className="bg-green-500 text-white py-2 px-4 rounded">
              Confirmar
            </button>
            <button onClick={onClose} className="bg-red-500 text-white py-2 px-4 rounded">
              Cancelar
            </button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default ModalUniversal;