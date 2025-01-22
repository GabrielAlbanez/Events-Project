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
import { Evento } from "@/types";



interface TableEventsProps {
  events: Evento[];
  onDeleteEvents: (eventIds: number[]) => void;
  onValidateEvents: (eventIds: number[]) => void;
}

const TableEvents: React.FC<TableEventsProps> = ({
  events,
  onDeleteEvents,
  onValidateEvents,
}) => {
  const [selectedEvents, setSelectedEvents] = useState<Set<number>>(new Set());
  const [selectedEvent, setSelectedEvent] = useState<Evento | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Gerenciar seleção de eventos
  const handleSelectEvent = (eventId: number) => {
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
  const handleValidateSelected = () => {
    const selectedEventIds = Array.from(selectedEvents);
    onValidateEvents(selectedEventIds);
    setSelectedEvents(new Set());
  };

  // Deletar eventos selecionados
  const handleDeleteSelected = () => {
    const selectedEventIds = Array.from(selectedEvents);
    onDeleteEvents(selectedEventIds);
    setSelectedEvents(new Set());
  };

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
                  <Tooltip color="danger" content="Delete">
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
