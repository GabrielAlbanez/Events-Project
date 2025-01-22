import React from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from "@heroui/react";

interface ModalUniversalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  imageSrc: string;
  onConfirm: () => void;
}

const ModalUniversal: React.FC<ModalUniversalProps> = ({
  open,
  onClose,
  title,
  imageSrc,
  onConfirm,
}) => {
  return (
    <Modal isOpen={open} onClose={onClose} className="text-center px-4 py-4" >
      <ModalContent>
        <ModalHeader className="text-medium flex items-center justify-center">
          <h2>{title}</h2>
        </ModalHeader>
        <ModalBody>
          <div className="flex flex-col items-center">
            <img
              src={imageSrc}
              alt="Preview"
              className="w-64 h-64 rounded-full object-cover"
            />
          </div>
        </ModalBody>
        <ModalFooter className="flex  gap-2 items-center justify-center">
          <Button onPress={onConfirm} className="bg-green-500 text-white">
            Confirmar
          </Button>
          <Button onPress={onClose} className="bg-red-500 text-white">
            Cancelar
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default ModalUniversal;