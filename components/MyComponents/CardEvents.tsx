"use client";

import { Evento } from "@/types";
import { Button } from "@heroui/button";
import { Card, CardFooter, CardBody } from "@heroui/card";
import { Image } from "@heroui/react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalContent,
} from "@heroui/modal";
import { useState } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { CheckCheck, XCircle,  } from "lucide-react"; // Ícones de validação

interface CardEventsProps {
  events: Evento[];
  adminId: string;
}

const CardEvents: React.FC<CardEventsProps> = ({ events }) => {
  const [selectedEvent, setSelectedEvent] = useState<Evento | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedDescriptions, setExpandedDescriptions] = useState<{
    [key: string]: boolean;
  }>({});

  // 🟢 Log para verificar os eventos recebidos
  console.log("📡 Eventos recebidos:", events);

  // Log individual de cada evento
  events.forEach((event) => {
    console.log(
      `📢 Evento: ${event.nome}, ID: ${event.id}, Validator:`,
      event.validator
    );
  });

  const toggleDescription = (eventId: string) => {
    setExpandedDescriptions((prev) => ({
      ...prev,
      [eventId]: !prev[eventId],
    }));
  };

  const openModal = (event: Evento) => {
    console.log("🔎 Evento selecionado para modal:", event); // Log do evento no modal
    setSelectedEvent(event);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setSelectedEvent(null);
    setIsModalOpen(false);
  };

  return (
    <div className="flex flex-wrap justify-center gap-8 text-gray-500">
      {events.map((event) => {
        const isExpanded = expandedDescriptions[event.id] || false;
        const maxDescriptionLength = 100; // Limite de caracteres

        return (
          <Card
            key={event.id}
            className="relative w-[320px] h-[350px] rounded-lg shadow-md transition-transform transform hover:scale-105 hover:shadow-xl overflow-hidden bg-white"
          >
            {/* Ícone de status (Check ou X) no canto superior direito */}
            <div className="absolute top-2 right-2 z-30 bg-white p-1 rounded-full shadow-md">
              {event.validate ? (
                <CheckCheck size={24} className="text-green-500" />
              ) : (
                <XCircle size={24} className="text-red-500" />
              )}
            </div>

            {/* Banner */}
            <Image
              alt={event.nome}
              className="w-[320px] h-[200px] object-cover rounded-t-lg"
              src={event.banner}
            />

            <CardBody className="p-4">
              <h4 className="font-bold text-lg truncate">{event.nome}</h4>
              <p className="text-sm text-gray-500">
                {isExpanded
                  ? event.descricao
                  : event.descricao.length > maxDescriptionLength
                  ? `${event.descricao.substring(0, maxDescriptionLength)}...`
                  : event.descricao}{" "}
                {event.descricao.length > maxDescriptionLength && (
                  <button
                    onClick={() => toggleDescription(event.id)}
                    className="text-blue-500 hover:underline text-sm inline"
                  >
                    {isExpanded ? "Ver menos" : "Ver mais"}
                  </button>
                )}
              </p>
            </CardBody>

            <CardFooter className="flex justify-between items-center p-4 border-t border-gray-200">
              <p className="text-sm text-gray-500 flex  items-start gap-1  ">

                {event.dataInicio ? event.dataInicio : "Não definida"} -{" "}
                {event.dataFim ? event.dataFim : "Não definida"}
              </p>
              <Button
                radius="full"
                size="sm"
                className="bg-blue-600 text-white"
                onClick={() => openModal(event)}
              >
                Ver Detalhes
              </Button>
            </CardFooter>
          </Card>
        );
      })}

      {/* Modal com informações detalhadas e carrossel */}
      {isModalOpen && selectedEvent && (
        <Modal
          isOpen={isModalOpen}
          onClose={closeModal}
          className="w-[600px] h-[500px] font-sans bg-white rounded-lg shadow-lg flex items-center justify-center flex-col gap-6"
        >
          <ModalContent>
            <ModalHeader>
              <h2 className="text-xl font-semibold">{selectedEvent.nome}</h2>
            </ModalHeader>
            <ModalBody className="overflow-y-auto max-h-[80vh]">
              {/* Banner do evento */}
              <div className="relative w-full h-[350px] rounded-lg overflow-hidden">
                <Image
                  alt="Banner do evento"
                  src={selectedEvent.banner}
                  className="w-full h-full object-cover rounded-lg"
                />
              </div>

              {/* Carrossel de imagens */}
              <div className="w-full flex justify-center items-center">
                {selectedEvent.carrossel.length > 0 ? (
                  <Carousel className="relative w-full max-w-[600px] mx-auto">
                    <CarouselContent className="flex items-center">
                      {selectedEvent.carrossel.map((img, index) => (
                        <CarouselItem key={index} className="w-full">
                          <div className="w-full h-[300px] flex items-center justify-center overflow-hidden rounded-lg">
                            <Image
                              alt={`Imagem ${index + 1} do evento`}
                              className="w-full h-full object-cover"
                              src={img}
                            />
                          </div>
                        </CarouselItem>
                      ))}
                    </CarouselContent>
                    <CarouselPrevious className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-gray-800 text-white rounded-full" />
                    <CarouselNext className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-gray-800 text-white rounded-full" />
                  </Carousel>
                ) : (
                  <p className="text-center text-gray-500">
                    Sem imagens disponíveis
                  </p>
                )}
              </div>

              {/* Informações detalhadas */}
              <div className="mt-4 space-y-2">
                <p>
                  <span className="font-semibold">Descrição:</span>{" "}
                  {selectedEvent.descricao}
                </p>
                <p>
                  <span className="font-semibold">Data:</span>{" "}
                  {selectedEvent.dataInicio ? selectedEvent.dataInicio : "Não definida"} -{" "}
                  {selectedEvent.dataFim ? selectedEvent.dataFim : "Não definida"}
                </p>
                <p>
                  <span className="font-semibold">Endereço:</span>{" "}
                  {selectedEvent.endereco}
                </p>
              </div>

              {/* Criador do Evento */}
              {selectedEvent.validate && (
                <div className="mt-6 p-4 border rounded-lg shadow-md bg-gray-50">
                  <h3 className="text-lg font-semibold mb-2">Validado por</h3>
                  <div className="flex items-center gap-4">
                    <img
                      src={
                        selectedEvent.validator?.image ||
                        "https://via.placeholder.com/100"
                      }
                      alt={selectedEvent.validator?.name}
                      className="w-20 h-20 rounded-full border object-cover"
                    />
                    <div>
                      <p className="font-medium text-gray-800">
                        {selectedEvent.validator?.name}
                      </p>
                      <p className="text-sm text-gray-600">
                        {selectedEvent.validator?.email}
                      </p>
                      <p className="text-sm text-gray-500">
                        Role: {selectedEvent.validator?.role}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </ModalBody>
          </ModalContent>
        </Modal>
      )}
    </div>
  );
};

export default CardEvents;
