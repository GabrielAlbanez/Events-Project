"use client";

import { useState, useEffect } from "react";
import TableEvents from "@/components/MyComponents/TableEvents";
import { Evento } from "@/types";
import { FilterBarEvents } from "@/components/MyComponents/FilterBarEvents";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import CardEvents from "@/components/MyComponents/CardEvents";
import { useSocket } from "@/context/SocketContext";

const MyEvents = () => {
  const { data } = useCurrentUser();
  const socket = useSocket(); 

  const [events, setEvents] = useState<Evento[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<Evento[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "verified" | "unverified">("all");
  const [isLoading, setIsLoading] = useState(true);

  console.log("🔄 Renderizando MyEvents...");

  // 🔹 Busca inicial dos eventos ao carregar a página
  useEffect(() => {
    if (!data?.id) return;

    console.log("📡 Buscando eventos do usuário via API...");

    const fetchEvents = async () => {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
        const response = await fetch(`${baseUrl}/api/EventsUser`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idUser: data.id }),
        });

        if (!response.ok) throw new Error(`Erro: ${response.statusText}`);

        const result = await response.json();
        console.log("✅ Eventos carregados da API:", result);

        if (result.status !== "error") {
          setEvents(result.events || []);
          setFilteredEvents(result.events || []);
        }
      } catch (error) {
        console.error("❌ Erro ao buscar eventos:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEvents();
  }, [data?.id,events]);

  // 📡 Atualizações via WebSocket
  useEffect(() => {
    if (!socket) return;

    const handleUpdateEvents = (updatedEvents: Evento[]) => {
      console.log("📡 Atualização via WebSocket:", updatedEvents);

      if (updatedEvents.length > 0) {
        setEvents(updatedEvents);
      }
    };

    socket.on("update-events", handleUpdateEvents);

    return () => {
      socket.off("update-events", handleUpdateEvents);
    };
  }, [socket]);

  // 🔍 Aplicação de filtros
  useEffect(() => {
    const filtered = events.filter((event) => {
      const matchesSearch =
        event.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.dataInicio.toLowerCase().includes(searchTerm.toLowerCase());
        event.dataFim.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        filterStatus === "all" ||
        (filterStatus === "verified" && event.validate) ||
        (filterStatus === "unverified" && !event.validate);

      return matchesSearch && matchesStatus;
    });

    setFilteredEvents(filtered);
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
