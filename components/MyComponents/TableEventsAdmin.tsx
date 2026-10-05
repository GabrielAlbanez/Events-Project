"use client";

import React, { useState, useEffect, useRef } from "react";
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
import { ConfirmAction } from "./ConfirmAction";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
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
  const [isDeleting, setIsDeleting] = useState(false);
  const correctionLock = useRef(false);
  const socket = useSocket();


  // Atualizar estado quando eventos forem alterados
  useEffect(() => {
    setEventList(events);
    setSelectedEvents((selected) => new Set(events.filter((event) => selected.has(event.id)).map((event) => event.id)));
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

  const selectedPendingCount = eventList.filter((event) => selectedEvents.has(event.id) && event.status === "PENDING").length;

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
    if (!correctionEvent || !correctionReason.trim() || correctionLock.current) return;
    correctionLock.current = true;
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
    finally { correctionLock.current = false; setIsCorrecting(false); }
  };

  // Deletar eventos selecionados e remover da lista
  const handleDeleteSelected = async () => {
    const selectedEventIds = Array.from(selectedEvents);

    if (selectedEventIds.length === 0) {
      toast.warning("Selecione ao menos um evento para excluir.");
      return;
    }

    if (isDeleting) return false;
    setIsDeleting(true);
    try {
      const result = await deleteEvents(selectedEventIds, adminId);
      if (result.status !== "success") { toast.error(result.message); return false; }
      setEventList(list => list.filter(event => !selectedEventIds.includes(event.id)));
      setSelectedEvents(new Set());
      socket.emit("events-changed");
      toast.success("Eventos excluídos com sucesso.");
      return true;
    } catch { toast.error("Não foi possível excluir os eventos."); return false; }
    finally { setIsDeleting(false); }
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
    <div className="min-w-0 p-3 sm:p-6">
      {/* Botões para ações em massa */}
      {selectedEvents.size > 0 && (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          {selectedPendingCount > 0 && <Button
            color="success"
            isDisabled={isDeleting}
            onClick={handleValidateSelected}
            className="min-h-11 w-full sm:w-auto"
          >
            Publicar em análise ({selectedPendingCount})
          </Button>}
          <ConfirmAction busy={isDeleting} title={`Excluir ${selectedEvents.size} evento(s)?`} description="Os eventos selecionados e seus dados associados serão removidos. Esta ação não pode ser desfeita." label={`Excluir selecionados (${selectedEvents.size})`} onConfirm={handleDeleteSelected} />
        </div>
      )}

      <div className="space-y-3 lg:hidden" aria-label="Eventos para revisão">
        {eventList.map((event) => (
          <article key={event.id} className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-surface">
            <div className="flex items-start gap-3">
              <Checkbox
                className="shrink-0 py-2"
                isSelected={selectedEvents.has(event.id)}
                isDisabled={isDeleting}
                onValueChange={() => handleSelectEvent(event.id)}
                aria-label={`Selecionar ${event.nome}`}
              />
              <div className="min-w-0 flex-1 space-y-2">
                <h3 className="break-words text-base font-semibold leading-snug text-foreground">{event.nome}</h3>
                <Chip
                  color={event.status === "PUBLISHED" ? "success" : event.status === "CHANGES_REQUESTED" ? "danger" : "warning"}
                  size="sm"
                  variant="flat"
                >
                  {eventStatusLabels[(event.status ?? "PENDING") as EventStatus] ?? "Em análise"}
                </Chip>
              </div>
            </div>
            <div className="mt-4 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Endereço</p>
              <p className="break-words text-sm leading-relaxed text-foreground">{event.endereco}</p>
            </div>
            <div className="mt-4 grid gap-2">
              <Button color="primary" className="min-h-11 w-full" onClick={() => handleSeeMore(event)}>Ver detalhes</Button>
              {event.status === "PENDING" && <Button variant="flat" color="warning" className="min-h-11 w-full" onClick={() => { setCorrectionEvent(event); setCorrectionReason(""); }}>Pedir correção</Button>}
            </div>
          </article>
        ))}
      </div>

      <div className="hidden lg:block">
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
                  isDisabled={isDeleting}
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
      </div>

      {/* Modal para detalhes do evento */}
      {selectedEvent && (
        <ModalEventsValidate
          event={selectedEvent}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          role={role}
        />
      )}
      <Dialog open={!!correctionEvent} onOpenChange={open => { if (!open && !isCorrecting) setCorrectionEvent(null); }}>
        <DialogContent className="z-[120] max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-lg" onEscapeKeyDown={event => { if (isCorrecting) event.preventDefault(); }} onPointerDownOutside={event => { if (isCorrecting) event.preventDefault(); }}>
          <DialogTitle>Solicitar correção</DialogTitle>
          <DialogDescription>Explique ao promotor o que precisa mudar em “{correctionEvent?.nome}”.</DialogDescription>
          <label htmlFor="correction-reason" className="text-sm font-medium">Motivo</label>
          <textarea id="correction-reason" value={correctionReason} onChange={event => setCorrectionReason(event.target.value)} rows={5} maxLength={1000} className="w-full rounded-xl border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" placeholder="Ex.: Atualize o endereço e inclua o horário de início." />
          <div className="flex justify-end gap-2"><Button variant="flat" onClick={() => setCorrectionEvent(null)} disabled={isCorrecting}>Voltar</Button><Button color="primary" onClick={() => void handleRequestCorrection()} disabled={isCorrecting || correctionReason.trim().length < 5}>{isCorrecting ? "Enviando..." : "Enviar pedido"}</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TableEventsAdmin;
