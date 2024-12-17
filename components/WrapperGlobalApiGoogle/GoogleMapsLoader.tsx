"use client";
import React, { useState } from "react";
import { LoadScript } from "@react-google-maps/api";

interface GoogleMapsLoaderProps {
  children: React.ReactNode;
}

const GoogleMapsLoader: React.FC<GoogleMapsLoaderProps> = ({ children }) => {
  const [isLoaded, setIsLoaded] = useState(false);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.error("Chave de API do Google Maps não configurada.");
    return <div>Erro: Chave de API não configurada.</div>;
  }

  return (
    <LoadScript
      googleMapsApiKey={apiKey}
      libraries={["places"]}
      onLoad={() => setIsLoaded(true)}
    >
      {isLoaded ? children : <div>Carregando Mapa...</div>}
    </LoadScript>
  );
};

export default GoogleMapsLoader;
