"use client";
import { LoadScript } from "@react-google-maps/api";

const GoogleMapsLoader = ({ children }: { children: React.ReactNode }) => {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.error("Chave de API do Google Maps não configurada.");
    return <div>Erro: Chave de API não configurada.</div>;
  }

  return (
    <LoadScript
      googleMapsApiKey={apiKey}
      libraries={["places"]}
      preventGoogleFontsLoading={true}
    >
      {children}
    </LoadScript>
  );
};

export default GoogleMapsLoader;
