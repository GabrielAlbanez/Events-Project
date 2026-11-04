"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

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

/** Adaptador React para o widget Place Autocomplete (New) do Google. */
export function PlaceAutocomplete({ placeholder = "Buscar endereço", ariaLabel = "Buscar endereço", className, onPlaceSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onPlaceSelect);
  const { resolvedTheme } = useTheme();
  const schemeRef = useRef("light");
  const [error, setError] = useState("");

  useEffect(() => {
    schemeRef.current = resolvedTheme === "dark" ? "dark" : "light";
    const widget = hostRef.current?.firstElementChild as HTMLElement | null;
    if (widget) widget.style.colorScheme = schemeRef.current;
  }, [resolvedTheme]);

  useEffect(() => {
    callbackRef.current = onPlaceSelect;
  }, [onPlaceSelect]);

  useEffect(() => {
    let disposed = false;
    let element: HTMLElement | null = null;
    let unsubscribe: (() => void) | undefined;

    const initialize = async () => {
      if (!hostRef.current || !window.google?.maps) return;
      const places = (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary & {
        PlaceAutocompleteElement: AutocompleteConstructor;
      };
      if (disposed || !hostRef.current) return;

      const autocomplete = new places.PlaceAutocompleteElement({ includedRegionCodes: ["br"] });
      autocomplete.placeholder = placeholder;
      autocomplete.setAttribute("aria-label", ariaLabel);
      autocomplete.style.width = "100%";
      autocomplete.style.colorScheme = schemeRef.current;

      const handleSelect = async (event: Event) => {
        try {
          const selection = event as PlaceSelectEvent;
          const place = selection.placePrediction.toPlace();
          await place.fetchFields({ fields: ["formattedAddress", "location"] });
          if (disposed) return;
          if (!place.location) throw new Error("PLACE_UNAVAILABLE");
          setError("");
          callbackRef.current({
            address: place.formattedAddress ?? "",
            lat: place.location.lat(),
            lng: place.location.lng(),
          });
        } catch {
          if (!disposed) setError("Não foi possível consultar esse endereço. Tente outra opção da busca.");
        }
      };

      autocomplete.addEventListener("gmp-select", handleSelect);
      unsubscribe = () => autocomplete.removeEventListener("gmp-select", handleSelect);
      hostRef.current.replaceChildren(autocomplete);
      element = autocomplete;
      setError("");
    };

    void initialize().catch(() => {
      if (!disposed) setError("A busca de endereços está indisponível. Tente novamente mais tarde.");
    });
    return () => {
      disposed = true;
      unsubscribe?.();
      element?.remove();
    };
  }, [placeholder, ariaLabel]);

  return <div className={className}><div ref={hostRef} />{error && <p role="status" className="mt-2 text-sm text-destructive">{error}</p>}</div>;
}
