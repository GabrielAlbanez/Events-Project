"use client";

import { useEffect, useRef, useState } from "react";
import { Evento } from "@/types";
import { useGoogleMaps } from "./GoogleMapsLoader";

export type DiscoveryFilter = { category: string; free: boolean; maxPrice: string; radius: string; origin: {lat:number;lng:number} | null; travelMinutes: number | null; travelDurations: Record<string, number> };
export const emptyDiscoveryFilter: DiscoveryFilter = {category:'',free:false,maxPrice:'',radius:'',origin:null,travelMinutes:null,travelDurations:{}};

export function filterDiscovery(events: Evento[], filter: DiscoveryFilter) {
 return events.filter(event => { if(filter.category && event.category!==filter.category)return false;if(filter.free && !event.isFree)return false;if(filter.maxPrice && !event.isFree && (event.priceCents==null || event.priceCents<=0 || event.priceCents>Number(filter.maxPrice)*100))return false;if(filter.radius && filter.origin){if(event.lat==null || event.lng==null)return false;const rad=(value:number)=>value*Math.PI/180;const dlat=rad(event.lat-filter.origin.lat),dlng=rad(event.lng-filter.origin.lng);const a=Math.sin(dlat/2)**2+Math.cos(rad(filter.origin.lat))*Math.cos(rad(event.lat))*Math.sin(dlng/2)**2;const distance=6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));if(distance>Number(filter.radius))return false;}if(filter.travelMinutes !== null && (filter.travelDurations[event.id] == null || filter.travelDurations[event.id] > filter.travelMinutes))return false;return true; });
}

type RouteMatrixLibrary = { RouteMatrix: { computeRouteMatrix: (request: { origins: Array<{lat:number;lng:number}>; destinations: Array<{lat:number;lng:number}>; travelMode: "DRIVING"; fields: string[] }) => Promise<{ matrix: { rows: Array<{ items: Array<{ condition: string; durationMillis?: number }> }> } }> } };
class TravelFilterError extends Error {}
const routesUnavailableMessage = "Não foi possível calcular trajetos. Verifique se a Routes API e o faturamento do Google Maps estão habilitados.";
function directDistance(origin: {lat:number;lng:number}, event: Evento) {
 const latitude = event.lat ?? 0;
 const longitude = event.lng ?? 0;
 return (latitude-origin.lat)**2 + ((longitude-origin.lng)*Math.cos(origin.lat*Math.PI/180))**2;
}

type PublicEventFiltersProps = {
 events: Evento[];
 value: DiscoveryFilter;
 onChange: (value: DiscoveryFilter) => void;
 onOpen?: () => void;
};

