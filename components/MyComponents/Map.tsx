"use client";
import React, { memo, useCallback, useMemo, useRef, useState, useEffect } from "react";
import {
  GoogleMap,
  Marker,
  DirectionsRenderer,
} from "@react-google-maps/api";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  ArrowLeft,
  Route,
  Crosshair,
  MapPin,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import DrawerEventos from "@/components/MyComponents/DrawerEventos";
import { Evento } from "@/types";
import { useTheme } from "next-themes";
import { useSearchParams, useRouter } from "next/navigation";
import { useGoogleMaps } from "./GoogleMapsLoader";
import { PlaceAutocomplete } from "./PlaceAutocomplete";

// Componente de Loading Personalizado
const CustomLoading = () => (
  <div className="flex h-full min-h-[420px] items-center justify-center bg-muted">
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/95 px-5 py-3 shadow-surface backdrop-blur">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
      <span className="text-sm font-medium text-muted-foreground">Preparando o mapa…</span>
    </div>
  </div>
);

const DARK_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1c1a25" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "on" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#a1a1aa" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1c1a25" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#3f3f46" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#24212e" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#191722" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2a2734" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#111018" }] },
];

const USER_MARKER_ICON = { url: "https://maps.google.com/mapfiles/ms/icons/green-dot.png" };
const EVENT_MARKER_ICON = { url: "https://maps.google.com/mapfiles/ms/icons/purple-dot.png" };
const geocodeCache = new Map<string, Promise<google.maps.LatLngLiteral>>();

const EventMarkers = memo(function EventMarkers({
  events,
  onSelect,
  highlightedId,
}: {
  events: Evento[];
  onSelect: (event: Evento) => void;
  highlightedId: string | null;
}) {
  return events.map((event) => (
    <Marker
      key={event.id}
      position={{ lat: event.lat!, lng: event.lng! }}
      icon={EVENT_MARKER_ICON}
      zIndex={event.id === highlightedId ? 1000 : undefined}
      opacity={highlightedId && event.id !== highlightedId ? 0.6 : 1}
      onClick={() => onSelect(event)}
    />
  ));
});

type MapProps = {
  events: Evento[];
  selectedId: string | null;
  highlightedId: string | null;
  onSelectEvent: (id: string | null) => void;
};

