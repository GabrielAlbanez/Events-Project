"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Evento } from "@/types";
import { FilterBarEvents } from "@/components/MyComponents/FilterBarEvents";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useSocket, useSocketStatus } from "@/context/SocketContext";
import TableEventsClient from "@/components/MyComponents/TableEventsClient";
import TableEventsAdmin from "@/components/MyComponents/TableEventsAdmin";
import PublicEventFilters, { DiscoveryFilter, emptyDiscoveryFilter, filterDiscovery } from "@/components/MyComponents/PublicEventFilters";
import { AlertCircle, Clock3, CheckCircle2, Search } from "lucide-react";
import { FadeInView } from "@/components/animations/FadeInView";
import { LoadingShimmer } from "@/components/animations/LoadingShimmer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col items-center px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <FadeInView className="mb-8 w-full"><header><p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Explore o EventMap</p><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{user?.role === "ADMIN" ? "Revisar eventos" : "Agenda de eventos"}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{user?.role === "ADMIN" ? "Acompanhe e revise os eventos recebidos." : "Encontre experiências e organize seus próximos dias."}</p></header></FadeInView>
      {!socketConnected && <p role="status" className="mb-4 w-full rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">Atualizações em tempo real indisponíveis. Você ainda pode consultar os eventos.</p>}
      {isLoading ? (
        <div role="status" aria-live="polite" aria-busy="true" className="w-full space-y-5">
          <span className="sr-only">Carregando eventos...</span>
          <div aria-hidden="true" className="h-14 rounded-2xl border border-border bg-card" />
          <div aria-hidden="true" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => <div key={index} className="overflow-hidden rounded-2xl border border-border bg-card shadow-surface">
              <div className="relative aspect-video overflow-hidden bg-muted"><LoadingShimmer className="h-full w-full text-primary/20" /></div>
              <div className="space-y-3 p-5"><div className="h-3 w-1/3 rounded-full bg-muted" /><div className="h-5 w-4/5 rounded-full bg-muted" /><div className="h-3 w-full rounded-full bg-muted" /><div className="h-3 w-2/3 rounded-full bg-muted" /><div className="pt-3"><div className="h-4 w-1/3 rounded-full bg-primary/10" /></div></div>
            </div>)}
          </div>
        </div>
      ) : error ? (
        <div role="alert" className="flex min-h-80 w-full flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card p-6 text-center shadow-surface"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"><AlertCircle className="h-6 w-6" aria-hidden="true" /></span><h2 className="text-xl font-semibold tracking-tight">A agenda está indisponível</h2><p className="max-w-md text-sm leading-6 text-muted-foreground">{error}</p><Button type="button" variant="outline" onClick={() => { setIsLoading(true); void fetchEvents(); }}>Tentar novamente</Button></div>
      ) : (
        <>
          {user?.role === "ADMIN" && <FadeInView className="mb-5 w-full" stationary><div role="status" className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${pendingCount ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-primary/10 text-primary"}`}>{pendingCount ? <Clock3 className="h-5 w-5" aria-hidden="true" /> : <CheckCircle2 className="h-5 w-5" aria-hidden="true" />}</span>
            <div><p className="font-semibold">{pendingCount ? `${pendingCount} ${pendingCount === 1 ? "evento aguardando" : "eventos aguardando"} validação` : "Nenhum evento aguardando validação"}</p><p className="text-sm text-muted-foreground">{pendingCount ? "Revise os eventos pendentes na lista abaixo." : "Todos os eventos recebidos já foram analisados."}</p></div>
          </div></FadeInView>}
          {user?.role !== "ADMIN" && <div className="mb-4 w-full"><PublicEventFilters events={events} value={discovery} onChange={setDiscovery} /></div>}
          {user?.role === "ADMIN" ? <FilterBarEvents filterValue={searchTerm} onFilterChange={setSearchTerm} onStatusChange={setFilterStatus} /> : <label className="mb-6 grid w-full gap-2 text-sm font-medium">Buscar eventos<span className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input type="search" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Nome, descrição ou data" className="pl-10 font-normal" /></span></label>}
          <div className="w-full">
            {user?.role === "ADMIN" ? <TableEventsAdmin events={filteredEvents} adminId={user.id} /> : <TableEventsClient role={user?.role ?? ""} events={filteredEvents} adminId={user?.id ?? ""} />}
          </div>
        </>
      )}
    </div>
  );
}
