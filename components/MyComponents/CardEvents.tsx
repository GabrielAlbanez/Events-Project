"use client";

import React, { useState } from "react";
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
import { validateEvents } from "@/app/(actions)/validateEvents/action";
import { deleteEvents } from "@/app/(actions)/deleteEvents/action";

interface TableEventsProps {
  events: Evento[];
  adminId: string; // ID do administrador para as ações
}

const TableEvents: React.FC<TableEventsProps> = ({
  events: initialEvents,
  adminId,
}) => {
  const [events, setEvents] = useState<Evento[]>(initialEvents);
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [selectedEvent, setSelectedEvent] = useState<Evento | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Gerenciar seleção de eventos
  const handleSelectEvent = (eventId: string) => {
    setSelectedEvents((prev) => {
      const updated = new Set(prev);
      if (updated.has(eventId)) {
        updated.delete(eventId);
      } else {
        updated.add(eventId);
      }
      return updated;
    });
  };

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

  // Validar eventos selecionados
  const handleValidateSelected = async () => {
    const selectedEventIds = Array.from(selectedEvents);

    // Filtrar eventos já validados
    const unvalidatedEventIds = selectedEventIds.filter((id) => {
      const event = events.find((e) => e.id === id);
      return event && !event.validate;
    });

    if (unvalidatedEventIds.length === 0) {
      toast.warning("Nenhum evento não validado foi selecionado.");
      return;
    }

    toast.promise(
      validateEvents(unvalidatedEventIds, adminId)
        .then((response) => {
          // Atualize os eventos localmente
          setEvents((prev) =>
            prev.map((event) =>
              unvalidatedEventIds.includes(event.id)
                ? { ...event, validate: true }
                : event
            )
          );
          setSelectedEvents(new Set()); // Limpe a seleção
          return response.message; // Retorna a mensagem para o toast
        })
        .catch((error) => {
          console.error("Erro ao validar eventos:", error);
          throw new Error("Erro ao validar eventos.");
        }),
      {
        pending: "Validando eventos...",
        success: "🎉 evento verificado",
        error: "❌ erro ao verificar evento",
      }
    );
  };

  // Deletar eventos selecionados
  const handleDeleteSelected = async () => {
    const selectedEventIds = Array.from(selectedEvents);

    if (selectedEventIds.length === 0) {
      toast.warning("Selecione ao menos um evento para excluir.");
      return;
    }

    toast.promise(
      deleteEvents(selectedEventIds, adminId)
        .then((response) => {
          // Atualize os eventos localmente
          setEvents((prev) =>
            prev.filter((event) => !selectedEventIds.includes(event.id))
          );
          setSelectedEvents(new Set()); // Limpe a seleção
          return response.message; // Retorna a mensagem para o toast
        })
        .catch((error) => {
          console.error("Erro ao excluir eventos:", error);
          throw new Error("Erro ao excluir eventos.");
        }),
      {
        pending: "Excluindo eventos...",
        success: "🎉 Evento excluido com sucesso",
        error: "❌ erro ao exluir evento",
      }
    );
  };

  if(events.length == 0)return <div className="flex h-full items-center justify-center"><h1 className="text-gray-600">Nenhum evento foi criado ainda...</h1></div>
  return (
    
    <div className="p-6">
      {/* Botões para ações em massa */}
      {selectedEvents.size > 0 && (
        <div className="flex items-center mb-6">
          <Button
            color="success"
            onClick={handleValidateSelected}
            className="mr-4"
          >
            Validate Selected ({selectedEvents.size})
          </Button>
          <Button color="danger" onClick={handleDeleteSelected}>
            Delete Selected ({selectedEvents.size})
          </Button>
        </div>
      )}

      <Table aria-label="Event management table">
        <TableHeader>
          <TableColumn align="start">Select</TableColumn>
          <TableColumn align="start">Event Name</TableColumn>
          <TableColumn align="start">Address</TableColumn>
          <TableColumn align="center">Status</TableColumn>
          <TableColumn align="center">Actions</TableColumn>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow key={event.id}>
              {/* Checkbox para seleção */}
              <TableCell>
                <Checkbox
                  isSelected={selectedEvents.has(event.id)}
                  onValueChange={() => handleSelectEvent(event.id)}
                  aria-label={`Select ${event.nome}`}
                />
              </TableCell>
              {/* Nome do evento */}
              <TableCell>{event.nome}</TableCell>
              {/* Endereço do evento */}
              <TableCell>{event.endereco}</TableCell>
              {/* Status de verificação */}
              <TableCell align="center">
                <Chip
                  color={event.validate ? "success" : "warning"}
                  size="sm"
                  variant="flat"
                >
                  {event.validate ? "Validated" : "Not validated"}
                </Chip>
              </TableCell>
              {/* Ações individuais */}
              <TableCell align="center">
                <div className="flex gap-2 justify-center">
                  <Tooltip content="See More">
                    <Button
                      color="primary"
                      size="sm"
                      onClick={() => handleSeeMore(event)}
                    >
                      Details
                    </Button>
                  </Tooltip>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Modal para detalhes do evento */}
      {selectedEvent && (
        <ModalEventsValidate
          event={selectedEvent}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
};

export default TableEvents;
