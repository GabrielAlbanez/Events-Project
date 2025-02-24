"use client";
import { LoadScript } from "@react-google-maps/api";
import { useState } from "react";
import { toast } from "react-toastify";
import CustomLoading from "./CustomLoading";

const GoogleMapsLoader = ({ children }: { children: React.ReactNode }) => {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const [isScriptLoaded, setIsScriptLoaded] = useState(false);


  if (!apiKey) {
    console.error("Chave de API do Google Maps não configurada.");
    return <div>Erro: Chave de API não configurada.</div>;
  }

  return (
    <LoadScript
        googleMapsApiKey={apiKey!}
        libraries={["places"]}
        onLoad={() => setIsScriptLoaded(true)}
        onError={() => toast.error("Erro ao carregar o Google Maps")}
        loadingElement={<CustomLoading />} // 🔵 Exibe um loading até o script carregar
      >
        {!isScriptLoaded ? <CustomLoading /> : null} {/* 🔵 Garante que o loading apareça */}

      {children}
    </LoadScript>
  );
};

export default GoogleMapsLoader;
