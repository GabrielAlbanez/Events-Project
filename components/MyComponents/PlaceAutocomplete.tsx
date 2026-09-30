"use client";

import { useEffect, useRef } from "react";

export type SelectedPlace = { address: string; lat: number; lng: number };

type Props = {
  placeholder?: string;
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
export function PlaceAutocomplete({ placeholder = "Buscar endereço", className, onPlaceSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onPlaceSelect);

  useEffect(() => {
    callbackRef.current = onPlaceSelect;
  }, [onPlaceSelect]);

  useEffect(() => {
    let disposed = false;
    let element: HTMLElement | null = null;

    const initialize = async () => {
      if (!hostRef.current || !window.google?.maps) return;
      const places = (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary & {
        PlaceAutocompleteElement: AutocompleteConstructor;
      };
      if (disposed || !hostRef.current) return;

      const autocomplete = new places.PlaceAutocompleteElement({ includedRegionCodes: ["br"] });
      autocomplete.placeholder = placeholder;
      autocomplete.style.width = "100%";
      autocomplete.style.colorScheme = "light dark";

      const handleSelect = async (event: Event) => {
        const selection = event as PlaceSelectEvent;
        const place = selection.placePrediction.toPlace();
        await place.fetchFields({ fields: ["formattedAddress", "location"] });
        if (!place.location) return;
        callbackRef.current({
          address: place.formattedAddress ?? "",
          lat: place.location.lat(),
          lng: place.location.lng(),
        });
      };

      autocomplete.addEventListener("gmp-select", handleSelect);
      hostRef.current.replaceChildren(autocomplete);
      element = autocomplete;
    };

    void initialize();
    return () => {
      disposed = true;
      element?.remove();
    };
  }, [placeholder]);

  return <div ref={hostRef} className={className} />;
}
