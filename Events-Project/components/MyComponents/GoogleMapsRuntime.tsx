"use client";
import { useEffect, useState } from "react";
import { useJsApiLoader, type Libraries } from "@react-google-maps/api";
import type { MapsStatus } from "./GoogleMapsLoader";

const libraries: Libraries = ["places"];
export default function GoogleMapsRuntime({ apiKey, onStatus }: { apiKey: string; onStatus: (status: MapsStatus) => void }) {
  const { isLoaded, loadError } = useJsApiLoader({ googleMapsApiKey: apiKey, libraries });
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (isLoaded || loadError) return;
    const timer = window.setTimeout(() => setTimedOut(true), 15000);
    return () => window.clearTimeout(timer);
  }, [isLoaded, loadError]);
  const error = loadError ? "O Google Maps não pôde ser carregado. Verifique a chave, as APIs habilitadas e a conexão."
    : timedOut && !isLoaded ? "O Google Maps demorou para responder. Verifique sua conexão e tente atualizar a página." : null;
  useEffect(() => { onStatus({ isLoaded, isLoading: !isLoaded && !error, error }); }, [isLoaded, error, onStatus]);
  return null;
}
