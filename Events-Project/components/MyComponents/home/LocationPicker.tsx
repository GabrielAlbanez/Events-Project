"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, LocateFixed, MapPin, X } from "lucide-react";

type LocationPickerProps = {
  cities: string[];
  city: string;
  /** Short address (or "Perto de você") while the visitor's own location is the active origin. */
  userLabel: string | null;
  locating: boolean;
  error: string | null;
  /** Location active but the map is off: the address needs the (optional) Google Maps. */
  showEnableMaps: boolean;
  onEnableMaps: () => void;
  onCity: (city: string) => void;
  onUseLocation: () => void;
  onClear: () => void;
};

const LOCATE = "__locate__";

/**
 * "Sua localização" trigger + listbox popover. The popover is positioned against the nearest positioned ancestor
 * (the panel row), so it takes the panel/sheet width.
 */
export function LocationPicker({ cities, city, userLabel, locating, error, showEnableMaps, onEnableMaps, onCity, onUseLocation, onClear }: LocationPickerProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const listId = baseId + "-list";
  const options = [LOCATE, "", ...cities];
  const selectedValue = userLabel !== null ? LOCATE : city;
  const value = locating ? "Localizando…" : userLabel ?? (city || "Todas as cidades");

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    listRef.current?.focus({ preventScroll: true });
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const openList = () => { setActive(Math.max(0, options.indexOf(selectedValue))); setOpen(true); };
  const close = (focusTrigger = true) => { setOpen(false); if (focusTrigger) triggerRef.current?.focus(); };
  const choose = (option: string) => {
    close();
    if (option === LOCATE) onUseLocation();
    else onCity(option);
  };
  const onListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => Math.min(options.length - 1, index + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(0, index - 1)); }
    else if (event.key === "Home") { event.preventDefault(); setActive(0); }
    else if (event.key === "End") { event.preventDefault(); setActive(options.length - 1); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(options[active]); }
    else if (event.key === "Escape") { event.preventDefault(); close(); }
    else if (event.key === "Tab") setOpen(false);
  };

  return (
    <div ref={rootRef} className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-1">
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={`Sua localização: ${value}. Alterar`}
          onClick={() => (open ? close(false) : openList())}
          onKeyDown={(event) => { if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !open) { event.preventDefault(); openList(); } }}
          className="group flex min-h-11 min-w-0 items-center gap-2.5 rounded-xl pr-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          <span aria-hidden="true" className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border shadow-sm transition-colors ${userLabel !== null ? "border-primary/30 bg-primary text-primary-foreground" : "border-border bg-card text-brand group-hover:border-primary/30"}`}>
            {locating ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" /> : <MapPin className="h-4 w-4" />}
          </span>
          <span aria-hidden="true" className="min-w-0">
            <span className="block text-[11px] leading-4 text-muted-foreground">Sua localização</span>
            <span className="flex min-w-0 items-center gap-1 text-sm font-semibold leading-5"><span className="truncate">{value}</span><ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} /></span>
          </span>
        </button>
        {userLabel !== null && !locating && <button type="button" onClick={onClear} aria-label="Limpar localização" title="Limpar localização" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X aria-hidden="true" className="h-3.5 w-3.5" /></button>}
      </div>
      {error && <p role="status" className="mt-1 text-xs leading-4 text-destructive">{error}</p>}
      {showEnableMaps && !error && <p className="mt-1 text-xs leading-4 text-muted-foreground">Ative o mapa para ver o endereço. <button type="button" onClick={onEnableMaps} className="rounded font-semibold text-brand underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Ativar mapa</button></p>}

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label="Escolher localização"
          aria-activedescendant={`${baseId}-option-${active}`}
          onKeyDown={onListKey}
          className="absolute inset-x-0 top-full z-40 mt-2 max-h-[min(22rem,60vh)] overflow-y-auto overscroll-contain rounded-2xl border border-black/[.06] bg-card p-1.5 text-card-foreground shadow-[0_1px_2px_rgba(16,21,31,.06),0_12px_24px_-12px_rgba(16,21,31,.2),0_32px_64px_-28px_rgba(16,21,31,.38)] outline-none dark:border-white/10"
        >
          {options.map((option, index) => {
            const selected = option === selectedValue;
            const isActive = index === active;
            const common = { id: `${baseId}-option-${index}`, role: "option" as const, "aria-selected": selected, "data-index": index, onMouseEnter: () => setActive(index), onClick: () => choose(option) };
            if (option === LOCATE) return (
              <li key="locate" {...common} className={`flex cursor-pointer items-center gap-3 rounded-xl p-2.5 transition-colors ${isActive ? "bg-cta/15" : ""}`}>
                <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cta text-cta-foreground shadow-sm"><LocateFixed className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Usar minha localização atual</span>
                  <span className="block text-xs text-muted-foreground">Mostra eventos perto de você</span>
                </span>
                {selected && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-brand" />}
              </li>
            );
            const row = (
              <li key={option || "all"} {...common} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm transition-colors ${selected ? "font-semibold text-foreground" : "text-foreground/85"} ${isActive ? "bg-primary/[.07]" : ""}`}>
                <span className="min-w-0 flex-1 truncate">{option || "Todas as cidades"}</span>
                {selected && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-brand" />}
              </li>
            );
            return index === 1 ? [<li key="divider" role="presentation" aria-hidden="true" className="mx-2 my-1.5 h-px bg-border" />, row] : row;
          })}
          <li role="presentation" className="px-3 pb-1.5 pt-2 text-[11px] leading-4 text-muted-foreground">Sua posição fica só nesta página. Com o mapa ativo, o endereço é consultado no Google.</li>
        </ul>
      )}
    </div>
  );
}