export default function PublicEventFilters({ events, value, onChange, onOpen }: PublicEventFiltersProps) {
 const [locationMessage, setLocationMessage] = useState("");
 const [travelChoice, setTravelChoice] = useState("");
 const [travelLoading, setTravelLoading] = useState(false);
 const [travelMessage, setTravelMessage] = useState("");
 const { isLoaded: mapsLoaded } = useGoogleMaps();
 const eventSignature = events.map((event) => `${event.id}:${event.lat ?? ""}:${event.lng ?? ""}`).join("|");
 const previousEventSignature = useRef(eventSignature);
 useEffect(() => {
  if (previousEventSignature.current !== eventSignature) {
   previousEventSignature.current = eventSignature;
   if (value.travelMinutes !== null) {
    onChange({ ...value, travelMinutes: null, travelDurations: {} });
    setTravelMessage("A lista de eventos mudou. Calcule novamente o tempo de viagem.");
   }
  }
 }, [eventSignature, value, onChange]);
 const categories = Array.from(new Set(events.map(event => event.category).filter((category): category is NonNullable<Evento["category"]> => Boolean(category))));
 const input = "min-h-11 w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition focus-visible:border-violet-500 focus-visible:ring-2 focus-visible:ring-violet-500/20 dark:border-white/10 dark:bg-zinc-900 dark:text-white";
 function changeOtherFilter(next: DiscoveryFilter) {
  onChange({ ...next, travelMinutes: null, travelDurations: {} });
  if (value.travelMinutes !== null) setTravelMessage("Os filtros mudaram. Calcule novamente o tempo de viagem.");
 }

 async function calculateTravel() {
  if (!travelChoice) { onChange({ ...value, travelMinutes: null, travelDurations: {} }); setTravelMessage(""); return; }
  setTravelLoading(true);
  setTravelMessage("");
  try {
   if (!mapsLoaded || !window.google?.maps) throw new TravelFilterError("O mapa está indisponível. Verifique a conexão e tente novamente.");
   if (!navigator.geolocation) throw new TravelFilterError("Este navegador não oferece localização.");
   const location = await new Promise<{lat:number;lng:number}>((resolve,reject) => navigator.geolocation.getCurrentPosition(
    (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
    () => reject(new TravelFilterError("Permita o acesso à sua localização para calcular o tempo de viagem.")),
    { timeout: 10000, maximumAge: 60000 }
   ));
   const candidates = filterDiscovery(events, { ...value, travelMinutes: null, travelDurations: {} }).filter((event) => event.lat != null && event.lng != null).sort((a,b) => directDistance(location,a)-directDistance(location,b)).slice(0,25);
   if (candidates.length === 0) throw new TravelFilterError("Nenhum evento com localização está disponível para o cálculo.");
   let matrix: Awaited<ReturnType<RouteMatrixLibrary["RouteMatrix"]["computeRouteMatrix"]>>["matrix"];
   try {
    const { RouteMatrix } = await google.maps.importLibrary("routes") as unknown as RouteMatrixLibrary;
    ({ matrix } = await RouteMatrix.computeRouteMatrix({
     origins: [location],
     destinations: candidates.map((event) => ({ lat: event.lat!, lng: event.lng! })),
     travelMode: "DRIVING",
     fields: ["condition", "durationMillis"],
    }));
   } catch {
    throw new TravelFilterError(routesUnavailableMessage);
   }
   const durations: Record<string,number> = {};
   matrix.rows[0]?.items.forEach((item,index) => {
    if (item.condition === "ROUTE_EXISTS" && item.durationMillis != null) durations[candidates[index].id] = Math.ceil(item.durationMillis/60000);
   });
   onChange({ ...value, origin: location, travelMinutes: Number(travelChoice), travelDurations: durations });
   setTravelMessage(`Tempo de carro calculado para ${candidates.length} evento${candidates.length === 1 ? "" : "s"} mais próximo${candidates.length === 1 ? "" : "s"}.${events.length > candidates.length ? " Os demais não entram neste filtro." : ""}`);
  } catch (error) {
   setTravelMessage(error instanceof TravelFilterError ? error.message : routesUnavailableMessage);
  } finally {
   setTravelLoading(false);
  }
 }

 return (
  <details onToggle={event => { if (event.currentTarget.open) onOpen?.(); }} className="group rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-white/10 dark:bg-white/5">
   <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-zinc-900 marker:hidden focus-visible:rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:text-white [&::-webkit-details-marker]:hidden">
    <span aria-hidden="true" className="text-violet-600 transition-transform group-open:rotate-90 dark:text-violet-400">▸</span>
    <span>Mais filtros</span>
    <span className="ml-auto text-xs font-normal text-zinc-500 dark:text-zinc-400">Categoria, preço e localização</span>
   </summary>

   <div className="mt-4 grid min-w-0 gap-4 border-t border-zinc-200 pt-4 dark:border-white/10 sm:grid-cols-2">
    <label className="grid min-w-0 gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
     Categoria
     <select className={input} value={value.category} onChange={event => changeOtherFilter({ ...value, category: event.target.value })}>
      <option value="">Todas</option>
      {categories.map(category => <option key={category} value={category}>{category}</option>)}
     </select>
    </label>

    <label className="grid min-w-0 gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
     Preço máximo (R$)
     <input className={input} type="number" min="0" value={value.maxPrice} placeholder="Sem limite" onChange={event => changeOtherFilter({ ...value, maxPrice: event.target.value })} />
    </label>

    <label className="flex min-h-11 items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 sm:col-span-2">
     <input className="h-4 w-4 shrink-0 accent-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500" type="checkbox" checked={value.free} onChange={event => changeOtherFilter({ ...value, free: event.target.checked })} />
     Somente gratuitos
    </label>

    <div className="min-w-0 space-y-2 sm:col-span-2">
     <label className="grid min-w-0 gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
      Perto de mim
      <select className={input} value={value.radius} onChange={event => {
       const radius = event.target.value;
       if (!radius) { changeOtherFilter({ ...value, radius: "" }); return; }
       if (value.origin) { changeOtherFilter({ ...value, radius }); return; }
       if (!navigator.geolocation) { setLocationMessage("Este navegador não oferece localização. Use os outros filtros."); changeOtherFilter({ ...value, radius: "" }); return; }
       setLocationMessage("Obtendo localização...");
       navigator.geolocation.getCurrentPosition(position => {
        setLocationMessage("Localização aplicada ao filtro.");
        changeOtherFilter({ ...value, radius, origin: { lat: position.coords.latitude, lng: position.coords.longitude } });
       }, () => {
        changeOtherFilter({ ...value, radius: "" });
        setLocationMessage("Não foi possível obter a localização. Permita o acesso no navegador ou use os outros filtros.");
       }, { timeout: 10000, maximumAge: 60000 });
      }}>
       <option value="">Qualquer distância</option>
       <option value="5">Até 5 km</option>
       <option value="10">Até 10 km</option>
       <option value="25">Até 25 km</option>
       <option value="50">Até 50 km</option>
      </select>
     </label>
     <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Sua localização é solicitada somente ao escolher uma distância. Eventos sem coordenadas não entram nesse filtro.</p>
    </div>
    <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-white/10 sm:col-span-2">
      <label htmlFor="travel-time-filter" className="grid gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">Tempo de carro a partir de mim
        <select id="travel-time-filter" className={input} value={travelChoice} onChange={(event) => setTravelChoice(event.target.value)}>
          <option value="">Sem filtro de tempo</option><option value="15">Até 15 minutos</option><option value="30">Até 30 minutos</option><option value="60">Até 1 hora</option>
        </select>
      </label>
      <button type="button" disabled={travelLoading} onClick={() => void calculateTravel()} className="min-h-11 w-full rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 text-sm font-semibold text-violet-800 hover:bg-violet-500/20 disabled:opacity-50 dark:text-violet-200">{travelLoading ? "Calculando trajetos..." : travelChoice ? "Aplicar tempo de viagem" : "Remover filtro de tempo"}</button>
      <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Calculamos a viagem de carro somente quando você pedir. Até 25 eventos próximos são considerados por vez.</p>
      {travelMessage && <p role="status" className="text-xs text-zinc-700 dark:text-zinc-200">{travelMessage}</p>}
    </div>
   </div>
   {locationMessage && <p role="status" className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">{locationMessage}</p>}
   <button className="mt-4 rounded-md text-sm font-semibold text-violet-700 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:text-violet-300" type="button" onClick={() => { onChange(emptyDiscoveryFilter); setLocationMessage(""); setTravelChoice(""); setTravelMessage(""); }}>Limpar filtros</button>
  </details>
 );
}
