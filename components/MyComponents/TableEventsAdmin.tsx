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
import { validateEvents } from "@/app/(actions)/validateEvents/action";
import { deleteEvents } from "@/app/(actions)/deleteEvents/action";
import { useSocket } from "@/context/SocketContext";
import { solicitarCorrecao } from "@/app/(actions)/eventos/actions";
import { eventStatusLabels, type EventStatus } from "@/types/features";

interface TableEventsProps {
  events: Evento[];
  adminId: string;
  role?: string | null;
}

const TableEventsAdmin: React.FC<TableEventsProps> = ({
  events,
  adminId,
  role,
}) => {
  const [eventList, setEventList] = useState<Evento[]>(events); // Estado local dos eventos
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [selectedEvent, setSelectedEvent] = useState<Evento | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [correctionEvent, setCorrectionEvent] = useState<Evento | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");
  const [isCorrecting, setIsCorrecting] = useState(false);
  const socket = useSocket();


  // Atualizar estado quando eventos forem alterados
  useEffect(() => {
    setEventList(events);
  }, [events]);

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

  // Validar eventos selecionados e atualizar a lista
  const handleValidateSelected = async () => {
    const selectedEventIds = Array.from(selectedEvents);

    // Filtrar eventos já validados
    const unvalidatedEventIds = selectedEventIds.filter((id) => {
      const event = eventList.find((e) => e.id === id);
      return event?.status === "PENDING";
    });

    if (unvalidatedEventIds.length === 0) {
      toast.warning("Selecione ao menos um evento em análise.");
      return;
    }

    toast.promise(
      validateEvents(unvalidatedEventIds, adminId)
        .then((result) => {
          if (result.status !== "success") throw new Error(result.message);
          // Atualiza localmente o estado dos eventos sem precisar refetch
          setEventList((prev) =>
            prev.map((event) =>
              (result.validatedEventIds ?? []).includes(event.id)
                ? { ...event, validate: true, status: "PUBLISHED" }
                : event
            )
          );

          setSelectedEvents(new Set()); // Limpar seleção após validação
          socket.emit("events-changed", { validatedEventIds: result.validatedEventIds });
        })
        .catch((error) => {
          console.error("Erro ao validar eventos:", error);
          throw new Error("Erro ao validar eventos.");
        }),
      {
        pending: "Validando eventos...",
        success: "🎉 Evento verificado",
        error: "❌ Erro ao verificar evento",
      }
    );
  };

  const handleRequestCorrection = async () => {
    if (!correctionEvent || !correctionReason.trim()) return;
    setIsCorrecting(true);
    try {
      const result = await solicitarCorrecao(correctionEvent.id, correctionReason.trim());
      if (!result.success) { toast.error(result.message); return; }
      setEventList((list) => list.map((event) => event.id === correctionEvent.id ? { ...event, status: "CHANGES_REQUESTED", reviewNote: correctionReason.trim() } : event));
      setSelectedEvents((selected) => { const next = new Set(selected); next.delete(correctionEvent.id); return next; });
      socket.emit("events-changed");
      toast.success("Pedido de correção enviado ao promotor.");
      setCorrectionEvent(null);
      setCorrectionReason("");
    } catch { toast.error("Não foi possível solicitar a correção."); }
    finally { setIsCorrecting(false); }
  };

  // Deletar eventos selecionados e remover da lista
  const handleDeleteSelected = async () => {
    const selectedEventIds = Array.from(selectedEvents);

    if (selectedEventIds.length === 0) {
      toast.warning("Selecione ao menos um evento para excluir.");
      return;
    }

    toast.promise(
      deleteEvents(selectedEventIds, adminId)
        .then((result) => {
          if (result.status !== "success") throw new Error(result.message);
          // Remove eventos deletados da lista local
          setEventList((prev) =>
            prev.filter((event) => !selectedEventIds.includes(event.id))
          );

          setSelectedEvents(new Set()); // Limpar seleção após deletar
          socket.emit("events-changed");
        })
        .catch((error) => {
          console.error("Erro ao excluir eventos:", error);
          throw new Error("Erro ao excluir eventos.");
        }),
      {
        pending: "Excluindo eventos...",
        success: "🎉 Evento excluído com sucesso",
        error: "❌ Erro ao excluir evento",
      }
    );
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
      {/* Botões para ações em massa */}
      {selectedEvents.size > 0 && (
        <div className="flex items-center mb-6">
          <Button
            color="success"
            onClick={handleValidateSelected}
            className="mr-4"
          >
            Publicar selecionados ({selectedEvents.size})
          </Button>
          <Button color="danger" onClick={handleDeleteSelected}>
            Excluir Selecionados ({selectedEvents.size})
          </Button>
        </div>
      )}

      <Table aria-label="Event management table">
        <TableHeader>
          <TableColumn align="start">Selecionar</TableColumn>
          <TableColumn align="start">Nome do Evento</TableColumn>
          <TableColumn align="start">Endereço</TableColumn>
          <TableColumn align="center">Status</TableColumn>
          <TableColumn align="center">Ações</TableColumn>
        </TableHeader>
        <TableBody>
          {eventList.map((event) => (
            <TableRow key={event.id}>
              {/* Checkbox para seleção */}
              <TableCell>
                <Checkbox
                  isSelected={selectedEvents.has(event.id)}
                  isDisabled={event.status !== "PENDING"}
                  onValueChange={() => handleSelectEvent(event.id)}
                  aria-label={`Selecionar ${event.nome}`}
                />
              </TableCell>
              {/* Nome do evento */}
              <TableCell>{event.nome}</TableCell>
              {/* Endereço do evento */}
              <TableCell>{event.endereco}</TableCell>
              {/* Status de verificação */}
              <TableCell align="center">
                <Chip
                  color={event.status === "PUBLISHED" ? "success" : event.status === "CHANGES_REQUESTED" ? "danger" : "warning"}
                  size="sm"
                  variant="flat"
                >
                  {eventStatusLabels[(event.status ?? "PENDING") as EventStatus] ?? "Em análise"}
                </Chip>
              </TableCell>
              {/* Ações individuais */}
              <TableCell align="center">
                <div className="flex gap-2 justify-center">
                  <Tooltip content="Ver Detalhes">
                    <Button
                      color="primary"
                      size="sm"
                      onClick={() => handleSeeMore(event)}
                    >
                      Detalhes
                    </Button>
                  </Tooltip>
                  {event.status === "PENDING" && <Button size="sm" variant="flat" color="warning" onClick={() => { setCorrectionEvent(event); setCorrectionReason(""); }}>Pedir correção</Button>}
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
          role={role}
        />
      )}
      {correctionEvent && <div role="dialog" aria-modal="true" aria-labelledby="correction-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-xl"><h2 id="correction-title" className="text-xl font-semibold">Solicitar correção</h2><p className="mt-2 text-sm text-muted-foreground">Explique ao promotor o que precisa mudar em “{correctionEvent.nome}”.</p><label htmlFor="correction-reason" className="mt-5 block text-sm font-medium">Motivo</label><textarea id="correction-reason" value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} rows={5} maxLength={1000} className="mt-2 w-full rounded-xl border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" placeholder="Ex.: Atualize o endereço e inclua o horário de início." /><div className="mt-5 flex justify-end gap-2"><Button variant="flat" onClick={() => setCorrectionEvent(null)} disabled={isCorrecting}>Voltar</Button><Button color="primary" onClick={() => void handleRequestCorrection()} disabled={isCorrecting || correctionReason.trim().length < 5}>{isCorrecting ? "Enviando..." : "Enviar pedido"}</Button></div></div></div>}
    </div>
  );
};

export default TableEventsAdmin;
