"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useJsApiLoader, type Libraries } from "@react-google-maps/api";

type MapsStatus = { isLoaded: boolean; isLoading: boolean; error: string | null };
const GoogleMapsContext = createContext<MapsStatus>({ isLoaded: false, isLoading: false, error: null });
const libraries: Libraries = ["places"];
export const useGoogleMaps = () => useContext(GoogleMapsContext);

function ConfiguredGoogleMaps({ apiKey, children }: { apiKey: string; children: ReactNode }) {
  const { isLoaded, loadError } = useJsApiLoader({ googleMapsApiKey: apiKey, libraries });
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (isLoaded || loadError) return;
    const timer = window.setTimeout(() => setTimedOut(true), 15000);
    return () => window.clearTimeout(timer);
  }, [isLoaded, loadError]);
  const error = loadError
    ? "O Google Maps não pôde ser carregado. Verifique a chave, as APIs habilitadas e a conexão."
    : timedOut && !isLoaded
      ? "O Google Maps demorou para responder. Verifique sua conexão e tente atualizar a página."
      : null;
  return (
    <GoogleMapsContext.Provider value={{ isLoaded, isLoading: !isLoaded && !error, error }}>
      {children}
    </GoogleMapsContext.Provider>
  );
}

export default function GoogleMapsLoader({ children }: { children: ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    return (
      <GoogleMapsContext.Provider value={{ isLoaded: false, isLoading: false, error: "Configure a chave do Google Maps para visualizar o mapa." }}>
        {children}
      </GoogleMapsContext.Provider>
    );
  }
  return <ConfiguredGoogleMaps apiKey={apiKey}>{children}</ConfiguredGoogleMaps>;
}
