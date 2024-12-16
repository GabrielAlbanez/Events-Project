"use client";
import React, { useRef, useState, useEffect } from "react";
import {
  LoadScript,
  GoogleMap,
  Marker,
  DirectionsRenderer,
  Autocomplete,
} from "@react-google-maps/api";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Search, ArrowLeft, Route, Crosshair, Loader, Trash2 } from "lucide-react";
import { SidebarTrigger } from "../ui/sidebar";
import { AppSidebar } from "@/components/ui/app-sidebar";

// Componente de Loading Personalizado
const CustomLoading = () => (
  <div className="flex items-center justify-center w-full h-full">
    <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-blue-600"></div>
    <span className="ml-4 text-blue-600 text-lg font-semibold">Carregando Mapa...</span>
  </div>
);

const Mapa = () => {
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [currentLocation, setCurrentLocation] = useState({
    lat: -23.55052,
    lng: -46.633308,
  });
  const [destination, setDestination] =
    useState<google.maps.LatLngLiteral | null>(null);
  const [directions, setDirections] =
    useState<google.maps.DirectionsResult | null>(null);
  const [showDirections, setShowDirections] = useState(false);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const startRef = useRef<google.maps.places.Autocomplete | null>(null);
  const endRef = useRef<google.maps.places.Autocomplete | null>(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.error("Chave de API do Google Maps não configurada.");
    return <div>Erro: Chave de API não configurada.</div>;
  }

  // Captura a localização atual
  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setCurrentLocation({ lat: latitude, lng: longitude });
          toast.success("Localização capturada com sucesso!");
        },
        () => toast.error("Não foi possível acessar sua localização.")
      );
    } else {
      toast.error("Geolocalização não suportada pelo navegador.");
    }
  };

  // Executa automaticamente ao carregar o componente
  useEffect(() => {
    getCurrentLocation();
  }, []);

  // Traça rota entre origem e destino
  const calculateRoute = () => {
    if (startRef.current && endRef.current) {
      const origin = startRef.current.getPlace()?.geometry?.location;
      const destination = endRef.current.getPlace()?.geometry?.location;
      if (origin && destination) {
        const directionsService = new google.maps.DirectionsService();
        directionsService.route(
          {
            origin,
            destination,
            travelMode: google.maps.TravelMode.DRIVING,
          },
          (result, status) => {
            if (status === google.maps.DirectionsStatus.OK) {
              setDirections(result);
              toast.success("Rota calculada com sucesso!");
            } else {
              toast.error("Erro ao calcular a rota.");
            }
          }
        );
      }
    }
  };

  // Limpa a rota
  const clearRoute = () => {
    if (!directions) {
      toast.warning("Nenhuma rota traçada para limpar.");
      return;
    }
    setDirections(null);
    toast.info("Rota limpa com sucesso.");
  };

  const mapStyles = [
    { featureType: "poi", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
    { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
    { featureType: "road", elementType: "labels", stylers: [{ visibility: "on" }] },
  ];

  return (
    <div className="relative h-screen w-full flex flex-col lg:flex-row  md:flex-row">
      {/* Sidebar */}
      <AppSidebar
        onGetLocation={getCurrentLocation}
        onTraceRoute={calculateRoute}
        onClearRoute={clearRoute}
      />

      {/* Google Maps */}
      <LoadScript
        googleMapsApiKey={apiKey}
        libraries={["places"]}
        onLoad={() => setIsScriptLoaded(true)}
        onError={() => toast.error("Erro ao carregar o Google Maps")}
        loadingElement={<CustomLoading />} // Componente personalizado de loading
      >
        <div className="relative flex-1">
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "100%" }}
            center={currentLocation}
            zoom={12}
            options={{
              fullscreenControl: false,
              mapTypeControl: false,
              streetViewControl: false,
              styles: mapStyles,
              zoomControl: false,
            }}
          >
            <Marker position={currentLocation} label="Você" />
            {directions && <DirectionsRenderer directions={directions} />}
          </GoogleMap>

          {/* Navbar / Directions */}
          <div className="absolute top-4 left-4 right-4 lg:left-[50px] right-auto z-10 bg-white/60 backdrop-blur-md shadow-lg rounded-lg px-6 py-4 transition-all duration-500">
            {!showDirections ? (
              <div className="flex items-center">
                <SidebarTrigger>
                  <button className="text-gray-600 hover:text-gray-800 mr-3">
                    ☰
                  </button>
                </SidebarTrigger>


                <div className="h-6 w-px bg-gray-300 mx-4"></div>

                <Search className="text-gray-400 mr-3" />
                <Autocomplete
                  onLoad={(autocomplete) =>
                    (autocompleteRef.current = autocomplete)
                  }
                >

                
                  <input
                    type="text"
                    placeholder="Digite um destino"
                    className="w-full border-none focus:outline-none bg-transparent truncate text-gray-700"
                  />
                </Autocomplete>
                <div className="flex items-center justify-center gap-2">
                <button
                  className="ml-4 text-blue-600 hover:text-blue-800"
                  onClick={() => setShowDirections(true)}
                >
 
                    <Route className="w-5 h-5" />
  
      
                </button>


                <button
                  className="ml-4 text-blue-600 hover:text-blue-800"
                  onClick={() => clearRoute()}
                >
 
                    <Trash2 className="w-5 h-5" color="red" />
  
      
                </button>
                </div>
                
              </div>
            ) : (
              <div>
                <div className="flex items-center mb-4">
                  <ArrowLeft
                    className="w-5 h-5 text-gray-600 cursor-pointer hover:text-gray-800 mr-4"
                    onClick={() => setShowDirections(false)}
                  />
                  <h3 className="text-lg font-semibold">Directions</h3>
                </div>
                <div className="flex flex-col gap-2">
                  <Autocomplete
                    onLoad={(autocomplete) => (startRef.current = autocomplete)}
                  >
                    <input
                      type="text"
                      placeholder="Your location"
                      className="w-full px-3 py-2 border rounded-md focus:outline-none"
                    />
                  </Autocomplete>
                  <Autocomplete
                    onLoad={(autocomplete) => (endRef.current = autocomplete)}
                  >
                    <input
                      type="text"
                      placeholder="Choose destination"
                      className="w-full px-3 py-2 border rounded-md focus:outline-none"
                    />
                  </Autocomplete>
                  <button
                    className="bg-blue-600 text-white px-4 py-2 rounded-md mt-2 hover:bg-blue-800"
                    onClick={calculateRoute}
                  >
                    Traçar Rota
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Botão Minha Localização */}
          <button
            className="absolute bottom-4 right-4 bg-white p-2 rounded-full shadow-md hover:bg-gray-200 transition-all"
            onClick={getCurrentLocation}
            title="Minha Localização"
          >
            <Crosshair className="w-6 h-6 text-blue-500" />
          </button>
        </div>
      </LoadScript>
      <ToastContainer position="bottom-right" autoClose={5000} />
    </div>
  );
};

export default Mapa;
