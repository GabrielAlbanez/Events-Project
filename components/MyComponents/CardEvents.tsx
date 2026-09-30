"use client";

import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, MapPin } from "lucide-react";
import { Image, Modal, ModalBody, ModalContent, ModalHeader } from "@heroui/react";
import { Evento } from "@/types";
import { getEventHistory } from "@/app/(actions)/eventHistory/action";
import { useSocket } from "@/context/SocketContext";
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
type HistoryEntry = { id: string; eventName: string; actorName: string | null; action: "CREATED" | "VALIDATED" | "DELETED"; createdAt: string };

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
              <span className={`absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm ${event.validate ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200"}`}>
                {event.validate ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : <Clock3 className="size-3.5" aria-hidden="true" />}
                {event.validate ? "Validado" : "Aguardando validação"}
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
            </div>
          </article>
        ))}
      </div>

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
                  {selectedEvent.validate && selectedEvent.validator?.name && <p className="rounded-xl border bg-muted/50 p-3 text-muted-foreground">Validado por {selectedEvent.validator.name}</p>}
                  <section aria-label="Histórico deste evento" className="rounded-xl border bg-muted/30 p-4"><h3 className="font-semibold">Histórico deste evento</h3>{historyLoading ? <p role="status" className="mt-3 text-muted-foreground">Carregando histórico...</p> : historyError ? <div role="alert" className="mt-3"><p>{historyError}</p><button type="button" className="mt-2 font-semibold text-primary underline underline-offset-4" onClick={() => setHistoryRetry((count) => count + 1)}>Tentar novamente</button></div> : history.length === 0 ? <p className="mt-3 text-muted-foreground">Nenhuma mudança registrada ainda.</p> : <ol className="mt-3 space-y-3">{history.slice(0, 5).map((entry) => { const date = new Date(entry.createdAt); const label = entry.action === "VALIDATED" ? "Validado" : entry.action === "DELETED" ? "Excluído" : "Criado"; return <li key={entry.id} className="border-l-2 border-primary/30 pl-3"><p className="font-medium">{label}{entry.actorName ? ` por ${entry.actorName}` : ""}</p><p className="text-xs text-muted-foreground">{Number.isNaN(date.getTime()) ? "Data indisponível" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date)}</p></li>; })}</ol>}</section>
                </div>
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
