"use client";

import React, { useState, useEffect } from "react";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Checkbox,
  Button,
  Chip,
  Tooltip,
} from "@heroui/react";
import ModalEventsValidate from "@/components/MyComponents/ModalEventsValidate";
import { toast } from "react-toastify";
import { Evento } from "@/types";

interface TableEventsProps {
  events: Evento[];
  adminId: string;
  role?: string | null;
}

const TableEventsClient: React.FC<TableEventsProps> = ({
  events,
  adminId,
  role,
}) => {
  const [eventList, setEventList] = useState<Evento[]>(events); // Estado local dos eventos
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [selectedEvent, setSelectedEvent] = useState<Evento | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  console.log("Eventos recebidos no CardEvents:", events);

  // Atualizar estado quando eventos forem alterados
  useEffect(() => {
    setEventList(events);
  }, [events]);

  // Gerenciar seleção de eventos

  // Abrir modal para ver detalhes
  const handleSeeMore = (event: Evento) => {
    setSelectedEvent(event);
    setIsModalOpen(true);
  };

  // Fechar modal
  const handleCloseModal = () => {
    setSelectedEvent(null);
    setIsModalOpen(false);
  };

  // Caso não haja eventos para exibir
  if (eventList.length === 0) {
    return (
      <div className="flex h-[90vh] w-full items-center justify-center">
        <h1 className="text-gray-600">Nenhum evento foi criado ainda...</h1>
      </div>
    );
  }

  return (
    <div className="p-6">
      {eventList.some((event) => event.validate) ? (
        <Table aria-label="Event management table">
          <TableHeader>
            <TableColumn align="start">Nome do Evento</TableColumn>
            <TableColumn align="start">Endereço</TableColumn>
            <TableColumn align="center">Ações</TableColumn>
          </TableHeader>
          <TableBody>
            {eventList
              .filter((event) => event.validate) // Filtra apenas eventos validados
              .map((event) => (
                <TableRow key={event.id}>
                  {/* Nome do evento */}
                  <TableCell>{event.nome}</TableCell>
                  {/* Endereço do evento */}
                  <TableCell>{event.endereco}</TableCell>
                  {/* Ações individuais */}
                  <TableCell align="center">
                    <div className="flex gap-2 justify-center">
                      <Tooltip content="Ver Detalhes">
                        <Button
                          color="primary"
                          size="sm"
                          onPress={() => handleSeeMore(event)}
                        >
                          Detalhes
                        </Button>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      ) : (
        <div className="text-center text-gray-500 text-lg">
          Nenhum evento validado disponível.
        </div>
      )}

      {selectedEvent && (
        <ModalEventsValidate
          event={selectedEvent}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          role={role}
        />
      )}
    </div>
  );
};

export default TableEventsClient;
