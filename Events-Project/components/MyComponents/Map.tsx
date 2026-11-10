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
import { GoogleMapsPreference } from "./GoogleMapsPreference";
import Link from "next/link";

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
  { elementType: "geometry", stylers: [{ color: "#141820" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "on" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#a1a1aa" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#141820" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#3f3f46" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#1A202B" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#151F21" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#242D3C" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0B111C" }] },
];

const USER_MARKER_ICON = { url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="11" fill="#C7F34A" stroke="#0B0D12" stroke-width="2"/><circle cx="13" cy="13" r="3" fill="#0B0D12"/></svg>') };
const createEventMarkerIcon = (fill: string, ink: string) => ({ url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36"><path d="M14 1C7 1 1.5 6.5 1.5 13.5 1.5 23 14 34.5 14 34.5S26.5 23 26.5 13.5C26.5 6.5 21 1 14 1Z" fill="' + fill + '" stroke="' + ink + '" stroke-width="2"/><circle cx="14" cy="13" r="4.5" fill="' + ink + '"/></svg>') });
const EVENT_MARKER_ICON = createEventMarkerIcon("#2455FF", "#fff");
const SELECTED_EVENT_MARKER_ICON = createEventMarkerIcon("#C7F34A", "#10151F");
const geocodeCache = new Map<string, Promise<google.maps.LatLngLiteral>>();

const EventMarkers = memo(function EventMarkers({
  events,
  onSelect,
  selectedId,
  highlightedId,
}: {
  events: Evento[];
  onSelect: (event: Evento) => void;
  selectedId: string | null;
  highlightedId: string | null;
}) {
  return events.map((event) => (
    <Marker
      key={event.id}
      position={{ lat: event.lat!, lng: event.lng! }}
      title={event.id === selectedId ? event.nome + " — evento selecionado" : event.nome}
      icon={event.id === selectedId ? SELECTED_EVENT_MARKER_ICON : EVENT_MARKER_ICON}
      zIndex={event.id === selectedId ? 1001 : event.id === highlightedId ? 1000 : undefined}
      opacity={highlightedId && event.id !== highlightedId && event.id !== selectedId ? 0.6 : 1}
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
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
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
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (requestId !== locationRequestRef.current) return;
          const { latitude, longitude } = pos.coords;
          setCurrentLocation({ lat: latitude, lng: longitude });
          setUserLocation({ lat: latitude, lng: longitude });
          setIsLocating(false);
          setShowLocationPrompt(false);
          router.replace("/");
        },
        () => { if (requestId === locationRequestRef.current) { setIsLocating(false); toast.error("Não foi possível acessar sua localização. Você pode explorar o mapa ou selecionar um endereço."); } },
        { enableHighAccuracy: false, maximumAge: 60000, timeout: 7000 }
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
    const origin = userLocation;
    try {
      if (!origin) throw new Error("LOCATION_UNAVAILABLE");
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
        ? "Selecione um local de partida ou escolha Usar minha localização antes de traçar."
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
      geocoder.geocode({ address: endereco }, (results, status) => {
        if (status === "OK" && results?.[0]) {
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

  useEffect(() => () => { locationRequestRef.current += 1; }, []);

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
  const selectedLat = selectedEvent?.lat;
  const selectedLng = selectedEvent?.lng;
  useEffect(() => {
    if (selectedId && selectedLat != null && selectedLng != null) {
      mapRef.current?.panTo({ lat: selectedLat, lng: selectedLng });
    }
  }, [selectedId, selectedLat, selectedLng]);
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

              <EventMarkers events={visibleEvents} onSelect={handleEventSelect} selectedId={selectedId} highlightedId={highlightedId} />

              {directions && <DirectionsRenderer directions={directions} />}
            </GoogleMap>

            {showDirections && (
              <div className="absolute left-3 right-[72px] top-3 z-10 rounded-2xl border border-border bg-card/95 p-4 shadow-surface backdrop-blur-xl md:left-5 md:right-auto md:top-5 md:w-80">
                <button type="button" onClick={() => setShowDirections(false)} className="mb-3 flex items-center gap-2 text-sm font-semibold"><ArrowLeft className="h-4 w-4" /> Planejar rota</button>
                <div className="space-y-3">
                  <PlaceAutocomplete ariaLabel="Local de partida da rota" className="w-full rounded-xl border border-border" placeholder="Local de partida" onPlaceSelect={({ lat, lng }) => { resetRouteRequest(); setUserLocation({ lat, lng }); }} />
                  <p className="text-xs leading-5 text-muted-foreground">{userLocation ? "Origem definida. Selecione outro local para alterar." : "Selecione a partida nas sugestões ou escolha usar sua localização."} Os endereços e a localização usados no trajeto são enviados ao Google para calcular a rota.</p>
                  <button type="button" disabled={isLocating} onClick={getCurrentLocation} className="inline-flex min-h-11 items-center rounded-lg text-sm font-semibold text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">{isLocating ? "Obtendo localização…" : "Usar minha localização"}</button>
                  <PlaceAutocomplete ariaLabel="Destino da rota" className="w-full rounded-xl border border-border" placeholder="Destino" onPlaceSelect={({ lat, lng }) => { resetRouteRequest(); setDestination({ lat, lng }); }} />
                  {destination && <p className="text-xs text-muted-foreground">Destino definido. Selecione outro local para alterar.</p>}
                  <button type="button" disabled={isRouteTracing} className="min-h-11 w-full rounded-xl bg-cta px-4 py-2.5 text-sm font-semibold text-cta-foreground hover:bg-cta/90 disabled:cursor-wait disabled:opacity-60" onClick={() => destination ? void calculateRoute(destination) : toast.error("Selecione um destino nas sugestões.")}>{isRouteTracing ? "Calculando rota…" : "Traçar rota"}</button>
                  {routeError && <div role="alert" className="space-y-2 text-xs text-muted-foreground"><p>{routeError}</p>{externalRouteUrl && <a href={externalRouteUrl} target="_blank" rel="noopener noreferrer" className="inline-block font-semibold text-brand underline underline-offset-4">Abrir rota no Google Maps</a>}</div>}
                  {directions && <button type="button" className="w-full text-xs text-muted-foreground hover:text-brand" onClick={clearRoute}>Limpar rota</button>}
                </div>
              </div>
            )}

            {selectedEvent && !showDirections && (
              <div className="absolute left-3 right-[72px] top-3 z-10 flex max-w-sm gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-surface backdrop-blur-xl md:left-5 md:right-auto md:top-5">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-primary">{selectedEvent.banner && <img src={selectedEvent.banner} alt="" className="h-full w-full object-cover" />}</div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{selectedEvent.nome}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{selectedEvent.endereco}</p><button type="button" className="mt-2 text-xs font-semibold text-brand" onClick={() => setEventoAtivo(selectedEvent)}>Ver detalhes</button></div>
                <button type="button" aria-label="Fechar evento" className="self-start text-muted-foreground" onClick={() => onSelectEvent(null)}>×</button>
              </div>
            )}

            {!showDirections && !selectedEvent && <div className="absolute bottom-20 right-4 z-10 flex flex-col gap-2 md:bottom-auto md:right-5 md:top-5">
              <button type="button" className="grid h-11 w-11 place-items-center rounded-2xl border border-border bg-card/95 text-brand shadow-surface backdrop-blur hover:bg-muted" onClick={() => { setShowDirections(true); onSelectEvent(null); }} title="Planejar rota"><Route className="h-4 w-4" /></button>
            </div>}
            <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2 md:bottom-20 md:right-5">
              <div className="hidden overflow-hidden rounded-2xl border border-border bg-card/95 shadow-surface backdrop-blur md:block">
                <button type="button" className="grid h-11 w-11 place-items-center text-muted-foreground transition hover:bg-muted hover:text-brand" onClick={() => changeZoom(1)} title="Aumentar zoom" aria-label="Aumentar zoom">
                  <ZoomIn className="h-4 w-4" />
                </button>
                <div className="mx-2 h-px bg-border" />
                <button type="button" className="grid h-11 w-11 place-items-center text-muted-foreground transition hover:bg-muted hover:text-brand" onClick={() => changeZoom(-1)} title="Diminuir zoom" aria-label="Diminuir zoom">
                  <ZoomOut className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                className="grid h-11 w-11 place-items-center rounded-2xl border border-border bg-card/95 shadow-surface backdrop-blur transition hover:-translate-y-0.5 hover:bg-muted"
                onClick={() => setShowLocationPrompt(true)}
                title="Usar minha localização"
                aria-label="Usar minha localização"
              >
                <Crosshair className="h-5 w-5 text-brand" />
              </button>
            </div>

            {showLocationPrompt && <section aria-label="Usar sua localização no mapa" className="absolute inset-x-3 top-3 z-20 max-w-sm space-y-3 rounded-2xl bg-card p-5 shadow-surface md:left-5 md:right-auto">
              <h2 className="text-base font-semibold">Usar sua localização?</h2>
              <p className="text-sm leading-6 text-muted-foreground">Sua posição será exibida no mapa do Google. Se você calcular um trajeto, origem e destino também serão enviados ao Google. Você pode continuar sem compartilhar a localização.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={isLocating} onClick={getCurrentLocation} className="min-h-11 rounded-xl bg-cta px-4 py-2 text-sm font-semibold text-cta-foreground disabled:opacity-60">{isLocating ? "Obtendo localização…" : "Usar minha localização"}</button>
                <button type="button" onClick={() => { locationRequestRef.current += 1; setIsLocating(false); setShowLocationPrompt(false); }} className="min-h-11 rounded-xl px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Agora não</button>
              </div>
            </section>}

            {!showDirections && !selectedEvent && !showLocationPrompt && <Link href="/privacidade#preferencias" className="absolute left-3 top-3 z-10 inline-flex min-h-11 items-center rounded-xl bg-card px-3 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:left-5 md:top-5">Privacidade do mapa</Link>}

            <div className="absolute bottom-5 left-5 z-10 hidden items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-2 text-xs font-medium text-muted-foreground shadow-surface backdrop-blur md:flex">
              <span className="h-2 w-2 rounded-full bg-primary" />
              {visibleEvents.length} {visibleEvents.length === 1 ? "evento" : "eventos"} no mapa
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
  const { isLoaded, isLoading, error, enabled, configured } = useGoogleMaps();
  if (isLoaded) return <MapaGoogle {...props} />;
  if (isLoading) return <CustomLoading />;

  if (!enabled && configured) return <section aria-label="Ativar mapa opcional" className="flex h-full min-h-[420px] items-center justify-center bg-muted p-6"><div className="max-w-md space-y-4 rounded-2xl bg-card p-6"><h2 className="text-xl font-semibold">Explore também pelo mapa</h2><GoogleMapsPreference /><p className="text-sm text-muted-foreground">Você pode continuar buscando e filtrando os eventos pela lista sem ativar o mapa.</p></div></section>;

  return (
    <section className="flex h-full min-h-[520px] items-center justify-center bg-muted p-8">
      <div className="max-w-sm rounded-3xl border border-border bg-card/95 p-6 text-center shadow-surface backdrop-blur">
        <MapPin className="mx-auto mb-3 h-7 w-7 text-brand" />
        <h2 className="text-lg font-semibold">Mapa indisponível</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{error || "Você ainda pode explorar e filtrar os eventos na lista."}</p>
      </div>
    </section>
  );
}
