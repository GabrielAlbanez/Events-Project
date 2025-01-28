"use client";

import { useState, useEffect } from "react";
import TableEvents from "@/components/MyComponents/TableEvents";
import { Evento } from "@/types";
import { FilterBarEvents } from "@/components/MyComponents/FilterBarEvents";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import CardEvents from "@/components/MyComponents/CardEvents";

type ResponseApi = {
  status: string;
  message: string;
};

const MyEvents = () => {
  const { data } = useCurrentUser();

  const [events, setEvents] = useState<Evento[]>([]); // Todos os eventos
  const [filteredEvents, setFilteredEvents] = useState<Evento[]>([]); // Eventos filtrados
  const [searchTerm, setSearchTerm] = useState(""); // Termo de busca
  const [filterStatus, setFilterStatus] = useState<
    "all" | "verified" | "unverified"
  >("all"); // Filtro por status
  const [isLoading, setIsLoading] = useState(true); // Controle de carregamento
  const [responseApi, setResponseApi] = useState<ResponseApi | null>(null); // Resposta da API

  // Função para buscar eventos da API
  useEffect(() => {
    if (!data) {
      console.log("ID do usuário não disponível.");
      setResponseApi({ status: "error", message: "carregando..." });
      setIsLoading(false);
      return;
    }

    const fetchEvents = async () => {
      try {
        const baseUrl =
          process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

        const response = await fetch(`${baseUrl}/api/EventsUser`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ idUser: data.id }),
        });

        if (!response.ok) {
          console.error("Erro na requisição:", response.statusText);
          setResponseApi({
            status: "error",
            message: "Erro na requisição ao servidor.",
          });
          return;
        }

        const result = await response.json();
        console.log("Eventos recebidos:", result);
        setResponseApi({ status: result.status, message: result.message });

        if (result.status === "error") {
          console.error("Erro no servidor:", result.message);
          return;
        }

        setEvents(result.events || []);
        setFilteredEvents(result.events || []);
      } catch (error) {
        console.error("Erro ao buscar eventos:", error);
        setResponseApi({
          status: "error",
          message: "Erro interno ao buscar eventos.",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchEvents();
  }, [data]);

  // Função para filtrar eventos (status e termo de busca)
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

    setFilteredEvents(filtered); // Atualiza os eventos filtrados
  }, [searchTerm, filterStatus, events]); // Executa sempre que searchTerm, filterStatus ou events mudar

  // Função para atualizar o termo de busca
  const handleFilterChange = (value: string) => {
    setSearchTerm(value);
  };

  // Função para atualizar o filtro de validação
  const handleStatusChange = (status: "all" | "verified" | "unverified") => {
    setFilterStatus(status);
  };

  // Renderização condicional com lógica separada
  const renderLoading = () => (
    <div className="flex h-full w-full items-center justify-center">
      {responseApi && <p className="text-red-500">{responseApi.message}</p>}
      <p className="text-gray-600">Carregando eventos...</p>
    </div>
  );

  const renderError = () => (
    <div className="flex h-full w-full items-center justify-center">
      <p className="text-red-500">{responseApi?.message}</p>
    </div>
  );

  const renderNoEvents = () => (
    <div className="flex h-full w-full items-center justify-center">
      <p className="text-gray-600">Nenhum evento encontrado.</p>
    </div>
  );

  const renderEvents = () => (
    <>
      <div className="w-full pt-6">
        {data && <CardEvents events={filteredEvents} adminId={data?.id} />}
      </div>
    </>
  );

  return (
    <div className="flex flex-col w-full h-full items-center p-6">
      <FilterBarEvents
        filterValue={searchTerm}
        onFilterChange={handleFilterChange}
        onStatusChange={handleStatusChange}
      />
      {isLoading
        ? renderLoading()
        : responseApi?.status === "error"
        ? renderError()
        : events.length === 0
        ? renderNoEvents()
        : renderEvents()}
    </div>
  );
};

export default MyEvents;
