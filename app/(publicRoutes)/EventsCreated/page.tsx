"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Evento } from "@/types";
import { FilterBarEvents } from "@/components/MyComponents/FilterBarEvents";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useSocket, useSocketStatus } from "@/context/SocketContext";
import TableEventsClient from "@/components/MyComponents/TableEventsClient";
import TableEventsAdmin from "@/components/MyComponents/TableEventsAdmin";
import PublicEventFilters, { DiscoveryFilter, emptyDiscoveryFilter, filterDiscovery } from "@/components/MyComponents/PublicEventFilters";
import { Clock3, CheckCircle2 } from "lucide-react";
import { FadeInView } from "@/components/animations/FadeInView";
import { LoadingShimmer } from "@/components/animations/LoadingShimmer";

type StatusFilter = "all" | "verified" | "unverified";

export default function EventsCreated() {
  const { data: user } = useCurrentUser();
  const identity = useRef(`${user?.id ?? "anonymous"}:${user?.role ?? "public"}`);
  identity.current = `${user?.id ?? "anonymous"}:${user?.role ?? "public"}`;
  const socket = useSocket();
  const socketConnected = useSocketStatus();
  const [discovery, setDiscovery] = useState<DiscoveryFilter>(emptyDiscoveryFilter);
  const [events, setEvents] = useState<Evento[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchEvents = useCallback(async () => {
    const requestedIdentity = `${user?.id ?? "anonymous"}:${user?.role ?? "public"}`;
    try {
      const response = await fetch(user?.role === "ADMIN" ? "/api/admin/events" : "/api/AllEvents");
      if (!response.ok) throw new Error("Request failed");
      const result: Evento[] = await response.json();
      if (!Array.isArray(result)) throw new Error("Invalid response");
      if (requestedIdentity !== identity.current) return;
      setEvents(result);
      setError("");
    } catch {
      if (requestedIdentity !== identity.current) return;
      setError("Não foi possível carregar os eventos. Tente novamente.");
    } finally {
      if (requestedIdentity === identity.current) setIsLoading(false);
    }
  }, [user?.role, user?.id]);

  useEffect(() => {
    setEvents([]);
    setIsLoading(true);
    setFilterStatus("all");
    void fetchEvents();
    const handleUpdate = () => void fetchEvents();
    socket.on("update-events", handleUpdate);
    socket.on("connect", handleUpdate);
    return () => {
      socket.off("update-events", handleUpdate);
      socket.off("connect", handleUpdate);
    };
  }, [fetchEvents, socket]);

  const filteredEvents = useMemo(() => (user?.role === "ADMIN" ? events : filterDiscovery(events, discovery)).filter((event) => {
    const query = searchTerm.trim().toLocaleLowerCase("pt-BR");
    const matchesSearch = !query || [event.nome, event.descricao, event.dataInicio, event.dataFim]
      .some((value) => value?.toLocaleLowerCase("pt-BR").includes(query));
    const matchesStatus = user?.role !== "ADMIN" || filterStatus === "all" || (filterStatus === "verified" ? event.validate : !event.validate);
    return matchesSearch && matchesStatus;
  }), [events, searchTerm, filterStatus, discovery, user?.role]);
  const pendingCount = events.filter((event) => event.status ? event.status === "PENDING" : !event.validate).length;

  return (
    <div className="flex h-full w-full flex-col items-center p-6">
      <FadeInView className="mb-6 w-full"><header><h1 className="text-3xl font-bold">{user?.role === "ADMIN" ? "Revisar eventos" : "Agenda de eventos"}</h1><p className="mt-2 text-muted-foreground">{user?.role === "ADMIN" ? "Acompanhe e revise os eventos recebidos." : "Encontre experiências e organize seus próximos dias."}</p></header></FadeInView>
      {!socketConnected && <p role="status" className="mb-4 w-full rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">Atualizações em tempo real indisponíveis. Você ainda pode consultar os eventos.</p>}
      {isLoading ? (
        <div role="status" className="flex min-h-64 w-full items-center justify-center text-muted-foreground"><span className="relative inline-block overflow-hidden rounded-lg px-4 py-2">Carregando eventos...<LoadingShimmer className="absolute inset-0 text-primary/30" /></span></div>
      ) : error ? (
        <div role="alert" className="flex min-h-64 w-full flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card p-6 text-center"><p>{error}</p><button type="button" className="font-semibold text-primary underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" onClick={() => { setIsLoading(true); void fetchEvents(); }}>Tentar novamente</button></div>
      ) : (
        <>
          {user?.role === "ADMIN" && <FadeInView className="mb-5 w-full" stationary><div role="status" className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${pendingCount ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-primary/10 text-primary"}`}>{pendingCount ? <Clock3 className="h-5 w-5" aria-hidden="true" /> : <CheckCircle2 className="h-5 w-5" aria-hidden="true" />}</span>
            <div><p className="font-semibold">{pendingCount ? `${pendingCount} ${pendingCount === 1 ? "evento aguardando" : "eventos aguardando"} validação` : "Nenhum evento aguardando validação"}</p><p className="text-sm text-muted-foreground">{pendingCount ? "Revise os eventos pendentes na lista abaixo." : "Todos os eventos recebidos já foram analisados."}</p></div>
          </div></FadeInView>}
          {user?.role !== "ADMIN" && <div className="mb-4 w-full"><PublicEventFilters events={events} value={discovery} onChange={setDiscovery} /></div>}
          {user?.role === "ADMIN" ? <FilterBarEvents filterValue={searchTerm} onFilterChange={setSearchTerm} onStatusChange={setFilterStatus} /> : <label className="mb-5 grid w-full gap-2 text-sm font-medium">Buscar eventos<input type="search" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Nome, descrição ou data" className="min-h-11 rounded-xl border bg-background px-4 font-normal" /></label>}
          <div className="w-full">
            {user?.role === "ADMIN" ? <TableEventsAdmin events={filteredEvents} adminId={user.id} /> : <TableEventsClient role={user?.role ?? ""} events={filteredEvents} adminId={user?.id ?? ""} />}
          </div>
        </>
      )}
    </div>
  );
}
