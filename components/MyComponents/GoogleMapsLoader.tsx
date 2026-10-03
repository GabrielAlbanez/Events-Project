"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

export type MapsStatus = { isLoaded: boolean; isLoading: boolean; error: string | null };
export const GoogleMapsContext = createContext<MapsStatus>({ isLoaded: false, isLoading: false, error: null });
export const useGoogleMaps = () => useContext(GoogleMapsContext);
const Runtime = dynamic(() => import("./GoogleMapsRuntime"), { ssr: false });

export default function GoogleMapsLoader({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<MapsStatus>({ isLoaded: false, isLoading: true, error: null });
  const needed = pathname === "/" || pathname === "/EventsCreated" || pathname === "/CriarEvento" || /^\/eventos\/[^/]+\/editar$/.test(pathname);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  const value = needed && apiKey ? status : { isLoaded: false, isLoading: false,
    error: needed ? "Configure a chave do Google Maps para visualizar o mapa." : null };
  return <GoogleMapsContext.Provider value={value}>{needed && apiKey && <Runtime apiKey={apiKey} onStatus={setStatus} />}{children}</GoogleMapsContext.Provider>;
}
