"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTheme } from "next-themes";
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
  const { resolvedTheme } = useTheme();
  const schemeRef = useRef("light");
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
      autocomplete.style.colorScheme = schemeRef.current;

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

  return <div className={className}><div className="space-y-2">
    <div ref={hostRef} />
    {initializing && <p role="status" className="text-xs text-muted-foreground">Preparando busca de endereços…</p>}
    {manualFallback && <div className="space-y-2">
      {error ? <p role="alert" id={`${inputId}-error`} className="text-xs leading-5 text-muted-foreground">{error}</p> : <p role="status" className="text-xs text-muted-foreground">Endereço selecionado. Você pode buscar outro abaixo.</p>}
      <label htmlFor={inputId} className="block text-xs font-medium">{ariaLabel} — endereço completo</label>
      <input id={inputId} value={manualAddress} onChange={event => setManualAddress(event.target.value)} aria-describedby={error ? `${inputId}-error` : undefined} placeholder="Rua, número, cidade e estado" className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={locating || !manualAddress.trim() || !isLoaded} onClick={() => void locateAddress()} className="min-h-11 rounded-lg px-2 text-sm font-semibold text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">{locating ? "Localizando…" : "Localizar endereço"}</button>
        <button type="button" onClick={() => setAttempt(value => value + 1)} className="min-h-11 rounded-lg px-2 text-sm font-medium text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Tentar sugestões novamente</button>
      </div>
    </div>}
  </div></div>;
}

type PlaceSuggestion = {
  placePrediction: {
    text: { text: string };
    toPlace: () => {
      formattedAddress?: string | null;
      location?: google.maps.LatLng | null;
      fetchFields: (options: { fields: string[] }) => Promise<unknown>;
    };
  } | null;
};
type SuggestionsLibrary = {
  AutocompleteSessionToken: new () => object;
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions: (request: { input: string; sessionToken: object; includedRegionCodes: string[]; language: string; region: string }) => Promise<{ suggestions: PlaceSuggestion[] }>;
  };
};
type PlaceOption = { id: string; label: string; suggestion: PlaceSuggestion };

type PlaceSearchComboboxProps = {
  id?: string;
  value: string;
  placeholder?: string;
  ariaLabel?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  onTextChange: (text: string) => void;
  onPlaceSelect: (place: SelectedPlace) => void;
  onBlur?: () => void;
  onUseManual?: () => void;
  /** Lets the form focus this field on a validation error. */
  inputRef?: (element: HTMLInputElement | null) => void;
};

const minimumQueryLength = 3;
const suggestionDebounceMs = 280;

/**
 * Address search with suggestions rendered in the page flow: no overlay to clip or hide behind
 * the mobile keyboard, inside forms and dialogs alike. One billing session per picked place.
 */
