"use client";

import { useState, useEffect } from "react";
import CardEvents from "@/components/MyComponents/CardEvents";
import { Evento } from "@/types";
import { FilterBar } from "@/components/MyComponents/FilterBar";
import { FilterBarEvents } from "@/components/MyComponents/FilterBarEvents";

const EventsCreated = () => {
  const [events, setEvents] = useState<Evento[]>([]); // Todos os eventos
  const [filteredEvents, setFilteredEvents] = useState<Evento[]>([]); // Eventos filtrados
  const [searchTerm, setSearchTerm] = useState(""); // Termo de busca
  const [filterStatus, setFilterStatus] = useState<"all" | "verified" | "unverified">("all"); // Filtro por status
  const [isLoading, setIsLoading] = useState(true); // Controle de carregamento

  // Buscar eventos na API
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

        const data: Evento[] = await response.json();
        setEvents(data); // Atualiza os eventos
        setFilteredEvents(data); // Inicializa os eventos filtrados
        setIsLoading(false); // Finaliza o carregamento
      } catch (error) {
        console.error(error);
        setIsLoading(false);
      }
    };

    fetchEvents();
  }, []);

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
    <div className="flex flex-col items-center p-6">
      {isLoading ? (
        <p className="text-gray-600">Carregando eventos...</p>
      ) : (
        <>
          {/* Barra de Filtro */}
          <FilterBarEvents
            filterValue={searchTerm}
            onFilterChange={handleFilterChange}
            onStatusChange={handleStatusChange}
          />

          {/* Lista de Eventos */}
          <div className="w-full">
            <CardEvents events={filteredEvents} />
          </div>
        </>
      )}
    </div>
  );
};

export default EventsCreated;
