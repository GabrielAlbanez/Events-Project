"use client";

import { useState, useEffect } from "react";
import TableEvents from "@/components/MyComponents/TableEvents";
import { Evento } from "@/types";
import { FilterBarEvents } from "@/components/MyComponents/FilterBarEvents";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import CardEvents from "@/components/MyComponents/CardEvents";

const myEvents = () => {
  const { data } = useCurrentUser();

  const [events, setEvents] = useState<Evento[]>([]); // Todos os eventos
  const [filteredEvents, setFilteredEvents] = useState<Evento[]>([]); // Eventos filtrados
  const [searchTerm, setSearchTerm] = useState(""); // Termo de busca
  const [filterStatus, setFilterStatus] = useState<
    "all" | "verified" | "unverified"
  >("all"); // Filtro por status
  const [isLoading, setIsLoading] = useState(true); // Controle de carregamento

  // Função para buscar eventos da API
  useEffect(() => {
    const fetchEvents = async (idUser: string) => {
      try {
        const baseUrl =
          process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
        console.log(
          "Buscando eventos da URL:",
          `${baseUrl}/api/EventsForUserById`
        );

        // Fazendo a requisição com o ID do usuário no corpo da requisição
        const response = await fetch(`${baseUrl}/api/EventsForUserById`, {
          method: "POST", // Usando POST para enviar dados no body
          headers: {
            "Content-Type": "application/json", // Define o tipo de conteúdo
          },
          body: JSON.stringify({ idUser }), // Envia o ID do usuário
        });

        if (!response.ok) {
          throw new Error("Falha ao buscar eventos");
        }

        const data = await response.json();
        console.log("Eventos recebidos da API:", data);

        setEvents(data.events || []); // Atualiza os eventos
        setFilteredEvents(data.events || []); // Inicializa os eventos filtrados
        setIsLoading(false); // Finaliza o carregamento
      } catch (error) {
        console.error("Erro ao buscar eventos:", error);
        setIsLoading(false);
      }
    };

    if (data?.id) {
      fetchEvents(data?.id);
    }
  }, []); // Chamada única ao carregar o componente

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
        event.data.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        filterStatus === "all" ||
        (filterStatus === "verified" && event.validate) ||
        (filterStatus === "unverified" && !event.validate);

      console.log(
        `Evento "${event.nome}" -> matchesSearch: ${matchesSearch}, matchesStatus: ${matchesStatus}`
      );

      return matchesSearch && matchesStatus;
    });

    console.log("Eventos filtrados:", filtered);
    setFilteredEvents(filtered); // Atualiza os eventos filtrados
    console.log("evento filtrado para", filtered);
  }, [searchTerm, filterStatus, events]); // Executa sempre que searchTerm, filterStatus ou events mudar

  // Função para atualizar o termo de busca
  const handleFilterChange = (value: string) => {
    console.log("Atualizando searchTerm para:", value);
    setSearchTerm(value);
  };

  // Função para atualizar o filtro de validação
  const handleStatusChange = (status: "all" | "verified" | "unverified") => {
    console.log("Atualizando filterStatus para:", status);
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

export default myEvents;
