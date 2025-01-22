"use client";
import React from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  useDisclosure,
  useDraggable,
} from "@heroui/react";
import { Evento } from "@/types";

interface ModalEventsValidateProps {
  event: Evento | null;
  isOpen: boolean;
  onClose: () => void;
  onValidate: (eventId: number) => void;
}

const ModalEventsValidate: React.FC<ModalEventsValidateProps> = ({
  event,
  isOpen,
  onClose,
  onValidate,
}) => {
  const targetRef = React.useRef(null);
  const { moveProps } = useDraggable({ targetRef, canOverflow: true, isDisabled: !isOpen });

  if (!event) return null;

  return (
    <Modal className="w-[700px] h-[500px] overflow-auto" ref={targetRef} isOpen={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalContent>
        {(closeModal) => (
          <>
            <ModalHeader {...moveProps} className="flex flex-col gap-1">
              {event.nome}
            </ModalHeader>
            <ModalBody>
              <img
                src={event.banner || "https://via.placeholder.com/150"}
                alt="Event Banner"
                className="rounded-lg mb-4 w-full h-auto"
              />
              <p>
                <strong>Description:</strong> {event.descricao}
              </p>
              <p>
                <strong>Date:</strong> {event.data}
              </p>
              <p>
                <strong>Address:</strong> {event.endereco}
              </p>
              <div className="mt-6 p-4 border rounded-lg shadow-md bg-gray-50">
                <h3 className="text-lg font-semibold mb-2">About the Creator</h3>
                <div className="flex items-center gap-4">
                  <img
                    src={event.user.image || "https://via.placeholder.com/100"}
                    alt={event.user.name}
                    className="w-20 h-20 rounded-full border object-cover"
                  />
                  <div>
                    <p className="font-medium text-gray-800">{event.user.name}</p>
                    <p className="text-sm text-gray-600">{event.user.email}</p>
                    <p className="text-sm text-gray-500">Role: {event.user.role}</p>
                  </div>
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button color="danger" variant="light" onPress={onClose}>
                Close
              </Button>
              <Button
                color="primary"
                onPress={() => {
                  onValidate(event.id);
                  closeModal();
                }}
              >
                Validate
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default ModalEventsValidate;
