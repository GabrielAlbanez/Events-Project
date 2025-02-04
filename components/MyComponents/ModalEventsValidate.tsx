"use client";
import React, { useState } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  useDraggable,
  Tooltip,
} from "@heroui/react";
import { Evento } from "@/types";
import { TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";


interface ModalEventsValidateProps {
  event: Evento | null;
  isOpen: boolean;
  onClose: () => void;
  role?: string | null;
}

const ModalEventsValidate: React.FC<ModalEventsValidateProps> = ({
  event,
  isOpen,
  onClose,
  role,
}) => {
  const targetRef = React.useRef(null);
  const { moveProps } = useDraggable({
    targetRef,
    canOverflow: true,
    isDisabled: !isOpen,
  });

  const [showFullDescription, setShowFullDescription] = useState(false);

  if (!event) return null;
  if (!event.user)
    return (
      <>
        <p>carregando...</p>
      </>
    );

  const toggleDescription = () => setShowFullDescription(!showFullDescription);
  const router = useRouter(); 


  // Definir o tamanho limite da descrição antes de encurtá-la
  const maxDescriptionLength = 100;


  const handleOpenMap = () => {
    if (!event.endereco) {
      alert("Endereço do evento não encontrado.");
      return;
    }

    const encodedAddress = encodeURIComponent(event.endereco);
    
    // Redireciona para a página principal com o endereço na URL
    router.push(`/?endereco=${encodedAddress}`);
  };

  return (
    <Modal
      className="w-[500px] h-[500px] overflow-auto"
      ref={targetRef}
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ModalContent>
        {(closeModal) => (
          <>
            <ModalHeader {...moveProps} className="flex flex-col gap-1">
              {event.nome}
            </ModalHeader>
            <ModalBody>
              {/* Banner */}
              <img
                src={event.banner || "https://via.placeholder.com/150"}
                alt="Event Banner"
                className="rounded-lg w-full h-auto"
              />

              {/* Descrição com truncamento */}
              <p className="mt-2">
                <strong>Descrição:</strong>{" "}
                {showFullDescription
                  ? event.descricao
                  : event.descricao.length > maxDescriptionLength
                  ? `${event.descricao.substring(0, maxDescriptionLength)}...`
                  : event.descricao}
                {/* Botão de "Ver mais" */}
                {event.descricao.length > maxDescriptionLength && (
                  <button
                    onClick={toggleDescription}
                    className="text-blue-500 hover:underline text-sm"
                  >
                    {showFullDescription ? "Ver menos" : "Ver mais"}
                  </button>
                )}
              </p>

              <p>
                <span className="font-medium text-small text-default-500">
                  Data:
                </span>{" "}
                {event.dataInicio ? event.dataInicio : "Não definida"} -{" "}
                {event.dataFim ? event.dataFim : "Não definida"}
              </p>
              <p>
                <strong>Endereço:</strong> {event.endereco}
              </p>

              {/* Criador do Evento */}
              {role === "ADMIN" && (
                <div className="mt-6 p-4 border rounded-lg shadow-md ">
                  <h3 className="text-lg font-semibold mb-2">
                    Sobre o Criador
                  </h3>
                  <div className="flex items-center gap-4">
                    <img
                      src={
                        event.user.image || "https://via.placeholder.com/100"
                      }
                      alt={event.user.name}
                      className="w-20 h-20 rounded-full border object-cover"
                    />
                    <div>
                      <p className="font-medium ">{event.user.name}</p>
                      <p className="text-sm ">{event.user.email}</p>
                      <p className="text-sm ">Role: {event.user.role}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-4 items-start justify-center">

              </div>
            </ModalBody>
            <ModalFooter className="flex items-center justify-between">
            <Tooltip content="see it on the map">
                  <Button   variant="light" className="" onPress={handleOpenMap}><TrendingUp size={20} className="text-current"  /></Button>
                </Tooltip>
              <Button color="danger" variant="light" onPress={onClose}>
                Fechar
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default ModalEventsValidate;
