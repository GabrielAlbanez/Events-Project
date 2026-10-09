"use client";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { getRecommendedEvents, getSavedEvents } from "@/app/(actions)/engagement/action";
import { rankRecommendedEvents, type RecommendedEvent } from "@/lib/eventRecommendations";
import type { Evento } from "@/types";
function bounded<T>(work: Promise<T>): Promise<T> {
 let timer: ReturnType<typeof setTimeout>;
 return Promise.race([work, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error("TIMEOUT")), 12000); })]).finally(() => clearTimeout(timer));
}
export function useLoggedHomeData(events: Evento[], _loading: boolean, _loadError: boolean) {
 const { data: session, status } = useSession();
 const [recommended, setRecommended] = useState<RecommendedEvent[]>([]);
 const [saved,setSaved] = useState<Evento[]>([]);
 const [recommendationsLoading,setRecommendationsLoading] = useState(true);
 const [recommendationsError,setRecommendationsError] = useState(false);
 const [agendaLoading,setAgendaLoading] = useState(true);
 const [agendaError,setAgendaError] = useState(false);
 const [recommendationRetry,setRecommendationRetry] = useState(0);
 const [agendaRetry,setAgendaRetry] = useState(0);
 useEffect(() => {
  let active = true;
  setRecommended([]); setRecommendationsError(false); setRecommendationsLoading(status === "authenticated");
  if (status !== "authenticated") return;
  void bounded(getRecommendedEvents()).then(items => { if(active) setRecommended(items); }).catch(() => { if(active) setRecommendationsError(true); }).finally(() => { if(active) setRecommendationsLoading(false); });
  return () => {active=false;};
 },[status,session?.user?.id,recommendationRetry]);
 useEffect(() => {
  let active = true;
  setSaved([]); setAgendaError(false); setAgendaLoading(status === "authenticated");
  if(status !== "authenticated") return;
  void bounded(getSavedEvents()).then(items => { if(active) setSaved(items); }).catch(() => { if(active) setAgendaError(true); }).finally(() => { if(active) setAgendaLoading(false); });
  return () => {active=false;};
 },[status,session?.user?.id,agendaRetry]);
 const suggestions = useMemo(() => {
  const fallback = rankRecommendedEvents(events,[],[]);
  const ids = new Set<string>();
  return [...recommended,...fallback].filter(item => {if(ids.has(item.event.id))return false; ids.add(item.event.id);return true;}).slice(0,6);
 },[events,recommended]);
 return { suggestions, saved, recommendationsLoading, recommendationsError, agendaLoading, agendaError, retryRecommendations: () => setRecommendationRetry(value=>value+1), retryAgenda: () => setAgendaRetry(value=>value+1), sessionName: session?.user?.name || null };
}
