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
import {
  Search,
  ArrowLeft,
  Route,
  Crosshair,
  Loader,
  Trash2,
} from "lucide-react";
import { SidebarTrigger } from "../ui/sidebar";
import DrawerEventos from "@/components/MyComponents/DrawerEventos";
import { Evento } from "@/types";
import { useTheme } from "next-themes";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

// Componente de Loading Personalizado
const CustomLoading = () => (
  <div className="flex items-center justify-center w-full h-full">
    <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-blue-600"></div>
    <span className="ml-4 text-blue-600 text-lg font-semibold">
      Carregando Mapa...
    </span>
  </div>
);

const Mapa = () => {
  const rota = usePathname();
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
   const [userLocation, setUserLocation] = useState<google.maps.LatLngLiteral | null>(null);
  const [currentLocation, setCurrentLocation] = useState({
    lat: -23.55052,
    lng: -46.633308,
  });
  const [destination, setDestination] =
    useState<google.maps.LatLngLiteral | null>(null);
  const [directions, setDirections] =
    useState<google.maps.DirectionsResult | null>(null);
  const [showDirections, setShowDirections] = useState(false);
  const [isRouteTracing, setIsRouteTracing] = useState(false);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const startRef = useRef<google.maps.places.Autocomplete | null>(null);
  const endRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [isAddressLoaded, setIsAddressLoaded] = useState({
    lat: 0,
    lng : 0
  });

  const [eventoAtivo, setEventoAtivo] = useState<Evento | null>(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const tema = useTheme();

  const darkMapStyle = [
    { elementType: "geometry", stylers: [{ color: "#212121" }] },
    { elementType: "labels.icon", stylers: [{ visibility: "on" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
    {
      featureType: "administrative",
      elementType: "geometry",
      stylers: [{ color: "#757575" }],
    },
    {
      featureType: "administrative.locality",
      elementType: "labels.text.fill",
      stylers: [{ color: "#bdbdbd" }],
    },
    {
      featureType: "poi",
      elementType: "geometry",
      stylers: [{ color: "#2b2b2b" }],
    },
    {
      featureType: "poi",
      elementType: "labels.text.fill",
      stylers: [{ color: "#ffffff" }],
    },
    {
      featureType: "poi.business",
      elementType: "labels.text",
      stylers: [{ visibility: "on" }],
    },
    {
      featureType: "poi.park",
      elementType: "geometry",
      stylers: [{ color: "#181818" }],
    },
    {
      featureType: "poi.park",
      elementType: "labels.text.fill",
      stylers: [{ color: "#616161" }],
    },
    {
      featureType: "road",
      elementType: "geometry.fill",
      stylers: [{ color: "#2c2c2c" }],
    },
    {
      featureType: "road",
      elementType: "labels.text.fill",
      stylers: [{ color: "#8a8a8a" }],
    },
    {
      featureType: "water",
      elementType: "geometry",
      stylers: [{ color: "#000000" }],
    },
    {
      featureType: "water",
      elementType: "labels.text.fill",
      stylers: [{ color: "#3d3d3d" }],
    },
  ];

  const searchParams = useSearchParams();
  const enderecoParam = searchParams.get("endereco");
  const router = useRouter();

  const mapRef = useRef<google.maps.Map | null>(null);

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

          router.replace("/");
        },
        () => toast.error("Não foi possível acessar sua localização.")
      );
    } else {
      toast.error("Geolocalização não suportada pelo navegador.");
    }
  };

  // Traça rota entre origem e destino
  const calculateRoute = (destination: google.maps.LatLngLiteral) => {
    // const origin = currentLocation;
    const origin = userLocation;
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
            setIsRouteTracing(true); // Move the modal to the right
            setEventoAtivo(null); // Close the modal
          } else {
            toast.error("Erro ao calcular a rota.");
          }
        }
      );
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
    setIsRouteTracing(false); // Move the modal back to the center
    router.replace("/");
  };

  const mapStyles = [
    {
      featureType: "poi",
      elementType: "labels.icon",
      stylers: [{ visibility: "off" }],
    },
    {
      featureType: "transit",
      elementType: "labels.icon",
      stylers: [{ visibility: "off" }],
    },
    {
      featureType: "road",
      elementType: "labels",
      stylers: [{ visibility: "on" }],
    },
  ];

  const convertAddressToCoordinates = (
    endereco: string
  ): Promise<google.maps.LatLngLiteral> => {
    const geocoder = new window.google.maps.Geocoder();
    return new Promise((resolve, reject) => {
      geocoder.geocode({ address: endereco }, (results: any, status) => {
        if (status === "OK" && results[0]) {
          const location = results[0].geometry.location;
          resolve({ lat: location.lat(), lng: location.lng() });
        } else {
          reject("Não foi possível converter o endereço.");
        }
      });
    });
  };

  const verifyEnderecoSerachParams = () => {

    
    if (enderecoParam) {
      convertAddressToCoordinates(decodeURIComponent(enderecoParam))
        .then((location) => {
          setCurrentLocation(location);

        })
        .catch(() => toast.error("Erro ao localizar endereço."));
    }
  };

  useEffect(() => {
    const carregarEventosReais = async () => {
      try {
        const response = await fetch("/api/AllEvents");
        const eventosReais: Evento[] = await response.json();
        const eventosAtualizados: Evento[] = [];

        for (const evento of eventosReais) {
          try {
            const coordenadas = await convertAddressToCoordinates(
              evento.endereco
            );
            eventosAtualizados.push({ ...evento, ...coordenadas });
          } catch (error) {
            console.error(
              `Erro ao converter endereço "${evento.endereco}":`,
              error
            );
          }
        }

        setEventos(eventosAtualizados);
      } catch (error) {
        console.error("Erro ao carregar eventos reais:", error);
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setCurrentLocation({ lat: latitude, lng: longitude })
          setUserLocation( {lat: latitude, lng: longitude} )

        },
        () => toast.error("Não foi possível acessar sua localização.")
      );
    } else {
      toast.error("Geolocalização não suportada pelo navegador.");
    }
    verifyEnderecoSerachParams();
    carregarEventosReais();
  }, [isScriptLoaded, enderecoParam,isAddressLoaded]);

  return (
    <div className="relative h-screen w-full flex z-10 flex-col lg:flex-row md:flex-row">
      {rota === "/" && (
        <>
          {/* Sidebar */}

          {/* Google Maps */}
          {/* <LoadScript
            googleMapsApiKey={apiKey}
            libraries={["places"]}
            onLoad={() => setIsScriptLoaded(true)}
            onError={() => toast.error("Erro ao carregar o Google Maps")}
            loadingElement={<CustomLoading />} // Componente personalizado de loading
          > */}
          <div className="relative flex-1">
            <GoogleMap
              mapContainerStyle={{ width: "100%", height: "100%" }}
              center={currentLocation}
              zoom={12}
              options={{
                fullscreenControl: false,
                mapTypeControl: false,
                streetViewControl: false,
                zoomControl: false,
                styles: tema.theme === "dark" ? darkMapStyle : undefined,
              }}
            >
              <Marker
                position={currentLocation}
                icon={{
                  url: "http://maps.google.com/mapfiles/ms/icons/green-dot.png", // URL da bolinha azul
                }}
              />

              {eventos
                .filter(
                  (evento) =>
                    evento.lat !== undefined &&
                    evento.lng !== undefined &&
                    evento.validate
                )
                .map((evento) => (
                  <Marker
                    key={evento.id}
                    position={{ lat: evento.lat!, lng: evento.lng! }}
                    icon={{
                      url: "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
                    }}
                    onClick={() => setEventoAtivo(evento)} // Atualiza o evento ativo
                  />
                ))}

              {directions && <DirectionsRenderer directions={directions} />}
            </GoogleMap>

            {/* Navbar / Directions */}
            <div
              className={`absolute bg-background text-foreground top-4 left-4 right-4 lg:left-[50px] right-auto z-10  shadow-lg rounded-lg px-6 py-4 `}
            >
              {!showDirections ? (
                <div className="flex items-center">
                  <SidebarTrigger>
                    <button className=" mr-3">☰</button>
                  </SidebarTrigger>

                  <div className="h-6 w-px bg-gray-300 mx-4"></div>

                  <Search className="text-gray-400 mr-3" />
                  <Autocomplete
                    onLoad={(autocomplete) =>
                      (autocompleteRef.current = autocomplete)
                    }
                    onPlaceChanged={() => {
                      if (autocompleteRef.current) {
                        const place = autocompleteRef.current.getPlace();
                        if (place.geometry?.location) {
                          setDestination({
                            lat: place.geometry.location.lat(),
                            lng: place.geometry.location.lng(),
                          });
                          setCurrentLocation({
                            lat: place.geometry.location.lat(),
                            lng: place.geometry.location.lng(),
                          });
                          toast.success("Localização encontrada!");
                        } else {
                          toast.error(
                            "Não foi possível obter a localização do destino."
                          );
                        }
                      }
                    }}
                  >
                    <input
                      type="text"
                      placeholder="Digite um destino"
                      className="w-full border-none focus:outline-none bg-transparent truncate text-foreground"
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
                      onLoad={(autocomplete) =>
                        (startRef.current = autocomplete)
                      }
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
                      onClick={() => {
                        if (destination) {
                          calculateRoute(destination);
                        } else {
                          toast.error("Destino não definido.");
                        }
                      }}
                    >
                      Traçar Rota
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Botão Minha Localização */}
            <button
              className="absolute bottom-4 right-2 bg-white p-2 rounded-full shadow-md hover:bg-gray-200 transition-all"
              onClick={getCurrentLocation}
              title="Minha Localização"
            >
              <Crosshair className="w-6 h-6 text-blue-500" />
            </button>
          </div>
          {/* </LoadScript> */}
          {/* Drawer do Evento */}
          {eventoAtivo && (
            <DrawerEventos
              evento={{
                ...eventoAtivo,
                lat: eventoAtivo.lat!,
                lng: eventoAtivo.lng!,
                intialDate: eventoAtivo.dataInicio,
                finishDate: eventoAtivo.dataFim,
              }}
              onClose={() => setEventoAtivo(null)} // Fecha o Drawer
              onTraceRoute={() =>
                calculateRoute({ lat: eventoAtivo.lat!, lng: eventoAtivo.lng! })
              }
              isRouteTracing={isRouteTracing} // Pass the state to DrawerEventos
            />
          )}
          <ToastContainer position="bottom-right" autoClose={5000} />
        </>
      )}
    </div>
  );
};

export default Mapa;
