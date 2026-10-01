"use client";

import { useState } from "react";
import { Evento } from "@/types";

export type DiscoveryFilter = { category: string; free: boolean; maxPrice: string; radius: string; origin: {lat:number;lng:number} | null };
export const emptyDiscoveryFilter: DiscoveryFilter = {category:'',free:false,maxPrice:'',radius:'',origin:null};

export function filterDiscovery(events: Evento[], filter: DiscoveryFilter) {
 return events.filter(event => { if(filter.category && event.category!==filter.category)return false;if(filter.free && !event.isFree)return false;if(filter.maxPrice && !event.isFree && (event.priceCents==null || event.priceCents<=0 || event.priceCents>Number(filter.maxPrice)*100))return false;if(filter.radius && filter.origin){if(event.lat==null || event.lng==null)return false;const rad=(value:number)=>value*Math.PI/180;const dlat=rad(event.lat-filter.origin.lat),dlng=rad(event.lng-filter.origin.lng);const a=Math.sin(dlat/2)**2+Math.cos(rad(filter.origin.lat))*Math.cos(rad(event.lat))*Math.sin(dlng/2)**2;const distance=6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));if(distance>Number(filter.radius))return false;}return true; });
}

type PublicEventFiltersProps = {
 events: Evento[];
 value: DiscoveryFilter;
 onChange: (value: DiscoveryFilter) => void;
 onOpen?: () => void;
};

export default function PublicEventFilters({ events, value, onChange, onOpen }: PublicEventFiltersProps) {
 const [locationMessage, setLocationMessage] = useState("");
 const categories = Array.from(new Set(events.map(event => event.category).filter((category): category is NonNullable<Evento["category"]> => Boolean(category))));
 const input = "min-h-11 w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition focus-visible:border-violet-500 focus-visible:ring-2 focus-visible:ring-violet-500/20 dark:border-white/10 dark:bg-zinc-900 dark:text-white";

 return (
  <details onToggle={event => { if (event.currentTarget.open) onOpen?.(); }} className="group rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-white/10 dark:bg-white/5">
   <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-zinc-900 marker:hidden focus-visible:rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:text-white [&::-webkit-details-marker]:hidden">
    <span aria-hidden="true" className="text-violet-600 transition-transform group-open:rotate-90 dark:text-violet-400">▸</span>
    <span>Mais filtros</span>
    <span className="ml-auto text-xs font-normal text-zinc-500 dark:text-zinc-400">Categoria, preço e distância</span>
   </summary>

   <div className="mt-4 grid min-w-0 gap-4 border-t border-zinc-200 pt-4 dark:border-white/10 sm:grid-cols-2">
    <label className="grid min-w-0 gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
     Categoria
     <select className={input} value={value.category} onChange={event => onChange({ ...value, category: event.target.value })}>
      <option value="">Todas</option>
      {categories.map(category => <option key={category} value={category}>{category}</option>)}
     </select>
    </label>

    <label className="grid min-w-0 gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
     Preço máximo (R$)
     <input className={input} type="number" min="0" value={value.maxPrice} placeholder="Sem limite" onChange={event => onChange({ ...value, maxPrice: event.target.value })} />
    </label>

    <label className="flex min-h-11 items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 sm:col-span-2">
     <input className="h-4 w-4 shrink-0 accent-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500" type="checkbox" checked={value.free} onChange={event => onChange({ ...value, free: event.target.checked })} />
     Somente gratuitos
    </label>

    <div className="min-w-0 space-y-2 sm:col-span-2">
     <label className="grid min-w-0 gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
      Perto de mim
      <select className={input} value={value.radius} onChange={event => {
       const radius = event.target.value;
       if (!radius) { onChange({ ...value, radius: "" }); return; }
       if (value.origin) { onChange({ ...value, radius }); return; }
       if (!navigator.geolocation) { setLocationMessage("Este navegador não oferece localização. Use os outros filtros."); onChange({ ...value, radius: "" }); return; }
       setLocationMessage("Obtendo localização...");
       navigator.geolocation.getCurrentPosition(position => {
        setLocationMessage("Localização aplicada ao filtro.");
        onChange({ ...value, radius, origin: { lat: position.coords.latitude, lng: position.coords.longitude } });
       }, () => {
        onChange({ ...value, radius: "" });
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
   </div>
   {locationMessage && <p role="status" className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">{locationMessage}</p>}
   <button className="mt-4 rounded-md text-sm font-semibold text-violet-700 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:text-violet-300" type="button" onClick={() => { onChange(emptyDiscoveryFilter); setLocationMessage(""); }}>Limpar filtros</button>
  </details>
 );
}
