"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useGoogleMaps } from "./GoogleMapsLoader";

export type SelectedPlace = { address: string; lat: number; lng: number };

type Props = {
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  onPlaceSelect: (place: SelectedPlace) => void;
};

type AutocompleteWidget = HTMLElement & { placeholder: string };
type AutocompleteConstructor = new (options?: {
  includedRegionCodes?: string[];
}) => AutocompleteWidget;
type PlaceSelectEvent = Event & {
  placePrediction: {
    toPlace: () => {
      formattedAddress?: string | null;
      location?: google.maps.LatLng | null;
      fetchFields: (options: { fields: string[] }) => Promise<void>;
    };
  };
};

async function withAddressTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("ADDRESS_TIMEOUT")), 12000);
    })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Adaptador React para o widget Place Autocomplete (New) do Google. */
export function PlaceAutocomplete({ placeholder = "Buscar endereço", ariaLabel = "Buscar endereço", className, onPlaceSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onPlaceSelect);
  const requestRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [manualAddress, setManualAddress] = useState("");
  const [manualFallback, setManualFallback] = useState(false);
  const [locating, setLocating] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const inputId = useId();
  const { isLoaded } = useGoogleMaps();

  useEffect(() => {
    callbackRef.current = onPlaceSelect;
  }, [onPlaceSelect]);

  useEffect(() => {
    let disposed = false;
    let element: HTMLElement | null = null;
    let removeListener: (() => void) | null = null;

    const initialize = async () => {
      if (!hostRef.current || !isLoaded || !window.google?.maps) { setInitializing(false); return; }
      setInitializing(true);
      setError(null);
      setManualFallback(false);
      try {
      const places = (await withAddressTimeout(google.maps.importLibrary("places"))) as google.maps.PlacesLibrary & {
        PlaceAutocompleteElement: AutocompleteConstructor;
      };
      if (disposed || !hostRef.current) return;

      const autocomplete = new places.PlaceAutocompleteElement({ includedRegionCodes: ["br"] });
      autocomplete.placeholder = placeholder;
      autocomplete.setAttribute("aria-label", ariaLabel);
      autocomplete.style.width = "100%";
      autocomplete.style.colorScheme = "light dark";

      const handleSelect = async (event: Event) => {
        const request = ++requestRef.current;
        try {
          const selection = event as PlaceSelectEvent;
          const place = selection.placePrediction.toPlace();
          await withAddressTimeout(place.fetchFields({ fields: ["formattedAddress", "location"] }));
          if (disposed || request !== requestRef.current) return;
          if (!place.location) throw new Error("PLACE_LOCATION_UNAVAILABLE");
          setError(null);
          setManualFallback(false);
          callbackRef.current({
            address: place.formattedAddress ?? "",
            lat: place.location.lat(),
            lng: place.location.lng(),
          });
        } catch {
          if (!disposed && request === requestRef.current) { setManualFallback(true); setError("Não foi possível selecionar esse local. Digite um endereço completo ou tente novamente."); }
        }
      };

      autocomplete.addEventListener("gmp-select", handleSelect);
      hostRef.current.replaceChildren(autocomplete);
      element = autocomplete;
      removeListener = () => autocomplete.removeEventListener("gmp-select", handleSelect);
      } catch {
        if (!disposed) { setManualFallback(true); setError("A busca de sugestões está indisponível. Digite o endereço completo abaixo ou tente novamente."); }
      } finally {
        if (!disposed) setInitializing(false);
      }
    };

    void initialize();
    return () => {
      disposed = true;
      requestRef.current += 1;
      removeListener?.();
      element?.remove();
    };
  }, [placeholder, ariaLabel, attempt, isLoaded]);

  const locateAddress = async () => {
    if (!manualAddress.trim() || !isLoaded || !window.google?.maps) return;
    const request = ++requestRef.current;
    setLocating(true);
    try {
      const result = await withAddressTimeout(new google.maps.Geocoder().geocode({ address: manualAddress.trim(), region: "br" }));
      if (request !== requestRef.current) return;
      const place = result.results[0];
      if (!place) throw new Error("NO_RESULTS");
      callbackRef.current({ address: place.formatted_address, lat: place.geometry.location.lat(), lng: place.geometry.location.lng() });
      setError(null);
    } catch {
      if (request === requestRef.current) setError("Não foi possível localizar esse endereço. Confira rua, número e cidade ou tente novamente mais tarde.");
    } finally {
      if (request === requestRef.current) setLocating(false);
    }
  };

  return <div className="space-y-2">
    <div ref={hostRef} className={className} />
    {initializing && <p role="status" className="text-xs text-muted-foreground">Preparando busca de endereços…</p>}
    {manualFallback && <div className="space-y-2">
      {error ? <p role="alert" id={`${inputId}-error`} className="text-xs leading-5 text-muted-foreground">{error}</p> : <p role="status" className="text-xs text-muted-foreground">Endereço selecionado. Você pode buscar outro abaixo.</p>}
      <label htmlFor={inputId} className="block text-xs font-medium">{ariaLabel} — endereço completo</label>
      <input id={inputId} value={manualAddress} onChange={event => setManualAddress(event.target.value)} aria-describedby={error ? `${inputId}-error` : undefined} placeholder="Rua, número, cidade e estado" className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={locating || !manualAddress.trim() || !isLoaded} onClick={() => void locateAddress()} className="min-h-11 rounded-lg px-2 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">{locating ? "Localizando…" : "Localizar endereço"}</button>
        <button type="button" onClick={() => setAttempt(value => value + 1)} className="min-h-11 rounded-lg px-2 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Tentar sugestões novamente</button>
      </div>
    </div>}
  </div>;
}
