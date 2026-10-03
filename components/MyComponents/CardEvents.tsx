"use client";

import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import Link from "next/link";
import { toast } from "react-toastify";
import { CalendarDays, CheckCircle2, Clock3, Loader2, MapPin, TriangleAlert } from "lucide-react";
import { Image, Modal, ModalBody, ModalContent, ModalHeader } from "@heroui/react";
import { Evento } from "@/types";
import { getEventHistory } from "@/app/(actions)/eventHistory/action";
import { cancelarEvento, duplicarEvento } from "@/app/(actions)/eventos/actions";
import { eventStatusLabels, type EventHistoryAction, type EventStatus } from "@/types/features";
import { useSocket } from "@/context/SocketContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

interface CardEventsProps {
  events: Evento[];
  adminId: string;
}
type HistoryEntry = { id: string; eventName: string; actorName: string | null; action: EventHistoryAction; note?: string | null; createdAt: string };
const historyLabels: Record<EventHistoryAction, string> = { CREATED: "Criado", VALIDATED: "Publicado", DELETED: "Excluído", UPDATED: "Atualizado", CHANGES_REQUESTED: "Correção solicitada", CANCELLED: "Cancelado", SUBMITTED: "Enviado para análise", DUPLICATED: "Duplicado" };

function formatDate(value?: string) {
  if (!value) return "Data não definida";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export default function CardEvents({ events }: CardEventsProps) {
  const socket = useSocket();
  const [selectedEvent, setSelectedEvent] = useState<Evento | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyRetry, setHistoryRetry] = useState(0);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [cancelEvent, setCancelEvent] = useState<Evento | null>(null);
  const [cancelError, setCancelError] = useState("");
  const actionPending = useRef(false);
  const keepEventButton = useRef<HTMLButtonElement>(null);
  const cancelTrigger = useRef<HTMLButtonElement | null>(null);

  const runEventAction = async (event: Evento, action: "duplicate" | "cancel") => {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusyEventId(event.id);
    if (action === "cancel") setCancelError("");
    try {
      const result = action === "duplicate" ? await duplicarEvento(event.id) : await cancelarEvento(event.id);
      if (!result.success) {
        if (action === "cancel") setCancelError(result.message);
        else toast.error(result.message);
        return;
      }
      toast.success(action === "duplicate" ? "Cópia criada como rascunho." : "Evento cancelado.");
      socket.emit("create-event");
      if (action === "cancel") setCancelEvent(null);
      window.location.reload();
    } catch {
      if (action === "cancel") setCancelError("Não foi possível cancelar o evento. Tente novamente.");
      else toast.error("Não foi possível atualizar o evento.");
    }
    finally { actionPending.current = false; setBusyEventId(null); }
  };

  useEffect(() => {
    setSelectedEvent((current) => current ? events.find((event) => event.id === current.id) ?? null : null);
  }, [events]);

  useEffect(() => {
    if (!selectedEvent?.id) return;
    let active = true;
    const fetchHistory = async () => {
      try {
        const result = await getEventHistory(selectedEvent.id);
        if (!active) return;
        if (result.status !== "success") throw new Error("History unavailable");
        setHistory(result.history);
        setHistoryError("");
      } catch {
        if (active) setHistoryError("Não foi possível carregar o histórico deste evento.");
      } finally {
        if (active) setHistoryLoading(false);
      }
    };
    setHistoryLoading(true);
    setHistory([]);
    void fetchHistory();
    socket.on("event-history-updated", fetchHistory);
    socket.on("update-events", fetchHistory);
    socket.on("connect", fetchHistory);
    return () => {
      active = false;
      socket.off("event-history-updated", fetchHistory);
      socket.off("update-events", fetchHistory);
      socket.off("connect", fetchHistory);
    };
  }, [selectedEvent?.id, socket, historyRetry]);

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {events.map((event) => (
          <article key={event.id} className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md">
            <div className="relative h-48 overflow-hidden bg-muted">
              {event.banner ? (
                <Image src={event.banner} alt={`Capa do evento ${event.nome}`} removeWrapper className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground"><CalendarDays className="size-12" aria-hidden="true" /></div>
              )}
              <span className={`absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm ${event.status === "PUBLISHED" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200"}`}>
                {event.status === "PUBLISHED" ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : <Clock3 className="size-3.5" aria-hidden="true" />}
                {eventStatusLabels[(event.status ?? "PENDING") as EventStatus] ?? "Em análise"}
              </span>
            </div>
            <div className="flex flex-1 flex-col p-5">
              <h2 className="line-clamp-2 text-lg font-semibold tracking-tight">{event.nome}</h2>
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{event.descricao || "Sem descrição."}</p>
              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                <p className="flex items-start gap-2"><CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />{formatDate(event.dataInicio)}</p>
                {event.endereco && <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /><span className="line-clamp-1">{event.endereco}</span></p>}
              </div>
              <button type="button" onClick={() => setSelectedEvent(event)} className="mt-5 inline-flex min-h-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/5 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                Ver detalhes
              </button>
              <Link href={`/eventos/${event.id}/comunidade`} className="mt-2 inline-flex min-h-11 items-center justify-center rounded-xl border px-4 text-sm font-semibold hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Comunidade e equipe</Link>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">{event.status !== "CANCELLED" && event.status !== "ENDED" && <Link href={`/eventos/${event.id}/editar`} className="inline-flex min-h-10 items-center rounded-lg border px-3 font-medium hover:bg-muted">Editar</Link>}{event.status === "PUBLISHED" && <Link href={`/myEvents/${event.id}/checkin`} className="inline-flex min-h-10 items-center rounded-lg border border-primary/30 bg-primary/5 px-3 font-medium text-primary hover:bg-primary/10">Check-in</Link>}<button type="button" disabled={busyEventId === event.id} onClick={() => void runEventAction(event, "duplicate")} className="min-h-10 rounded-lg border px-3 font-medium hover:bg-muted disabled:opacity-50">Duplicar</button>{event.status === "PUBLISHED" && <button type="button" disabled={busyEventId === event.id} onClick={(click) => { if (actionPending.current) return; cancelTrigger.current = click.currentTarget; setCancelError(""); setCancelEvent(event); }} className="min-h-10 rounded-lg border border-destructive/30 px-3 font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50">Cancelar</button>}</div>
            </div>
          </article>
        ))}
      </div>

      <Dialog open={Boolean(cancelEvent)} onOpenChange={(open) => {
        if (!open && !actionPending.current) { setCancelEvent(null); setCancelError(""); }
      }}>
        <DialogPortal>
          <DialogOverlay className="z-[70] bg-black/60 backdrop-blur-sm motion-reduce:animate-none" />
          <DialogPrimitive.Content
            role="alertdialog"
            className="fixed left-1/2 top-1/2 z-[80] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border bg-card p-6 text-foreground shadow-2xl focus:outline-none sm:p-7"
            onOpenAutoFocus={(event) => { event.preventDefault(); keepEventButton.current?.focus(); }}
            onCloseAutoFocus={(event) => { event.preventDefault(); cancelTrigger.current?.focus(); }}
            onEscapeKeyDown={(event) => { if (actionPending.current) event.preventDefault(); }}
            onInteractOutside={(event) => { if (actionPending.current) event.preventDefault(); }}
            aria-busy={busyEventId === cancelEvent?.id}
          >
            <div className="mb-5 inline-flex size-12 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10 text-red-600 dark:text-red-400">
              <TriangleAlert className="size-6" aria-hidden="true" />
            </div>
            <DialogHeader className="space-y-3 text-left">
              <DialogTitle className="text-xl leading-snug">Cancelar este evento?</DialogTitle>
              <DialogDescription className="break-words leading-relaxed">
                <span className="font-semibold text-foreground">{cancelEvent?.nome}</span> deixará de aparecer para o público. A página do evento e seu histórico serão preservados.
              </DialogDescription>
            </DialogHeader>
            {cancelError && <p role="alert" className="mt-5 break-words rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-red-600 dark:text-red-400">{cancelError}</p>}
            <DialogFooter className="mt-6 gap-3 sm:space-x-0">
              <Button ref={keepEventButton} variant="outline" disabled={Boolean(busyEventId)} className="min-h-11 rounded-xl" onClick={() => { setCancelEvent(null); setCancelError(""); }}>
                Manter evento
              </Button>
              <Button variant="destructive" disabled={Boolean(busyEventId)} className="min-h-11 rounded-xl" onClick={() => { if (cancelEvent) void runEventAction(cancelEvent, "cancel"); }}>
                {busyEventId === cancelEvent?.id ? <><Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /><span role="status">Cancelando...</span></> : "Cancelar evento"}
              </Button>
            </DialogFooter>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>

      <Modal isOpen={Boolean(selectedEvent)} onClose={() => setSelectedEvent(null)} scrollBehavior="inside" size="2xl" classNames={{ base: "bg-card text-foreground", header: "border-b", body: "py-6" }}>
        <ModalContent>
          {selectedEvent && (
            <>
              <ModalHeader className="pr-10 text-xl">{selectedEvent.nome}</ModalHeader>
              <ModalBody>
                {selectedEvent.banner && <Image src={selectedEvent.banner} alt={`Capa do evento ${selectedEvent.nome}`} removeWrapper className="max-h-72 w-full rounded-xl object-cover" />}
                {selectedEvent.carrossel?.length > 0 && (
                  <div className="px-10">
                    <Carousel className="mx-auto max-w-xl">
                      <CarouselContent>
                        {selectedEvent.carrossel.map((src, index) => (
                          <CarouselItem key={src + index}>
                            <Image src={src} alt={`Imagem ${index + 1} do evento ${selectedEvent.nome}`} removeWrapper className="h-56 w-full rounded-xl object-cover" />
                          </CarouselItem>
                        ))}
                      </CarouselContent>
                      <CarouselPrevious />
                      <CarouselNext />
                    </Carousel>
                  </div>
                )}
                <div className="space-y-4 text-sm">
                  <div><p className="font-semibold">Descrição</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{selectedEvent.descricao || "Sem descrição."}</p></div>
                  <div><p className="font-semibold">Quando</p><p className="mt-1 text-muted-foreground">{formatDate(selectedEvent.dataInicio)}{selectedEvent.dataFim ? ` até ${formatDate(selectedEvent.dataFim)}` : ""}</p></div>
                  {selectedEvent.endereco && <div><p className="font-semibold">Onde</p><p className="mt-1 text-muted-foreground">{selectedEvent.endereco}</p></div>}
                  {selectedEvent.reviewNote && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"><p className="font-semibold">Correção solicitada</p><p className="mt-1 whitespace-pre-wrap">{selectedEvent.reviewNote}</p></div>}
                  {selectedEvent.validate && selectedEvent.validator?.name && <p className="rounded-xl border bg-muted/50 p-3 text-muted-foreground">Validado por {selectedEvent.validator.name}</p>}
                  <section aria-label="Histórico deste evento" className="rounded-xl border bg-muted/30 p-4"><h3 className="font-semibold">Histórico deste evento</h3>{historyLoading ? <p role="status" className="mt-3 text-muted-foreground">Carregando histórico...</p> : historyError ? <div role="alert" className="mt-3"><p>{historyError}</p><button type="button" className="mt-2 font-semibold text-primary underline underline-offset-4" onClick={() => setHistoryRetry((count) => count + 1)}>Tentar novamente</button></div> : history.length === 0 ? <p className="mt-3 text-muted-foreground">Nenhuma mudança registrada ainda.</p> : <ol className="mt-3 space-y-3">{history.slice(0, 5).map((entry) => { const date = new Date(entry.createdAt); return <li key={entry.id} className="border-l-2 border-primary/30 pl-3"><p className="font-medium">{historyLabels[entry.action]}{entry.actorName ? ` por ${entry.actorName}` : ""}</p>{entry.note && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{entry.note}</p>}<p className="text-xs text-muted-foreground">{Number.isNaN(date.getTime()) ? "Data indisponível" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date)}</p></li>; })}</ol>}</section>
                </div>
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
