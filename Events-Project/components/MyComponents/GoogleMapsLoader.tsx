"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

export type MapsStatus = { isLoaded: boolean; isLoading: boolean; error: string | null };
type MapsContextValue = MapsStatus & {
  enabled: boolean;
  configured: boolean;
  enableMaps: () => void;
  disableMaps: () => void;
};
const preferenceKey = "eventmap:maps-enabled";
export const GoogleMapsContext = createContext<MapsContextValue>({
  isLoaded: false, isLoading: false, error: null, enabled: false, configured: false,
  enableMaps: () => undefined, disableMaps: () => undefined,
});
export const useGoogleMaps = () => useContext(GoogleMapsContext);
const Runtime = dynamic(() => import("./GoogleMapsRuntime"), { ssr: false });

export default function GoogleMapsLoader({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<MapsStatus>({ isLoaded: false, isLoading: true, error: null });
  const needed = pathname === "/" || pathname === "/EventsCreated" || pathname === "/CriarEvento" || /^\/eventos\/[^/]+\/editar$/.test(pathname);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  useEffect(() => {
    try { setEnabled(window.sessionStorage.getItem(preferenceKey) === "1"); }
    catch { /* A escolha continua disponível em memória quando o armazenamento está bloqueado. */ }
  }, []);
  const enableMaps = useCallback(() => {
    try { window.sessionStorage.setItem(preferenceKey, "1"); } catch { /* Preferência somente em memória. */ }
    setEnabled(true);
  }, []);
  const disableMaps = useCallback(() => {
    try { window.sessionStorage.removeItem(preferenceKey); } catch { /* Nenhuma preferência persistida. */ }
    setEnabled(false);
    // Desmontar o mapa não encerra os scripts do fornecedor já carregados.
    // A navegação completa inicia um documento novo sem o runtime do Google.
    window.location.reload();
  }, []);
  const active = needed && Boolean(apiKey) && enabled;
  const value: MapsContextValue = {
    ...(active ? status : { isLoaded: false, isLoading: false,
      error: needed && !apiKey ? "O mapa está indisponível no momento. Use a lista de eventos ou digite o endereço." : null }),
    enabled, configured: Boolean(apiKey), enableMaps, disableMaps,
  };
  return <GoogleMapsContext.Provider value={value}>{active && apiKey && <Runtime apiKey={apiKey} onStatus={setStatus} />}{children}</GoogleMapsContext.Provider>;
}
