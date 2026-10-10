import React from "react";
import { ProfileAvatar } from "./ProfileAvatar";
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
  pending?: boolean;
  error?: string;
}

const ModalUniversal: React.FC<ModalUniversalProps> = ({
  open,
  onClose,
  title,
  imageSrc,
  onConfirm,
  pending = false,
  error = "",
}) => {
  return (
    <Modal isOpen={open} onClose={onClose} isDismissable={!pending} isKeyboardDismissDisabled={pending} hideCloseButton={pending} className="text-center px-4 py-4" >
      <ModalContent>
        <ModalHeader className="text-medium flex items-center justify-center">
          <h2>{title}</h2>
        </ModalHeader>
        <ModalBody>
          <div className="flex flex-col items-center">
            <ProfileAvatar src={imageSrc} name="Você" label="Prévia da foto escolhida" size={256} className="w-64 h-64 rounded-full object-cover" />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {pending && <p role="status" className="text-sm text-muted-foreground">Enviando e salvando sua foto…</p>}
        </ModalBody>
        <ModalFooter className="flex  gap-2 items-center justify-center">
          <Button onPress={onConfirm} isLoading={pending} isDisabled={pending} className="bg-primary text-primary-foreground">
            {error ? "Tentar novamente" : "Confirmar foto"}
          </Button>
          <Button onPress={onClose} isDisabled={pending} variant="bordered">
            Cancelar
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default ModalUniversal;
