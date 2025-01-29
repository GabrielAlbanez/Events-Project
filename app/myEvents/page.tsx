"use client";

import { useState, useEffect } from "react";
import TableEvents from "@/components/MyComponents/TableEvents";
import { Evento } from "@/types";
import { FilterBarEvents } from "@/components/MyComponents/FilterBarEvents";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import CardEvents from "@/components/MyComponents/CardEvents";
import { useSocket } from "@/context/SocketContext"; // Usando o contexto do socket

const MyEvents = () => {
  const { data } = useCurrentUser();
  const socket = useSocket(); // Obtendo a instância do WebSocket

  const [events, setEvents] = useState<Evento[]>([]); // Lista de eventos vinda do WebSocket
  const [filteredEvents, setFilteredEvents] = useState<Evento[]>([]); // Eventos filtrados
  const [searchTerm, setSearchTerm] = useState(""); // Termo de busca
  const [filterStatus, setFilterStatus] = useState<"all" | "verified" | "unverified">("all"); // Filtro por status
  const [isLoading, setIsLoading] = useState(true); // Controle de carregamento

  // 🔹 Contador de renderizações
  useEffect(() => {
    console.log("🔄 Página MyEvents renderizada.");
  });

  // 📡 Conectar ao WebSocket e escutar eventos em tempo real
  useEffect(() => {
    if (!socket) return;

    const handleUpdateEvents = (updatedEvents: Evento[]) => {
      setEvents((prevEvents) => {
        if (JSON.stringify(prevEvents) !== JSON.stringify(updatedEvents)) {
          setIsLoading(false);
          return updatedEvents;
        }
        return prevEvents;
      });
    };

    socket.on("update-events", handleUpdateEvents);

    return () => {
      socket.off("update-events", handleUpdateEvents);
    };
  }, [socket]);

  // 🔍 Filtro de eventos
  useEffect(() => {
    const filtered = events.filter((event) => {
      const matchesSearch =
        event.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.data.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        filterStatus === "all" ||
        (filterStatus === "verified" && event.validate) ||
        (filterStatus === "unverified" && !event.validate);

      return matchesSearch && matchesStatus;
    });

    setFilteredEvents((prevFilteredEvents) => {
      if (JSON.stringify(prevFilteredEvents) !== JSON.stringify(filtered)) {
        return filtered;
      }
      return prevFilteredEvents;
    });
  }, [searchTerm, filterStatus, events]);

  return (
    <div className="flex flex-col w-full h-full items-center p-6">
      <FilterBarEvents filterValue={searchTerm} onFilterChange={setSearchTerm} onStatusChange={setFilterStatus} />
      {isLoading ? (
        <div className="flex h-full w-full items-center justify-center">
          <p className="text-gray-600">Carregando eventos...</p>
        </div>
      ) : events.length === 0 ? (
        <div className="flex h-full w-full items-center justify-center">
          <p className="text-gray-600">Nenhum evento encontrado.</p>
        </div>
      ) : (
        <div className="w-full pt-6">
          {data && <CardEvents events={filteredEvents} adminId={data?.id} />}
        </div>
      )}
    </div>
  );
};

export default MyEvents;