export function PlaceSearchCombobox({ id, value, placeholder = "Buscar endereço", ariaLabel = "Buscar endereço", "aria-describedby": describedBy, "aria-invalid": invalid, onTextChange, onPlaceSelect, onBlur, onUseManual, inputRef: registerInput }: PlaceSearchComboboxProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(0);
  const tokenRef = useRef<object | null>(null);
  const mountedRef = useRef(true);
  const [options, setOptions] = useState<PlaceOption[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listMaxHeight, setListMaxHeight] = useState<number | undefined>(undefined);
  const generatedId = useId();
  const listId = `${generatedId}-suggestions`;
  const statusId = `${generatedId}-status`;
  const optionId = (index: number) => `${listId}-${index}`;

  const clearTimer = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };
  const close = () => { setOpen(false); setActiveIndex(-1); };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Closing on an outside press (not on blur) keeps a tap on a suggestion safe from the iOS blur race.
  useEffect(() => {
    if (!open) return;
    const handlePress = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setActiveIndex(-1);
    };
    document.addEventListener("pointerdown", handlePress);
    return () => document.removeEventListener("pointerdown", handlePress);
  }, [open]);

  // Keep the list within the area the on-screen keyboard leaves visible.
  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const list = listRef.current;
        if (!list) return;
        const visibleBottom = viewport ? viewport.height : window.innerHeight;
        const top = list.getBoundingClientRect().top - (viewport?.offsetTop ?? 0);
        setListMaxHeight(Math.max(176, Math.min(320, Math.floor(visibleBottom - top - 12))));
      });
    };
    if (window.matchMedia("(pointer: coarse)").matches) inputRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    measure();
    viewport?.addEventListener("resize", measure);
    viewport?.addEventListener("scroll", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", measure);
      viewport?.removeEventListener("scroll", measure);
      window.removeEventListener("scroll", measure);
    };
  }, [open]);

  useEffect(() => {
    if (activeIndex >= 0) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listId]);

  const search = async (query: string, request: number) => {
    try {
      if (!window.google?.maps) throw new Error("MAPS_UNAVAILABLE");
      const places = (await withAddressTimeout(google.maps.importLibrary("places"))) as unknown as SuggestionsLibrary;
      if (!mountedRef.current || request !== requestRef.current) return;
      if (!tokenRef.current) tokenRef.current = new places.AutocompleteSessionToken();
      const { suggestions } = await withAddressTimeout(places.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: query, sessionToken: tokenRef.current, includedRegionCodes: ["br"], language: "pt-BR", region: "br" }));
      if (!mountedRef.current || request !== requestRef.current) return;
      const next = suggestions.flatMap((suggestion, index) => suggestion.placePrediction ? [{ id: `${index}-${suggestion.placePrediction.text.text}`, label: suggestion.placePrediction.text.text, suggestion }] : []);
      setOptions(next);
      setNoResults(next.length === 0);
      setActiveIndex(-1);
      setOpen(next.length > 0);
    } catch {
      if (!mountedRef.current || request !== requestRef.current) return;
      setOptions([]);
      close();
      setError("A busca de endereços está indisponível agora. Tente de novo ou digite o endereço.");
    } finally {
      if (mountedRef.current && request === requestRef.current) setSearching(false);
    }
  };

  const handleChange = (text: string) => {
    onTextChange(text);
    clearTimer();
    const request = ++requestRef.current;
    setError(null);
    setNoResults(false);
    setSelecting(false);
    const query = text.trim();
    if (query.length < minimumQueryLength) { setOptions([]); setSearching(false); close(); return; }
    setSearching(true);
    timerRef.current = setTimeout(() => { timerRef.current = null; void search(query, request); }, suggestionDebounceMs);
  };

  const selectOption = async (option: PlaceOption) => {
    if (selecting || !option.suggestion.placePrediction) return;
    clearTimer();
    const request = ++requestRef.current;
    setSelecting(true);
    setSearching(false);
    setError(null);
    try {
      const place = option.suggestion.placePrediction.toPlace();
      await withAddressTimeout(place.fetchFields({ fields: ["formattedAddress", "location"] }));
      if (!mountedRef.current || request !== requestRef.current) return;
      if (!place.location) throw new Error("PLACE_LOCATION_UNAVAILABLE");
      // fetchFields ends the billing session: the next search starts a new one.
      tokenRef.current = null;
      setOptions([]);
      close();
      onPlaceSelect({ address: place.formattedAddress || option.label, lat: place.location.lat(), lng: place.location.lng() });
    } catch {
      if (mountedRef.current && request === requestRef.current) {
        tokenRef.current = null;
        setError("Não foi possível confirmar esse local. Escolha outra sugestão ou digite o endereço.");
      }
    } finally {
      if (mountedRef.current && request === requestRef.current) setSelecting(false);
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      // Enter never submits the event form from the address search.
      event.preventDefault();
      if (open && options.length) void selectOption(options[activeIndex >= 0 ? activeIndex : 0]);
      return;
    }
    if (event.key === "Tab") { close(); return; }
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (!options.length) return;
    event.preventDefault();
    if (!open) { setOpen(true); setActiveIndex(event.key === "ArrowDown" ? 0 : options.length - 1); return; }
    const step = event.key === "ArrowDown" ? 1 : -1;
    setActiveIndex(index => index < 0 ? (step === 1 ? 0 : options.length - 1) : (index + step + options.length) % options.length);
  };

  const status = selecting ? "Confirmando local…" : searching ? "Buscando endereços…" : noResults ? "Nenhuma sugestão encontrada. Confira o texto ou digite o endereço." : "";
  const expanded = open && options.length > 0;
  const describedByIds = [describedBy, status ? statusId : null].filter(Boolean).join(" ") || undefined;

  return <div ref={rootRef} className="min-w-0 space-y-2">
    <input
      ref={element => { inputRef.current = element; registerInput?.(element); }}
      id={id}
      type="text"
      role="combobox"
      aria-label={ariaLabel}
      aria-autocomplete="list"
      aria-expanded={expanded}
      aria-controls={listId}
      aria-activedescendant={expanded && activeIndex >= 0 ? optionId(activeIndex) : undefined}
      aria-describedby={describedByIds}
      aria-invalid={invalid}
      aria-busy={searching || selecting}
      value={value}
      placeholder={placeholder}
      maxLength={500}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      enterKeyHint="search"
      onChange={event => handleChange(event.target.value)}
      onKeyDown={handleKeyDown}
      onFocus={() => { if (options.length) setOpen(true); }}
      onBlur={onBlur}
      className="block h-11 min-h-11 w-full min-w-0 scroll-mt-24 rounded-xl border border-input bg-background px-3 py-2 text-base shadow-sm transition-colors placeholder:text-muted-foreground hover:border-ring/40 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
    />
    <ul
      ref={listRef}
      id={listId}
      role="listbox"
      aria-label="Sugestões de endereço"
      hidden={!expanded}
      style={{ maxHeight: listMaxHeight }}
      // Keeps focus (and the keyboard) on the input; a finger drag still scrolls the list.
      onMouseDown={event => event.preventDefault()}
      className="max-h-80 overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-surface"
    >
      {options.map((option, index) => <li
        key={option.id}
        id={optionId(index)}
        role="option"
        aria-selected={index === activeIndex}
        onClick={() => void selectOption(option)}
        onPointerMove={event => { if (event.pointerType === "mouse") setActiveIndex(index); }}
        className={`flex min-h-11 cursor-pointer touch-manipulation items-center break-words rounded-lg px-3 py-2 text-sm leading-5 ${index === activeIndex ? "bg-accent text-accent-foreground" : ""} ${selecting ? "opacity-60" : ""}`}
      >{option.label}</li>)}
    </ul>
    {expanded && <p className="px-1 text-xs text-muted-foreground">Sugestões por <span translate="no">Google</span></p>}
    <p id={statusId} role="status" className={status ? "text-xs leading-5 text-muted-foreground" : "sr-only"}>{status || (expanded ? `${options.length} sugestões disponíveis.` : "")}</p>
    {error && <div role="alert" className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      <p>{error}</p>
      {onUseManual && <button type="button" onClick={onUseManual} className="inline-flex min-h-11 items-center rounded-lg font-semibold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Digitar o endereço</button>}
    </div>}
  </div>;
}
