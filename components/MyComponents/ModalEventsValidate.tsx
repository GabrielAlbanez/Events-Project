"use client";
import React from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Image,
} from "@nextui-org/react";
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
  if (!event) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalHeader>
        <h2>{event.nome}</h2>
      </ModalHeader>
      <ModalBody>
        <Image
          src={event.user.image || "https://via.placeholder.com/150"}
          alt={`${event.user.name}'s profile`}
          className="rounded-full mb-4"
          width={100}
          height={100}
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
        <p>
          <strong>Created by:</strong> {event.user.name} ({event.user.email})
        </p>
        <p>
          <strong>Role:</strong> {event.user.role}
        </p>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" onClick={onClose}>
          Close
        </Button>
        <Button color="primary" onClick={() => onValidate(event.id)}>
          Validate
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default ModalEventsValidate;