const MapaGoogle = ({ events, selectedId, highlightedId, onSelectEvent }: MapProps) => {
  const [userLocation, setUserLocation] =
    useState<google.maps.LatLngLiteral | null>(null);
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
  const [routeError, setRouteError] = useState<string | null>(null);
  const routeRequestRef = useRef(0);
  const [eventoAtivo, setEventoAtivo] = useState<Evento | null>(null);
  const { resolvedTheme } = useTheme();

  const searchParams = useSearchParams();
  const enderecoParam = searchParams.get("endereco");
  const router = useRouter();

  const locationRequestRef = useRef(0);
  const mapRef = useRef<google.maps.Map | null>(null);
  const handleMapLoad = useCallback((map: google.maps.Map) => { mapRef.current = map; }, []);
  const handleMapUnmount = useCallback(() => { mapRef.current = null; }, []);

  // Captura a localização atual
  const getCurrentLocation = useCallback(() => {
    const requestId = ++locationRequestRef.current;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (requestId !== locationRequestRef.current) return;
          const { latitude, longitude } = pos.coords;
          setCurrentLocation({ lat: latitude, lng: longitude });
          setUserLocation({ lat: latitude, lng: longitude });

          router.replace("/");
        },
        () => { if (requestId === locationRequestRef.current) toast.error("Não foi possível acessar sua localização."); }
      );
    } else {
      toast.error("Geolocalização não suportada pelo navegador.");
    }
  }, [router]);

  // A localização pode estar indisponível; nunca descarte o clique silenciosamente.
  const calculateRoute = useCallback(async (target: google.maps.LatLngLiteral) => {
    if (isRouteTracing) return;
    const requestId = ++routeRequestRef.current;
    setDestination(target);
    setShowDirections(true);
    setEventoAtivo(null);
    setRouteError(null);
    setDirections(null);
    setIsRouteTracing(true);
    let origin = userLocation;
    try {
      if (!origin) {
        if (!navigator.geolocation) throw new Error("LOCATION_UNAVAILABLE");
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false, maximumAge: 300000, timeout: 7000,
          });
        }).catch(() => { throw new Error("LOCATION_UNAVAILABLE"); });
        if (requestId !== routeRequestRef.current) return;
        origin = { lat: position.coords.latitude, lng: position.coords.longitude };
        setUserLocation(origin);
      }
      const result = await new google.maps.DirectionsService().route({
        origin, destination: target, travelMode: google.maps.TravelMode.DRIVING,
      });
      if (requestId !== routeRequestRef.current) return;
      setDirections(result);
      toast.success("Rota calculada com sucesso!");
    } catch (error: unknown) {
      if (requestId !== routeRequestRef.current) return;
      const code = error instanceof Error ? error.message : String(error);
      const message = code.includes("LOCATION_UNAVAILABLE")
        ? "Selecione um local de partida ou permita o acesso à sua localização."
        : code.includes("REQUEST_DENIED")
          ? "O cálculo de rotas não está autorizado no mapa. Você pode abrir a rota no Google Maps."
          : code.includes("ZERO_RESULTS")
            ? "Não foi encontrada uma rota de carro entre esses locais."
            : "Não foi possível calcular a rota. Tente novamente ou abra no Google Maps.";
      setRouteError(message);
      toast.error(message);
    } finally {
      if (requestId === routeRequestRef.current) setIsRouteTracing(false);
    }
  }, [userLocation, isRouteTracing]);

  useEffect(() => () => { routeRequestRef.current += 1; }, []);

  const resetRouteRequest = useCallback(() => {
    routeRequestRef.current += 1;
    setIsRouteTracing(false);
    setRouteError(null);
    setDirections(null);
  }, []);

  const externalRouteUrl = destination ? "https://www.google.com/maps/dir/?" + new URLSearchParams({
    api: "1", destination: `${destination.lat},${destination.lng}`, travelmode: "driving",
    ...(userLocation ? { origin: `${userLocation.lat},${userLocation.lng}` } : {}),
  }).toString() : null;

  // Limpa a rota
  const clearRoute = useCallback(() => {
    if (!directions) {
      toast.warning("Nenhuma rota traçada para limpar.");
      return;
    }
    setDirections(null);
    setRouteError(null);
    toast.info("Rota limpa com sucesso.");
    setIsRouteTracing(false); // Move the modal back to the center
    router.replace("/");
  }, [directions, router]);

  const convertAddressToCoordinates = useCallback((
    endereco: string
  ): Promise<google.maps.LatLngLiteral> => {
    const cached = geocodeCache.get(endereco);
    if (cached) return cached;
    const geocoder = new window.google.maps.Geocoder();
    const request = new Promise<google.maps.LatLngLiteral>((resolve, reject) => {
      geocoder.geocode({ address: endereco }, (results: any, status) => {
        if (status === "OK" && results[0]) {
          const location = results[0].geometry.location;
          resolve({ lat: location.lat(), lng: location.lng() });
        } else {
          reject("Não foi possível converter o endereço.");
        }
      });
    });
    geocodeCache.set(endereco, request);
    request.catch(() => geocodeCache.delete(endereco));
    return request;
  }, []);

  useEffect(() => {
    const requestId = ++locationRequestRef.current;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (requestId !== locationRequestRef.current) return;
          const { latitude, longitude } = pos.coords;
          setCurrentLocation({ lat: latitude, lng: longitude });
          setUserLocation({ lat: latitude, lng: longitude });
        },
        () => undefined,
        { enableHighAccuracy: false, maximumAge: 300000, timeout: 7000 }
      );
    }
    return () => { locationRequestRef.current += 1; };
  }, []);

  useEffect(() => {
    if (!enderecoParam) return;
    const requestId = ++locationRequestRef.current;
    convertAddressToCoordinates(enderecoParam)
      .then(location => { if (requestId === locationRequestRef.current) setCurrentLocation(location); })
      .catch(() => { if (requestId === locationRequestRef.current) toast.error("Erro ao localizar endereço."); });
    return () => { locationRequestRef.current += 1; };
  }, [convertAddressToCoordinates, enderecoParam]);

  const [geocodedEvents, setGeocodedEvents] = useState<Evento[]>([]);
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(events.map(async (event) => ({
      ...event,
      ...(event.lat != null && event.lng != null
        ? { lat: event.lat, lng: event.lng }
        : await convertAddressToCoordinates(event.endereco)),
    }))).then((results) => {
      if (!cancelled) setGeocodedEvents(
        results.flatMap((result) => result.status === "fulfilled" ? [result.value] : [])
      );
    });
    return () => { cancelled = true; };
  }, [events, convertAddressToCoordinates]);

  const mapOptions = useMemo<google.maps.MapOptions>(() => ({
    fullscreenControl: false,
    cameraControl: false,
    mapTypeControl: false,
    streetViewControl: false,
    rotateControl: false,
    zoomControl: false,
    clickableIcons: false,
    gestureHandling: "greedy",
    keyboardShortcuts: true,
    styles: resolvedTheme === "dark" ? DARK_MAP_STYLE : undefined,
  }), [resolvedTheme]);

  const visibleEvents = useMemo(
    () => geocodedEvents.filter((event) => event.lat != null && event.lng != null),
    [geocodedEvents]
  );
  const handleEventSelect = useCallback((event: Evento) => onSelectEvent(event.id), [onSelectEvent]);
  const selectedEvent = useMemo(
    () => visibleEvents.find((event) => event.id === selectedId) ?? null,
    [visibleEvents, selectedId]
  );
  useEffect(() => {
    if (selectedEvent?.lat != null && selectedEvent?.lng != null) {
      mapRef.current?.panTo({ lat: selectedEvent.lat, lng: selectedEvent.lng });
    }
  }, [selectedEvent]);
  const changeZoom = useCallback((delta: number) => {
    const map = mapRef.current;
    if (!map) return;
    map.setZoom((map.getZoom() ?? 12) + delta);
  }, []);

  return (
    <div className="absolute inset-0 z-10 flex flex-col overflow-hidden bg-muted md:flex-row">
          <div className="relative min-h-0 flex-1 isolate">

            <GoogleMap
              mapContainerClassName="h-full w-full"
              center={currentLocation}
              zoom={12}
              options={mapOptions}
              onLoad={handleMapLoad}
              onUnmount={handleMapUnmount}
            >
              {userLocation && <Marker position={userLocation} icon={USER_MARKER_ICON} />}

              <EventMarkers events={visibleEvents} onSelect={handleEventSelect} highlightedId={highlightedId} />

              {directions && <DirectionsRenderer directions={directions} />}
            </GoogleMap>

            {showDirections && (
              <div className="absolute left-3 right-[72px] top-3 z-10 rounded-2xl border border-border bg-card/95 p-4 shadow-surface backdrop-blur-xl md:left-5 md:right-auto md:top-5 md:w-80">
                <button type="button" onClick={() => setShowDirections(false)} className="mb-3 flex items-center gap-2 text-sm font-semibold"><ArrowLeft className="h-4 w-4" /> Planejar rota</button>
                <div className="space-y-3">
                  <PlaceAutocomplete ariaLabel="Local de partida da rota" className="w-full rounded-xl border border-border" placeholder="Local de partida" onPlaceSelect={({ lat, lng }) => { resetRouteRequest(); setUserLocation({ lat, lng }); }} />
                  <p className="text-xs text-muted-foreground">{userLocation ? "Origem definida. Selecione outro local para alterar." : "Selecione a partida nas sugestões ou permita sua localização ao traçar."}</p>
                  <PlaceAutocomplete ariaLabel="Destino da rota" className="w-full rounded-xl border border-border" placeholder="Destino" onPlaceSelect={({ lat, lng }) => { resetRouteRequest(); setDestination({ lat, lng }); }} />
                  {destination && <p className="text-xs text-muted-foreground">Destino definido. Selecione outro local para alterar.</p>}
                  <button type="button" disabled={isRouteTracing} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60" onClick={() => destination ? void calculateRoute(destination) : toast.error("Selecione um destino nas sugestões.")}>{isRouteTracing ? "Calculando rota…" : "Traçar rota"}</button>
                  {routeError && <div role="alert" className="space-y-2 text-xs text-muted-foreground"><p>{routeError}</p>{externalRouteUrl && <a href={externalRouteUrl} target="_blank" rel="noopener noreferrer" className="inline-block font-semibold text-primary underline underline-offset-4">Abrir rota no Google Maps</a>}</div>}
                  {directions && <button type="button" className="w-full text-xs text-muted-foreground hover:text-primary" onClick={clearRoute}>Limpar rota</button>}
                </div>
              </div>
            )}

            {selectedEvent && !showDirections && (
              <div className="absolute left-3 right-[72px] top-3 z-10 flex max-w-sm gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-surface backdrop-blur-xl md:left-5 md:right-auto md:top-5">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-primary">{selectedEvent.banner && <img src={selectedEvent.banner} alt="" className="h-full w-full object-cover" />}</div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{selectedEvent.nome}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{selectedEvent.endereco}</p><button type="button" className="mt-2 text-xs font-semibold text-primary" onClick={() => setEventoAtivo(selectedEvent)}>Ver detalhes</button></div>
                <button type="button" aria-label="Fechar evento" className="self-start text-muted-foreground" onClick={() => onSelectEvent(null)}>×</button>
              </div>
            )}

            {!showDirections && !selectedEvent && <div className="absolute bottom-20 right-4 z-10 flex flex-col gap-2 md:bottom-auto md:right-5 md:top-5">
              <button type="button" className="grid h-10 w-10 place-items-center rounded-2xl border border-border bg-card/95 text-primary shadow-surface backdrop-blur hover:bg-muted" onClick={() => { setShowDirections(true); onSelectEvent(null); }} title="Planejar rota"><Route className="h-4 w-4" /></button>
            </div>}
            <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2 md:bottom-20 md:right-5">
              <div className="hidden overflow-hidden rounded-2xl border border-border bg-card/95 shadow-surface backdrop-blur md:block">
                <button type="button" className="grid h-10 w-10 place-items-center text-muted-foreground transition hover:bg-muted hover:text-primary" onClick={() => changeZoom(1)} title="Aumentar zoom" aria-label="Aumentar zoom">
                  <ZoomIn className="h-4 w-4" />
                </button>
                <div className="mx-2 h-px bg-border" />
                <button type="button" className="grid h-10 w-10 place-items-center text-muted-foreground transition hover:bg-muted hover:text-primary" onClick={() => changeZoom(-1)} title="Diminuir zoom" aria-label="Diminuir zoom">
                  <ZoomOut className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                className="grid h-11 w-11 place-items-center rounded-2xl border border-border bg-card/95 shadow-surface backdrop-blur transition hover:-translate-y-0.5 hover:bg-muted"
                onClick={getCurrentLocation}
                title="Minha localização"
                aria-label="Recentralizar na minha localização"
              >
                <Crosshair className="h-5 w-5 text-primary" />
              </button>
            </div>

            <div className="absolute bottom-5 left-5 z-10 hidden items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-2 text-xs font-medium text-muted-foreground shadow-surface backdrop-blur md:flex">
              <span className="h-2 w-2 rounded-full bg-primary" />
              {visibleEvents.length} eventos no mapa
            </div>
          </div>
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
    </div>
  );
};

export default function Mapa(props: MapProps) {
  const { isLoaded, isLoading, error } = useGoogleMaps();
  if (isLoaded) return <MapaGoogle {...props} />;
  if (isLoading) return <CustomLoading />;

  return (
    <section className="flex h-full min-h-[520px] items-center justify-center bg-muted p-8">
      <div className="max-w-sm rounded-3xl border border-border bg-card/95 p-6 text-center shadow-surface backdrop-blur">
        <MapPin className="mx-auto mb-3 h-7 w-7 text-primary" />
        <h2 className="text-lg font-semibold">Mapa indisponível</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{error || "Você ainda pode explorar e filtrar os eventos na lista."}</p>
      </div>
    </section>
  );
}
