"use client";
import React, { memo, useCallback, useMemo, useRef, useState, useEffect } from "react";
import {
  GoogleMap,
  Marker,
  DirectionsRenderer,
  OverlayView,
  OverlayViewF,
} from "@react-google-maps/api";
import { toast } from "react-toastify";
import { locationErrorMessage } from "@/lib/geolocationHelp";
import { LazyMotion, m, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Route,
  MapPin,
  Minus,
  Navigation,
  Plus,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import DrawerEventos from "@/components/MyComponents/DrawerEventos";
import { Evento } from "@/types";
import { useTheme } from "next-themes";
import { useSearchParams } from "next/navigation";
import { useGoogleMaps } from "./GoogleMapsLoader";
import { PlaceAutocomplete } from "./PlaceAutocomplete";
import { GoogleMapsPreference } from "./GoogleMapsPreference";
import Link from "next/link";
import { DayMonthBlock } from "./home/discoveryVisuals";
import cardStyles from "./MapEventCard.module.css";
import { parseEventDate } from "@/lib/discoveryPeriod";
import { HomeEventImage } from "./home/HomeEventImage";
import { animationConfig, loadAnimationFeatures } from "@/components/animations/config";

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

/** Light, low-saturation base: soft green parks, white roads, muted labels, so the pins carry the colour. */
const LIGHT_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#F3F5F4" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#6B7280" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#FFFFFF" }, { weight: 3 }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#D4D8DD" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#1F2937" }] },
  { featureType: "administrative.neighborhood", elementType: "labels.text.fill", stylers: [{ color: "#8A919C" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#E4EFE1" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#ECEFED" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#D6ECD0" }] },
  { featureType: "poi.park", elementType: "labels.text", stylers: [{ visibility: "on" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#4C8A48" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#E3E6EA" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ saturation: -100 }, { lightness: 15 }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#D3D8DE" }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#9CA3AF" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#E2E5E8" }] },
  { featureType: "transit.station", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#CFE2F2" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#7A9CB8" }] },
];

const LOCATION_TOAST_ID = "location";
/** Electric-blue dot with a white ring and a soft halo; anchored at its centre (see MapaGoogle). */
const USER_MARKER_URL = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="16" fill="#2455FF" opacity=".16"/><circle cx="17" cy="17" r="8" fill="#2455FF" stroke="#fff" stroke-width="3"/></svg>');
// The SVG's intrinsic width/height sets the rendered size; Google anchors it at the bottom centre (pin tip), so bigger pins don't shift.
const createEventMarkerIcon = (fill: string, ink: string, width = 28, height = 36) => ({ url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 28 36"><path d="M14 1C7 1 1.5 6.5 1.5 13.5 1.5 23 14 34.5 14 34.5S26.5 23 26.5 13.5C26.5 6.5 21 1 14 1Z" fill="' + fill + '" stroke="' + ink + '" stroke-width="2"/><circle cx="14" cy="13" r="4.5" fill="' + ink + '"/></svg>') });
const EVENT_MARKER_ICON = createEventMarkerIcon("#2455FF", "#fff");
const SELECTED_EVENT_MARKER_ICON = createEventMarkerIcon("#C7F34A", "#10151F");
/** List hover/focus: same pin, ~30% larger (static swap, no map animation). */
const HIGHLIGHTED_EVENT_MARKER_ICON = createEventMarkerIcon("#2455FF", "#fff", 36, 46);
/** Paid highlight: larger pin with the CTA lime ring and dot, drawn above regular pins. Static (no animation). */
const FEATURED_EVENT_MARKER_ICON = { url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 28 36"><path d="M14 1.5C7.2 1.5 2 6.8 2 13.5 2 22.8 14 34 14 34S26 22.8 26 13.5C26 6.8 20.8 1.5 14 1.5Z" fill="#2455FF" stroke="#C7F34A" stroke-width="2.6"/><circle cx="14" cy="13" r="5" fill="#C7F34A" stroke="#10151F" stroke-width="1"/></svg>') };
type PinVariant = "default" | "highlighted" | "selected" | "featured";
const pinMonthFormat = new Intl.DateTimeFormat("pt-BR", { month: "short" });
const datePinCache = new Map<string, google.maps.Icon | { url: string }>();
/** Calendar-tag pin (month over day, tip at the bottom) matching the list's date chips; falls back to the plain pin without a valid date. */
function eventPinIcon(date: string | null | undefined, variant: PinVariant) {
  const parsed = date ? parseEventDate(date) : null;
  if (!parsed) return variant === "selected" ? SELECTED_EVENT_MARKER_ICON : variant === "highlighted" ? HIGHLIGHTED_EVENT_MARKER_ICON : variant === "featured" ? FEATURED_EVENT_MARKER_ICON : EVENT_MARKER_ICON;
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = pinMonthFormat.format(parsed).replace(/\./g, "").toLocaleUpperCase("pt-BR");
  const key = day + month + variant;
  const cached = datePinCache.get(key);
  if (cached) return cached;
  const selected = variant === "selected";
  const fill = selected ? "#C7F34A" : "#2455FF", ink = selected ? "#10151F" : "#FFFFFF";
  const ring = variant === "featured" ? "#C7F34A" : selected ? "#10151F" : "#FFFFFF";
  const ringWidth = variant === "featured" ? 3 : 2;
  const [width, height] = variant === "highlighted" ? [52, 62] : variant === "featured" || selected ? [46, 55] : [40, 48];
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 40 48">'
    + '<ellipse cx="20" cy="46" rx="5" ry="1.6" fill="#0B0D12" opacity=".22"/>'
    + '<path d="M15 37 20 44.5 25 37Z" fill="' + fill + '" stroke="' + ring + '" stroke-width="' + ringWidth + '" stroke-linejoin="round"/>'
    + '<rect x="2" y="2" width="36" height="36" rx="10" fill="' + fill + '" stroke="' + ring + '" stroke-width="' + ringWidth + '"/>'
    + '<rect x="14" y="35" width="12" height="4" fill="' + fill + '"/>'
    + '<text x="20" y="15.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="8.5" font-weight="700" letter-spacing=".6" fill="' + ink + '" opacity=".85">' + month + '</text>'
    + '<text x="20" y="31" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="15" font-weight="800" fill="' + ink + '">' + day + '</text></svg>';
  const icon = { url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg) };
  datePinCache.set(key, icon);
  return icon;
}

/** Anchored card geometry (px): card width/height estimate, clearance above the pin tip, safe margins of the map area. */
const CARD_WIDTH = 320;
const CARD_HEIGHT = 300;
const PIN_CLEARANCE = 62;
const SAFE_TOP = 84;
const SAFE_LEFT = 56;
const SAFE_RIGHT = 84;
type CardPlacement = { side: "above" | "below"; shift: number };
/** The overlay div sits on the pin tip; the card positions itself with a transform. */
const anchorOffset = () => ({ x: 0, y: 0 });

type AnchoredEventCardProps = {
  event: Evento;
  placement: CardPlacement;
  tag: "featured" | "upcoming" | null;
  pinned: boolean;
  deck: { index: number; total: number; upcoming: boolean; onPage: (delta: number) => void } | null;
  onClose: () => void;
  onRoute: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
};

/** Event card floating on its pin, with an integrated tail pointing at it (flips below the pin near the top edge). */
function AnchoredEventCard({ event, placement, tag, pinned, deck, onClose, onRoute, onPointerEnter, onPointerLeave }: AnchoredEventCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  // Clicks, scrolls and drags on the card belong to the card, not to the map underneath.
  useEffect(() => { if (cardRef.current) google.maps.OverlayView.preventMapHitsAndGesturesFrom(cardRef.current); }, []);
  const above = placement.side === "above";
  const tailLeft = `calc(50% - ${placement.shift}px)`;
  return (
    <div className={cardStyles.anchor} style={{ transform: above ? `translate(calc(-50% + ${placement.shift}px), calc(-100% - ${PIN_CLEARANCE}px))` : `translate(calc(-50% + ${placement.shift}px), 14px)` }}>
      <div ref={cardRef} onMouseEnter={onPointerEnter} onMouseLeave={onPointerLeave} onKeyDown={(keyEvent) => { if (keyEvent.key === "Escape") onClose(); }} className={cardStyles.card} style={{ transformOrigin: `${tailLeft} ${above ? "100%" : "0%"}` }}>
        <article aria-label={event.featured ? "Evento em destaque" : pinned ? "Evento selecionado" : "Prévia do evento"} className={`relative flex rounded-[22px] border border-black/[.06] bg-card text-card-foreground shadow-[0_1px_2px_rgba(16,21,31,.06),0_14px_28px_-14px_rgba(16,21,31,.22),0_40px_80px_-32px_rgba(16,21,31,.42)] dark:border-white/10 ${above ? "flex-col" : "flex-col-reverse"}`}>
          <div className={`relative h-[9.5rem] overflow-hidden bg-primary/10 ${above ? "rounded-t-[21px]" : "rounded-b-[21px]"}`}>
            <div className={`absolute inset-0 ${cardStyles.image}`}><HomeEventImage banner={event.banner} category={event.category} index={0} sizes="320px" className="object-cover" /></div>
            <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-transparent" />
            {tag === "featured" && <span role="note" aria-label="Evento em destaque patrocinado" className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-cta px-3 py-1 text-xs font-semibold text-cta-foreground shadow-sm"><Star aria-hidden="true" className="h-3 w-3 fill-current" /><span aria-hidden="true">Em destaque</span></span>}
            {tag === "upcoming" && <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-cta px-3 py-1 text-xs font-semibold text-cta-foreground shadow-sm"><CalendarDays aria-hidden="true" className="h-3 w-3" />Próximo evento</span>}
            {deck && deck.total > 1 && <div role="group" aria-label={deck.upcoming ? "Navegar entre próximos eventos" : "Navegar entre destaques"} className="absolute right-3 top-3 flex items-center rounded-full bg-[#0B0D12]/80 text-white shadow-sm backdrop-blur">
              <button type="button" onClick={() => deck.onPage(-1)} aria-label={deck.upcoming ? "Evento anterior" : "Destaque anterior"} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta"><ChevronLeft aria-hidden="true" className="h-4 w-4" /></button>
              <span aria-live="polite" className="px-0.5 text-xs font-semibold tabular-nums"><span className="sr-only">{deck.upcoming ? "Evento " : "Destaque "}</span>{deck.index + 1}<span aria-hidden="true">/</span><span className="sr-only"> de </span>{deck.total}</span>
              <button type="button" onClick={() => deck.onPage(1)} aria-label={deck.upcoming ? "Próximo evento da lista" : "Próximo destaque"} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta"><ChevronRight aria-hidden="true" className="h-4 w-4" /></button>
            </div>}
          </div>
          <div className="relative p-4">
            <div className={`flex items-start gap-3 ${pinned ? "pr-7" : ""}`}>
              <DayMonthBlock date={event.dataInicio} />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[15px] font-bold leading-5 tracking-tight">{event.nome}</p>
                <p className="mt-1.5 flex items-center gap-1 text-xs leading-4 text-muted-foreground"><MapPin aria-hidden="true" className="h-3 w-3 shrink-0" /><span className="truncate">{event.endereco || "Local a confirmar"}</span></p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button type="button" onClick={onRoute} aria-label="Detalhes e rota" title="Detalhes e rota" className="grid h-10 w-10 place-items-center rounded-full border border-border text-brand hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Route aria-hidden="true" className="h-4 w-4" /></button>
              <Link href={"/eventos/" + encodeURIComponent(event.id)} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-cta px-4 text-sm font-semibold text-cta-foreground shadow-[0_6px_16px_-8px_rgba(120,160,0,.9)] transition-colors hover:bg-cta/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card">Ver detalhes <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
            </div>
            {pinned && <button type="button" onClick={onClose} aria-label="Fechar card do evento" className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X aria-hidden="true" className="h-4 w-4" /></button>}
          </div>
          {/* Tail: same surface as the card body, drawn over the card edge so the joint is seamless. */}
          <span aria-hidden="true" className={`absolute h-4 w-4 -translate-x-1/2 rotate-45 rounded-[3px] border-black/[.06] bg-card dark:border-white/10 ${above ? "-bottom-2 border-b border-r" : "-top-2 border-l border-t"}`} style={{ left: tailLeft }} />
        </article>
      </div>
    </div>
  );
}

// Only the explicit `?endereco=` search is geocoded in the browser; events use stored coordinates.
const geocodeCache = new Map<string, Promise<google.maps.LatLngLiteral>>();
const locationNoticeKey = "eventmap:location-notice-accepted";

const EventMarkers = memo(function EventMarkers({
  events,
  onSelect,
  selectedId,
  highlightedId,
  floatingId,
  onHover,
}: {
  events: Evento[];
  onSelect: (event: Evento) => void;
  selectedId: string | null;
  highlightedId: string | null;
  floatingId: string | null;
  onHover: (id: string | null) => void;
}) {
  return events.map((event) => (
    <Marker
      key={event.id}
      position={{ lat: event.lat!, lng: event.lng! }}
      title={event.id === selectedId ? event.nome + " — evento selecionado" : event.featured ? event.nome + " — destaque patrocinado" : event.nome}
      icon={eventPinIcon(event.dataInicio, event.id === selectedId ? "selected" : event.id === highlightedId && event.id !== floatingId ? "highlighted" : event.featured ? "featured" : "default")}
      zIndex={event.id === selectedId ? 1001 : event.id === highlightedId ? 1000 : event.featured ? 900 : 500}
      opacity={event.id === floatingId ? 1 : highlightedId && event.id !== highlightedId && event.id !== selectedId ? 0.6 : 1}
      onClick={() => onSelect(event)}
      onMouseOver={() => onHover(event.id)}
      onMouseOut={() => onHover(null)}
    />
  ));
});

/** Events reach the map only with stored coordinates (geocoded once at registration). */
export function hasMapCoordinates(event: Pick<Evento, "lat" | "lng">): event is Pick<Evento, "lat" | "lng"> & { lat: number; lng: number } {
  return typeof event.lat === "number" && typeof event.lng === "number" && Number.isFinite(event.lat) && Number.isFinite(event.lng)
    && Math.abs(event.lat) <= 90 && Math.abs(event.lng) <= 180;
}

/** Removes only `endereco`, keeping the discovery filters (q, periodo, categoria…) and the hash. */
export function withoutAddressParam(search: string, pathname: string, hash: string): string | null {
  const params = new URLSearchParams(search);
  if (!params.has("endereco")) return null;
  params.delete("endereco");
  const query = params.toString();
  return pathname + (query ? "?" + query : "") + hash;
}

type MapProps = {
  events: Evento[];
  selectedId: string | null;
  highlightedId: string | null;
  onSelectEvent: (id: string | null) => void;
  /** Pin hover (pointer devices only) so the list can mirror the highlight. */
  onHighlightEvent?: (id: string | null) => void;
};

const MapaGoogle = ({ events, selectedId, highlightedId, onSelectEvent, onHighlightEvent }: MapProps) => {
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
  const locationNoticeAcceptedRef = useRef(false);
  const routeRequestRef = useRef(0);
  const [eventoAtivo, setEventoAtivo] = useState<Evento | null>(null);
  const { resolvedTheme } = useTheme();

  const searchParams = useSearchParams();
  const enderecoParam = searchParams.get("endereco");
  // Next keeps useSearchParams in sync with history.replaceState, without refetching the page.
  const clearAddressParam = useCallback(() => {
    const next = withoutAddressParam(window.location.search, window.location.pathname, window.location.hash);
    if (next) window.history.replaceState(window.history.state, "", next);
  }, []);

  const locationRequestRef = useRef(0);
  const locationInFlightRef = useRef(false);
  const mapRef = useRef<google.maps.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const handleMapLoad = useCallback((map: google.maps.Map) => { mapRef.current = map; setMapReady(true); }, []);
  const handleMapUnmount = useCallback(() => { mapRef.current = null; setMapReady(false); }, []);
  /** Auto-framing stops for good once the visitor drags or zooms (or moves the centre to a location/address). */
  const userMovedRef = useRef(false);
  const programmaticMoveRef = useRef(false);
  const framedOnceRef = useRef(false);

  // Captura a localização atual
  const getCurrentLocation = useCallback(() => {
    if (locationInFlightRef.current) return;
    const requestId = ++locationRequestRef.current;
    if (navigator.geolocation) {
      locationInFlightRef.current = true;
      setIsLocating(true);
      const locate = (retry: boolean) => navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (requestId !== locationRequestRef.current) return;
          // A lingering error from an earlier attempt must not stay on screen once location is known.
          toast.dismiss(LOCATION_TOAST_ID);
          const { latitude, longitude } = pos.coords;
          setCurrentLocation({ lat: latitude, lng: longitude });
          setUserLocation({ lat: latitude, lng: longitude });
          locationInFlightRef.current = false;
          setIsLocating(false);
          setShowLocationPrompt(false);
          clearAddressParam();
        },
        (error) => {
          // Superseded requests (a newer search, cancel or success) stay silent.
          if (requestId !== locationRequestRef.current) return;
          // Chrome on Windows often fails the first low-accuracy network lookup: retry once with GPS/Wi-Fi before reporting.
          if (!retry && (error.code === error.POSITION_UNAVAILABLE || error.code === error.TIMEOUT)) {
            locate(true);
            return;
          }
          locationInFlightRef.current = false;
          setIsLocating(false);
          const message = locationErrorMessage(error.code, navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
          // One stable id: repeated taps never stack, and the long platform steps stay readable for longer.
          const options = { type: "error" as const, autoClose: error.code === error.TIMEOUT ? 6000 : 12000 };
          if (toast.isActive(LOCATION_TOAST_ID)) toast.update(LOCATION_TOAST_ID, { ...options, render: message });
          else toast(message, { ...options, toastId: LOCATION_TOAST_ID });
        },
        retry ? { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 } : { enableHighAccuracy: false, maximumAge: 60000, timeout: 7000 }
      );
      locate(false);
    } else {
      toast.error("Geolocalização não suportada pelo navegador.", { toastId: LOCATION_TOAST_ID });
    }
  }, [clearAddressParam]);

  // Guarda somente que a explicação foi aceita, nunca as coordenadas.
  // A permissão de localização continua sendo controlada pelo navegador.
  const requestCurrentLocation = useCallback(() => {
    if (isLocating) return;
    try {
      locationNoticeAcceptedRef.current ||= window.sessionStorage.getItem(locationNoticeKey) === "1";
    } catch { /* A escolha permanece em memória se o armazenamento estiver bloqueado. */ }
    if (locationNoticeAcceptedRef.current) getCurrentLocation();
    else setShowLocationPrompt(true);
  }, [getCurrentLocation, isLocating]);

  const acceptLocationNotice = useCallback(() => {
    locationNoticeAcceptedRef.current = true;
    try { window.sessionStorage.setItem(locationNoticeKey, "1"); }
    catch { /* A escolha permanece em memória nesta visita ao mapa. */ }
    setShowLocationPrompt(false);
    getCurrentLocation();
  }, [getCurrentLocation]);

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
    clearAddressParam();
  }, [directions, clearAddressParam]);

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
    styles: resolvedTheme === "dark" ? DARK_MAP_STYLE : LIGHT_MAP_STYLE,
  }), [resolvedTheme]);
  const userMarkerIcon = useMemo<google.maps.Icon>(() => ({ url: USER_MARKER_URL, anchor: new google.maps.Point(17, 17) }), []);

  // No per-visit geocoding: events without stored coordinates stay in the list and are counted below.
  const visibleEvents = useMemo(() => events.filter(hasMapCoordinates), [events]);
  const missingCoordinates = events.length - visibleEvents.length;
  const handleEventSelect = useCallback((event: Evento) => onSelectEvent(event.id), [onSelectEvent]);
  // Clearing waits a beat so swapping to the bigger icon (which may emit out/over) never flickers the highlight.
  const hoverClearTimer = useRef<number | null>(null);
  // Only pin hover (not list hover) opens the floating card, so browsing the list never covers the map.
  // Google fires marker mouseout as soon as the card opens over the pin, so closing waits for the pointer to really leave the pin (see handleMapMouseMove).
  const [floatingId, setFloatingId] = useState<string | null>(null);
  const floatingRef = useRef<string | null>(null);
  const closeFloating = useCallback(() => {
    if (!floatingRef.current) return;
    floatingRef.current = null;
    setFloatingId(null);
    onHighlightEvent?.(null);
  }, [onHighlightEvent]);
  const handleMarkerHover = useCallback((id: string | null) => {
    if (!window.matchMedia("(hover: hover)").matches) return;
    if (hoverClearTimer.current !== null) window.clearTimeout(hoverClearTimer.current);
    hoverClearTimer.current = null;
    if (id) { floatingRef.current = id; setFloatingId(id); onHighlightEvent?.(id); }
    else if (!floatingRef.current) hoverClearTimer.current = window.setTimeout(() => { hoverClearTimer.current = null; onHighlightEvent?.(null); }, 80);
  }, [onHighlightEvent]);
  /** Keeps the card while the pointer is on the pin (tip ±26px wide, 60px tall); anything farther closes it. */
  const handleMapMouseMove = useCallback((mouse: google.maps.MapMouseEvent) => {
    const id = floatingRef.current;
    if (!id) return;
    const event = visibleEvents.find(item => item.id === id);
    const map = mapRef.current, projection = map?.getProjection(), zoom = map?.getZoom();
    if (!event || !mouse.latLng || !projection || zoom === undefined) { closeFloating(); return; }
    const pin = projection.fromLatLngToPoint({ lat: event.lat!, lng: event.lng! }), pointer = projection.fromLatLngToPoint(mouse.latLng);
    if (!pin || !pointer) { closeFloating(); return; }
    const scale = 2 ** zoom, dx = (pointer.x - pin.x) * scale, dy = (pointer.y - pin.y) * scale;
    if (Math.abs(dx) > 26 || dy < -60 || dy > 10) closeFloating();
  }, [closeFloating, visibleEvents]);
  const floatingEvent = useMemo(() => floatingId && floatingId !== selectedId ? visibleEvents.find(event => event.id === floatingId) : undefined, [floatingId, selectedId, visibleEvents]);
  useEffect(() => () => { if (hoverClearTimer.current !== null) window.clearTimeout(hoverClearTimer.current); }, []);
  const reducedMotion = useReducedMotion();
  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedId) ?? null,
    [events, selectedId]
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
    userMovedRef.current = true;
    map.setZoom((map.getZoom() ?? 12) + delta);
  }, []);
  /** Frames the given events, keeping clear of the view toggle, the side panel overlap and the floating card. */
  const frameEvents = useCallback((list: Evento[]) => {
    const map = mapRef.current;
    if (!map || list.length === 0) return;
    programmaticMoveRef.current = true;
    google.maps.event.addListenerOnce(map, "idle", () => { programmaticMoveRef.current = false; });
    if (list.length === 1) { map.panTo({ lat: list[0].lat!, lng: list[0].lng! }); map.setZoom(14); return; }
    const bounds = new google.maps.LatLngBounds();
    list.forEach((event) => bounds.extend({ lat: event.lat!, lng: event.lng! }));
    const compact = window.matchMedia("(max-width: 767px)").matches;
    map.fitBounds(bounds, compact ? { top: 72, right: 64, bottom: cardShownRef.current ? 150 : 40, left: 32 } : { top: 96, right: 120, bottom: 96, left: 80 });
  }, []);
  /** "Explore o mapa": frames every event currently on the map. */
  const exploreMap = useCallback(() => frameEvents(visibleEvents), [frameEvents, visibleEvents]);
  const handleZoomChanged = useCallback(() => {
    if (framedOnceRef.current && !programmaticMoveRef.current) userMovedRef.current = true;
  }, []);
  const handleDragStart = useCallback(() => { userMovedRef.current = true; closeFloating(); }, [closeFloating]);
  // First load, and every time the filtered set changes while the visitor has not moved the map: frame the events.
  const framingKey = visibleEvents.map((event) => event.id + ":" + event.lat + ":" + event.lng).join("|");
  useEffect(() => {
    if (!mapReady || userMovedRef.current || !framingKey) return;
    frameEvents(visibleEvents);
    framedOnceRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- framingKey captures the visible events
  }, [mapReady, framingKey, frameEvents]);
  // A located user or an explicit ?endereco= search owns the centre from then on.
  const initialCenterRef = useRef(currentLocation);
  useEffect(() => { if (currentLocation !== initialCenterRef.current) userMovedRef.current = true; }, [currentLocation]);
  // Floating card: the selected event, otherwise the first paid highlight (until the visitor closes it). The pager walks the highlights.
  const featuredEvents = useMemo(() => events.filter((event) => event.featured), [events]);
  const [cardDismissed, setCardDismissed] = useState(false);
  useEffect(() => { if (selectedId) setCardDismissed(false); }, [selectedId]);
  // Without paid highlights the card presents the next events instead (first three of the filtered list).
  const upcomingMode = featuredEvents.length === 0;
  const baseDeck = useMemo(() => upcomingMode ? events.slice(0, 3) : featuredEvents, [upcomingMode, events, featuredEvents]);
  const cardEvent = selectedEvent ?? (cardDismissed ? null : baseDeck[0] ?? null);
  const cardDeck = useMemo(() => cardEvent && !baseDeck.some((event) => event.id === cardEvent.id) ? [cardEvent, ...baseDeck] : baseDeck, [cardEvent, baseDeck]);
  const cardIsUpcoming = Boolean(cardEvent && !cardEvent.featured && upcomingMode && baseDeck.some((event) => event.id === cardEvent.id));
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktop(query.matches);
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  /** Only the phone card (fixed above the sheet) needs room when framing; on desktop the card follows its pin. */
  const cardShownRef = useRef(false);
  cardShownRef.current = Boolean(cardEvent) && !isDesktop;
  const cardIndex = cardEvent ? cardDeck.findIndex((event) => event.id === cardEvent.id) : -1;
  const cardMappable = Boolean(cardEvent && hasMapCoordinates(cardEvent));
  const pageCard = useCallback((delta: number) => {
    if (cardIndex < 0 || cardDeck.length < 2) return;
    onSelectEvent(cardDeck[(cardIndex + delta + cardDeck.length) % cardDeck.length].id);
  }, [cardDeck, cardIndex, onSelectEvent]);
  const closeCard = useCallback(() => { setCardDismissed(true); onSelectEvent(null); }, [onSelectEvent]);

  // Desktop: the card rides on a pin — the one under the pointer (or the list item hovered/focused), else the selected one.
  // Leaving waits 200ms so the pointer can travel from the pin to the card and click "Ver detalhes".
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const anchorTimer = useRef<number | null>(null);
  const cardHoveredRef = useRef(false);
  const hoverId = floatingId ?? highlightedId;
  const validHoverId = hoverId && visibleEvents.some((event) => event.id === hoverId) ? hoverId : null;
  const restingId = selectedEvent && hasMapCoordinates(selectedEvent) ? selectedEvent.id : null;
  const hoverRef = useRef(validHoverId);
  hoverRef.current = validHoverId;
  const restingRef = useRef(restingId);
  restingRef.current = restingId;
  const clearAnchorTimer = useCallback(() => { if (anchorTimer.current !== null) window.clearTimeout(anchorTimer.current); anchorTimer.current = null; }, []);
  const scheduleAnchorRest = useCallback(() => {
    clearAnchorTimer();
    anchorTimer.current = window.setTimeout(() => { anchorTimer.current = null; if (!cardHoveredRef.current) setAnchorId(hoverRef.current ?? restingRef.current); }, 200);
  }, [clearAnchorTimer]);
  useEffect(() => {
    if (!isDesktop) { clearAnchorTimer(); setAnchorId(null); return; }
    if (validHoverId) { clearAnchorTimer(); setAnchorId(validHoverId); return; }
    if (!cardHoveredRef.current) scheduleAnchorRest();
  }, [isDesktop, validHoverId, restingId, clearAnchorTimer, scheduleAnchorRest]);
  useEffect(() => clearAnchorTimer, [clearAnchorTimer]);
  const anchoredEvent = useMemo(() => anchorId ? visibleEvents.find((event) => event.id === anchorId) ?? null : null, [anchorId, visibleEvents]);
  const anchoredPosition = useMemo(() => anchoredEvent ? { lat: anchoredEvent.lat!, lng: anchoredEvent.lng! } : null, [anchoredEvent]);
  const anchorDeck = useMemo(() => {
    const deck = baseDeck.filter(hasMapCoordinates);
    return anchoredEvent && !deck.some((event) => event.id === anchoredEvent.id) ? [anchoredEvent, ...deck] : deck;
  }, [baseDeck, anchoredEvent]);
  const anchorIndex = anchoredEvent ? anchorDeck.findIndex((event) => event.id === anchoredEvent.id) : -1;
  const pageAnchored = useCallback((delta: number) => {
    if (anchorIndex < 0 || anchorDeck.length < 2) return;
    const next = anchorDeck[(anchorIndex + delta + anchorDeck.length) % anchorDeck.length];
    clearAnchorTimer();
    setAnchorId(next.id);
    onSelectEvent(next.id);
  }, [anchorDeck, anchorIndex, clearAnchorTimer, onSelectEvent]);
  const closeAnchored = useCallback(() => { clearAnchorTimer(); cardHoveredRef.current = false; setAnchorId(null); onSelectEvent(null); }, [clearAnchorTimer, onSelectEvent]);
  // Opens above the pin; flips below near the top edge and slides sideways to stay clear of the panel and the controls.
  const [placement, setPlacement] = useState<CardPlacement>({ side: "above", shift: 0 });
  const updatePlacement = useCallback(() => {
    const map = mapRef.current, projection = map?.getProjection(), bounds = map?.getBounds(), zoom = map?.getZoom();
    const event = anchoredEvent;
    if (!map || !projection || !bounds || zoom === undefined || !event) return;
    const northWest = projection.fromLatLngToPoint(new google.maps.LatLng(bounds.getNorthEast().lat(), bounds.getSouthWest().lng()));
    const pin = projection.fromLatLngToPoint(new google.maps.LatLng(event.lat!, event.lng!));
    if (!northWest || !pin) return;
    const scale = 2 ** zoom;
    let x = (pin.x - northWest.x) * scale;
    if (x < 0) x += 256 * scale;
    const y = (pin.y - northWest.y) * scale;
    const width = map.getDiv().clientWidth, height = map.getDiv().clientHeight;
    const roomAbove = y - PIN_CLEARANCE - SAFE_TOP, roomBelow = height - y - 16;
    const side = roomAbove >= CARD_HEIGHT + 12 || roomAbove >= roomBelow ? "above" : "below";
    let shift = 0;
    if (x - CARD_WIDTH / 2 < SAFE_LEFT) shift = SAFE_LEFT - (x - CARD_WIDTH / 2);
    else if (x + CARD_WIDTH / 2 > width - SAFE_RIGHT) shift = width - SAFE_RIGHT - (x + CARD_WIDTH / 2);
    const limit = CARD_WIDTH / 2 - 30;
    shift = Math.round(Math.max(-limit, Math.min(limit, shift)));
    setPlacement((current) => current.side === side && current.shift === shift ? current : { side, shift });
  }, [anchoredEvent]);
  useEffect(() => { updatePlacement(); }, [updatePlacement]);

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
              onMouseMove={handleMapMouseMove}
              onMouseOut={closeFloating}
              onDragStart={handleDragStart}
              onZoomChanged={handleZoomChanged}
              onIdle={updatePlacement}
            >
              {userLocation && <Marker position={userLocation} icon={userMarkerIcon} zIndex={100} />}

              <EventMarkers events={visibleEvents} onSelect={handleEventSelect} selectedId={selectedId} highlightedId={highlightedId} floatingId={floatingEvent ? floatingId : null} onHover={handleMarkerHover} />

              {isDesktop && !showDirections && anchoredEvent && anchoredPosition && <OverlayViewF key={anchoredEvent.id} position={anchoredPosition} mapPaneName={OverlayView.FLOAT_PANE} getPixelPositionOffset={anchorOffset}>
                <AnchoredEventCard
                  event={anchoredEvent}
                  placement={placement}
                  tag={anchoredEvent.featured ? "featured" : upcomingMode && baseDeck.some((event) => event.id === anchoredEvent.id) ? "upcoming" : null}
                  pinned={anchoredEvent.id === selectedId}
                  deck={anchorIndex >= 0 ? { index: anchorIndex, total: anchorDeck.length, upcoming: upcomingMode, onPage: pageAnchored } : null}
                  onClose={closeAnchored}
                  onRoute={() => setEventoAtivo(anchoredEvent)}
                  onPointerEnter={() => { cardHoveredRef.current = true; clearAnchorTimer(); }}
                  onPointerLeave={() => { cardHoveredRef.current = false; scheduleAnchorRest(); }}
                />
              </OverlayViewF>}

              {directions && <DirectionsRenderer directions={directions} />}
            </GoogleMap>

            {/* Decorative lime/blue swoosh in the corner (behind every control, never interactive). */}
            <svg aria-hidden="true" viewBox="0 0 320 200" fill="none" preserveAspectRatio="none" className="pointer-events-none absolute bottom-0 right-0 z-[5] hidden h-44 w-80 md:block">
              <path d="M320 34C236 70 150 128 70 200h250Z" fill="#2455FF" opacity=".9" />
              <path d="M8 196C96 112 196 58 318 26" stroke="#C7F34A" strokeWidth="14" strokeLinecap="round" />
            </svg>

            {showDirections && (
              <div className="absolute left-3 right-[72px] top-16 z-10 rounded-2xl border border-border bg-card/95 p-4 shadow-surface backdrop-blur-xl md:left-12 md:right-auto md:top-20 md:w-80">
                <button type="button" onClick={() => setShowDirections(false)} className="mb-3 flex items-center gap-2 text-sm font-semibold"><ArrowLeft className="h-4 w-4" /> Planejar rota</button>
                <div className="space-y-3">
                  <PlaceAutocomplete ariaLabel="Local de partida da rota" className="w-full rounded-xl border border-border" placeholder="Local de partida" onPlaceSelect={({ lat, lng }) => { resetRouteRequest(); setUserLocation({ lat, lng }); }} />
                  <p className="text-xs leading-5 text-muted-foreground">{userLocation ? "Origem definida. Selecione outro local para alterar." : "Selecione a partida nas sugestões ou escolha usar sua localização."} Os endereços e a localização usados no trajeto são enviados ao Google para calcular a rota.</p>
                  <button type="button" disabled={isLocating} onClick={requestCurrentLocation} className="inline-flex min-h-11 items-center rounded-lg text-sm font-semibold text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">{isLocating ? "Obtendo localização…" : "Usar minha localização"}</button>
                  <PlaceAutocomplete ariaLabel="Destino da rota" className="w-full rounded-xl border border-border" placeholder="Destino" onPlaceSelect={({ lat, lng }) => { resetRouteRequest(); setDestination({ lat, lng }); }} />
                  {destination && <p className="text-xs text-muted-foreground">Destino definido. Selecione outro local para alterar.</p>}
                  <button type="button" disabled={isRouteTracing} className="min-h-11 w-full rounded-xl bg-cta px-4 py-2.5 text-sm font-semibold text-cta-foreground hover:bg-cta/90 disabled:cursor-wait disabled:opacity-60" onClick={() => destination ? void calculateRoute(destination) : toast.error("Selecione um destino nas sugestões.")}>{isRouteTracing ? "Calculando rota…" : "Traçar rota"}</button>
                  {routeError && <div role="alert" className="space-y-2 text-xs text-muted-foreground"><p>{routeError}</p>{externalRouteUrl && <a href={externalRouteUrl} target="_blank" rel="noopener noreferrer" className="inline-block font-semibold text-brand underline underline-offset-4">Abrir rota no Google Maps</a>}</div>}
                  {directions && <button type="button" className="w-full text-xs text-muted-foreground hover:text-brand" onClick={clearRoute}>Limpar rota</button>}
                </div>
              </div>
            )}

            {cardEvent && !showDirections && !isDesktop && (
              <LazyMotion features={loadAnimationFeatures} strict>
                <m.section
                  key={cardEvent.id}
                  aria-label={cardEvent.id === selectedId ? "Evento selecionado" : cardEvent.featured ? "Evento em destaque" : "Próximo evento"}
                  initial={reducedMotion === false ? { opacity: 0, y: -animationConfig.entranceDistance / 2 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reducedMotion === false ? animationConfig.grid.reenterDuration : 0, ease: animationConfig.ease }}
                  className="absolute inset-x-3 bottom-3 z-10 flex overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-[0_24px_60px_-24px_rgba(16,21,31,.45)] md:inset-x-auto md:bottom-auto md:right-6 md:top-6 md:w-[22rem] md:flex-col md:rounded-[1.75rem]"
                >
                  <div className="relative w-28 shrink-0 overflow-hidden bg-primary/10 md:h-44 md:w-full">
                    <HomeEventImage banner={cardEvent.banner} category={cardEvent.category} index={0} sizes="(min-width: 768px) 352px, 112px" className="object-cover" />
                    {cardEvent.featured && <span role="note" aria-label="Evento em destaque patrocinado" className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-cta px-2.5 py-1 text-[11px] font-semibold text-cta-foreground shadow-sm md:left-3 md:top-3 md:px-3 md:text-xs"><Star aria-hidden="true" className="h-3 w-3 fill-current" /><span aria-hidden="true" className="hidden md:inline">Em destaque</span></span>}
                    {cardIsUpcoming && <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-cta px-2.5 py-1 text-[11px] font-semibold text-cta-foreground shadow-sm md:left-3 md:top-3 md:px-3 md:text-xs"><CalendarDays aria-hidden="true" className="h-3 w-3" /><span className="hidden md:inline">Próximo evento</span><span className="sr-only md:hidden">Próximo evento</span></span>}
                    {cardDeck.length > 1 && <div role="group" aria-label={upcomingMode ? "Navegar entre próximos eventos" : "Navegar entre destaques"} className="absolute right-3 top-3 hidden items-center rounded-full bg-[#0B0D12]/80 text-white backdrop-blur md:flex">
                      <button type="button" onClick={() => pageCard(-1)} aria-label={upcomingMode ? "Evento anterior" : "Destaque anterior"} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta"><ChevronLeft aria-hidden="true" className="h-4 w-4" /></button>
                      <span aria-live="polite" className="px-1 text-xs font-semibold tabular-nums"><span className="sr-only">{upcomingMode ? "Evento " : "Destaque "}</span>{cardIndex + 1}<span aria-hidden="true">/</span><span className="sr-only"> de </span>{cardDeck.length}</span>
                      <button type="button" onClick={() => pageCard(1)} aria-label={upcomingMode ? "Próximo evento da lista" : "Próximo destaque"} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta"><ChevronRight aria-hidden="true" className="h-4 w-4" /></button>
                    </div>}
                  </div>
                  <div className="relative min-w-0 flex-1 p-3 md:p-4">
                    <div className="flex items-start gap-3 pr-9">
                      <DayMonthBlock date={cardEvent.dataInicio} className="hidden md:inline-flex" />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-semibold leading-5 tracking-tight md:text-base md:leading-6">{cardEvent.nome}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs leading-4 text-muted-foreground"><MapPin aria-hidden="true" className="h-3 w-3 shrink-0" /><span className="truncate">{cardEvent.endereco || "Local a confirmar"}</span></p>
                        {!cardMappable && <p className="mt-1 text-xs text-muted-foreground">Local ainda sem coordenadas no mapa.</p>}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2 md:mt-4">
                      {cardDeck.length > 1 && <div role="group" aria-label={upcomingMode ? "Navegar entre próximos eventos" : "Navegar entre destaques"} className="flex items-center md:hidden">
                        <button type="button" onClick={() => pageCard(-1)} aria-label={upcomingMode ? "Evento anterior" : "Destaque anterior"} className="grid h-11 w-9 place-items-center rounded-lg text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ChevronLeft aria-hidden="true" className="h-4 w-4" /></button>
                        <span className="text-xs font-semibold tabular-nums"><span className="sr-only">{upcomingMode ? "Evento " : "Destaque "}</span>{cardIndex + 1}<span aria-hidden="true">/</span><span className="sr-only"> de </span>{cardDeck.length}</span>
                        <button type="button" onClick={() => pageCard(1)} aria-label={upcomingMode ? "Próximo evento da lista" : "Próximo destaque"} className="grid h-11 w-9 place-items-center rounded-lg text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ChevronRight aria-hidden="true" className="h-4 w-4" /></button>
                      </div>}
                      {cardMappable && <button type="button" aria-label="Detalhes e rota" title="Detalhes e rota" className="ml-auto grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border text-brand hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:ml-0" onClick={() => setEventoAtivo(cardEvent)}><Route aria-hidden="true" className="h-4 w-4" /></button>}
                      <Link href={"/eventos/" + encodeURIComponent(cardEvent.id)} className={`${cardMappable ? "" : "ml-auto "}inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-cta px-4 text-sm font-semibold text-cta-foreground shadow-sm hover:bg-cta/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card md:ml-auto`}>Ver detalhes <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
                    </div>
                    <button type="button" aria-label="Fechar evento" className="absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-xl text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:right-2 md:top-2" onClick={closeCard}><X className="h-4 w-4" aria-hidden="true" /></button>
                  </div>
                </m.section>
              </LazyMotion>
            )}

            {/* Map controls: top-right on phones (the card and sheet own the bottom), right edge above "Explore o mapa" from md. */}
            <div className="absolute right-3 top-3 z-10 flex flex-col gap-2 md:bottom-24 md:right-6 md:top-auto">
              {!showDirections && <button type="button" className="grid h-11 w-11 place-items-center rounded-2xl border border-border bg-card text-brand shadow-surface hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setShowDirections(true); onSelectEvent(null); }} title="Planejar rota" aria-label="Planejar rota"><Route className="h-4 w-4" aria-hidden="true" /></button>}
              <button
                type="button"
                className="grid h-11 w-11 place-items-center rounded-2xl border border-border bg-card shadow-surface transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
                onClick={requestCurrentLocation}
                disabled={isLocating}
                title="Usar minha localização"
                aria-label={isLocating ? "Obtendo localização…" : "Usar minha localização"}
              >
                <Navigation className="h-[18px] w-[18px] text-foreground" aria-hidden="true" />
              </button>
              <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-surface md:block">
                <button type="button" className="grid h-11 w-11 place-items-center text-foreground transition-colors hover:bg-muted hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" onClick={() => changeZoom(1)} title="Aumentar zoom" aria-label="Aumentar zoom">
                  <Plus className="h-5 w-5" aria-hidden="true" />
                </button>
                <div className="mx-2 h-px bg-border" />
                <button type="button" className="grid h-11 w-11 place-items-center text-foreground transition-colors hover:bg-muted hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" onClick={() => changeZoom(-1)} title="Diminuir zoom" aria-label="Diminuir zoom">
                  <Minus className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>

            {showLocationPrompt && <section aria-label="Usar sua localização no mapa" className="absolute inset-x-3 top-16 z-20 max-w-sm space-y-3 rounded-2xl bg-card p-5 shadow-surface md:left-12 md:right-auto md:top-20">
              <h2 className="text-base font-semibold">Usar sua localização?</h2>
              <p className="text-sm leading-6 text-muted-foreground">Sua posição será exibida no mapa do Google. Se você calcular um trajeto, origem e destino também serão enviados ao Google. Você pode continuar sem compartilhar a localização.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={isLocating} onClick={acceptLocationNotice} className="min-h-11 rounded-xl bg-cta px-4 py-2 text-sm font-semibold text-cta-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">{isLocating ? "Obtendo localização…" : "Usar minha localização"}</button>
                <button type="button" onClick={() => { locationRequestRef.current += 1; locationInFlightRef.current = false; setIsLocating(false); setShowLocationPrompt(false); }} className="min-h-11 rounded-xl px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Agora não</button>
              </div>
            </section>}

            {/* Bottom-left (from md): live count and the map privacy link. On phones the privacy link sits under the view toggle. */}
            {!showDirections && !showLocationPrompt && <Link href="/privacidade#preferencias" className="absolute left-3 top-16 z-10 inline-flex min-h-9 items-center rounded-full border border-border bg-card/95 px-3 text-xs font-medium text-foreground shadow-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden">Privacidade do mapa</Link>}
            <div className="absolute bottom-6 left-12 z-10 hidden items-center gap-2 md:flex">
              <p className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-surface">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                {visibleEvents.length} {visibleEvents.length === 1 ? "evento" : "eventos"} no mapa
                {missingCoordinates > 0 && <span className="text-muted-foreground">· {missingCoordinates} sem coordenadas</span>}
              </p>
              <Link href="/privacidade#preferencias" className="inline-flex min-h-10 items-center rounded-full px-3 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Privacidade do mapa</Link>
            </div>
            <button type="button" onClick={exploreMap} disabled={visibleEvents.length === 0} className="absolute bottom-6 right-6 z-10 hidden min-h-12 items-center gap-3 rounded-full bg-foreground px-5 text-sm font-semibold text-background shadow-[0_18px_40px_-16px_rgba(11,13,18,.6)] transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 md:inline-flex">
              <Sparkles aria-hidden="true" className="h-4 w-4 text-cta" />
              Explore o mapa
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
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
