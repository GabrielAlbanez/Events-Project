"use client";

import { useState, useEffect } from "react";
import CardEvents from "@/components/MyComponents/CardEvents";
import { Evento } from "@/types";
import { FilterBar } from "@/components/MyComponents/FilterBar";
import { FilterBarEvents } from "@/components/MyComponents/FilterBarEvents";
import { socket } from "@/lib/socketClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const EventsCreated = () => {
  const { data } = useCurrentUser();

  const [events, setEvents] = useState<Evento[]>([]); // Todos os eventos
  const [filteredEvents, setFilteredEvents] = useState<Evento[]>([]); // Eventos filtrados
  const [searchTerm, setSearchTerm] = useState(""); // Termo de busca
  const [filterStatus, setFilterStatus] = useState<
    "all" | "verified" | "unverified"
  >("all"); // Filtro por status
  const [isLoading, setIsLoading] = useState(true); // Controle de carregamento

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const baseUrl =
          process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
        const response = await fetch(`${baseUrl}/api/AllEvents`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Falha ao buscar eventos");
        }

        const data = await response.json();
        setEvents(data); // Atualiza os eventos
        setFilteredEvents(data); // Inicializa os eventos filtrados
        setIsLoading(false); // Finaliza o carregamento
      } catch (error) {
        console.error("Erro ao buscar eventos:", error);
        setIsLoading(false);
      }
    };

    fetchEvents();
  }, []); // Chamada única ao carregar o componente

  // Filtrar eventos por termo de busca e status
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

    setFilteredEvents(filtered);
  }, [searchTerm, filterStatus, events]);

  // Atualizar o termo de busca
  const handleFilterChange = (value: string) => {
    setSearchTerm(value);
  };

  // Atualizar o filtro de validação
  const handleStatusChange = (status: "all" | "verified" | "unverified") => {
    setFilterStatus(status);
  };

  return (
    <div className="flex flex-col w-full h-full items-center p-6">
      {isLoading ? (
        <div className="flex h-full w-full items-center justify-center">
          <p className="text-gray-600">Carregando eventos..</p>
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
              <CardEvents events={filteredEvents} adminId={data?.id} />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default EventsCreated;
