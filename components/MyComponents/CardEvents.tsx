"use client";
import React, { useState } from "react";
import { Evento } from "@/types";
import { Card, CardFooter } from "@heroui/card";
import { Button } from "@heroui/button";
import ModalEventsValidate from "@/components/MyComponents/ModalEventsValidate";
import { Image } from "@heroui/react";

interface CardEventsProps {
  events: Evento[];
}

const CardEvents: React.FC<CardEventsProps> = ({ events }) => {
  const [selectedEvent, setSelectedEvent] = useState<Evento | null>(null); // Evento selecionado
  const [isModalOpen, setIsModalOpen] = useState(false); // Controle do modal

  // Abrir o modal
  const handleSeeMore = (event: Evento) => {
    console.log("Abrindo modal para o evento:", event);
    setSelectedEvent(event); // Define o evento selecionado
    setIsModalOpen(true); // Abre o modal
  };

  // Fechar o modal
  const handleCloseModal = () => {
    setSelectedEvent(null); // Limpa o evento selecionado
    setIsModalOpen(false); // Fecha o modal
  };

  // Validar o evento
  const handleValidateEvent = (eventId: number) => {
    console.log(`Validando evento com ID: ${eventId}`);
    setIsModalOpen(false); // Fecha o modal após a validação
  };

  return (
    <>
      <div className="flex p-12">
        {events.map((event) => (
          <Card
            key={event.id}
            isFooterBlurred
            className="w-[400px] h-[200px] col-span-12 sm:col-span-5"
          >
            <Image
              removeWrapper
              alt={event.nome}
              className="z-0 w-full h-full scale-125 -translate-y-6 object-cover"
              src={event.banner}
            />
            <CardFooter className="absolute bg-white/30 bottom-0 border-t-1 border-zinc-100/50 z-10 justify-between">
              <div>
                <p className="text-black text-tiny">{event.nome}</p>
              </div>
              <div className="flex gap-4">
                <Button
                  className="text-tiny"
                  color="primary"
                  radius="full"
                  size="sm"
                  onClick={() => handleSeeMore(event)} // Corrigido para onClick
                >
                  See More
                </Button>
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Modal */}
      <ModalEventsValidate
        event={selectedEvent}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onValidate={handleValidateEvent}
      />
    </>
  );
};

export default CardEvents;
