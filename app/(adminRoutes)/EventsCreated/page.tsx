"use client";

import { useState, useEffect } from "react";
import io from "socket.io-client"; // Importa o socket
import TableEvents from "@/components/MyComponents/TableEvents";
import { Evento } from "@/types";
import { FilterBarEvents } from "@/components/MyComponents/FilterBarEvents";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const socket = io(); // Conecta ao servidor Socket.io

const EventsCreated = () => {
  const { data } = useCurrentUser();

  const [events, setEvents] = useState<Evento[]>([]); // Todos os eventos
  const [filteredEvents, setFilteredEvents] = useState<Evento[]>([]); // Eventos filtrados
  const [searchTerm, setSearchTerm] = useState(""); // Termo de busca
  const [filterStatus, setFilterStatus] = useState<"all" | "verified" | "unverified">("all"); // Filtro por status
  const [isLoading, setIsLoading] = useState(true); // Controle de carregamento

  // Buscar eventos da API inicialmente
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
        console.log("Buscando eventos da URL:", `${baseUrl}/api/AllEvents`);

        const response = await fetch(`${baseUrl}/api/AllEvents`);

        if (!response.ok) {
          throw new Error("Falha ao buscar eventos");
        }

        const data = await response.json();
        console.log("Eventos recebidos da API:", data);

        setEvents(data); // Atualiza os eventos
        setFilteredEvents(data); // Inicializa os eventos filtrados
        setIsLoading(false); // Finaliza o carregamento
      } catch (error) {
        console.error("Erro ao buscar eventos:", error);
        setIsLoading(false);
      }
    };

    fetchEvents();

    // Configuração do socket para receber eventos em tempo real
    socket.on("update-events", (updatedEvents: Evento[]) => {
      console.log("📢 Atualização de eventos recebida via Socket.io", updatedEvents);
      setEvents(updatedEvents);
      setFilteredEvents(updatedEvents);
    });

    return () => {
      socket.off("update-events"); // Limpar evento ao desmontar o componente
    };
  }, []); // Executa apenas uma vez ao montar o componente

  // Função para filtrar eventos (status e termo de busca)
  useEffect(() => {
    console.log("Filtrando eventos com:");
    console.log("searchTerm:", searchTerm);
    console.log("filterStatus:", filterStatus);
    console.log("Eventos disponíveis para filtrar:", events);

    const filtered = events.filter((event) => {
      const matchesSearch =
        event.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.dataInicio.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.dataFim.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        filterStatus === "all" ||
        (filterStatus === "verified" && event.validate) ||
        (filterStatus === "unverified" && !event.validate);

      return matchesSearch && matchesStatus;
    });

    setFilteredEvents(filtered);
  }, [searchTerm, filterStatus, events]);

  // Função para atualizar o termo de busca
  const handleFilterChange = (value: string) => {
    setSearchTerm(value);
  };

  // Função para atualizar o filtro de validação
  const handleStatusChange = (status: "all" | "verified" | "unverified") => {
    setFilterStatus(status);
  };

  return (
    <div className="flex flex-col w-full h-full items-center p-6">
      {isLoading ? (
        <div className="flex h-full w-full items-center justify-center">
          <p className="text-gray-600">Carregando eventos...</p>
        </div>
      ) : (
        <>
          {/* Barra de Filtro */}
          <FilterBarEvents
            filterValue={searchTerm}
            onFilterChange={handleFilterChange}
            onStatusChange={handleStatusChange}
          />

          {/* Lista de Eventos */}
          {data && (
            <div className="w-full">
              <TableEvents events={filteredEvents} adminId={data?.id} />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default EventsCreated;
