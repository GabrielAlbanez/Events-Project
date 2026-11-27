export const DEFAULT_LOCATION_DENIED_MESSAGE = "A localização está bloqueada no navegador. Para usá-la, permita o acesso nas configurações deste site. Você também pode selecionar um endereço.";

const IOS_SAFARI_MESSAGE = "A localização está bloqueada no iPhone. Ative em Ajustes → Privacidade e Segurança → Serviços de Localização → Sites do Safari → “Durante o Uso”. Se já estiver ativo, toque em aA na barra de endereço → Ajustes do Site → Localização → Permitir. Você também pode selecionar um endereço.";
const IOS_CHROME_MESSAGE = "A localização está bloqueada no iPhone. Ative em Ajustes → Chrome → Localização → “Durante o Uso” e confirme que Ajustes → Privacidade e Segurança → Serviços de Localização está ligado. Você também pode selecionar um endereço.";
const UNAVAILABLE_MESSAGE = "Não foi possível acessar sua localização. Você pode explorar o mapa ou selecionar um endereço.";
const WINDOWS_UNAVAILABLE_MESSAGE = "Não foi possível obter sua localização. No Windows, ative em Configurações → Privacidade e segurança → Localização: “Serviços de localização” e “Permitir que aplicativos da área de trabalho acessem sua localização”. Você também pode selecionar um endereço.";
const MAC_UNAVAILABLE_MESSAGE = "Não foi possível obter sua localização. No Mac, ative em Ajustes do Sistema → Privacidade e Segurança → Serviços de Localização e permita o navegador. Você também pode selecionar um endereço.";
const TIMEOUT_MESSAGE = "A localização demorou para responder. Tente novamente ou selecione um endereço.";
const ANDROID_MESSAGE = "A localização está bloqueada. Toque no cadeado ao lado do endereço do site → Permissões → Localização → Permitir, e confirme que a localização do celular está ligada. Você também pode selecionar um endereço.";

// iPadOS reports itself as a Mac; touch points reveal the tablet.
const isIOS = (userAgent: string, platform?: string, maxTouchPoints?: number) => /iPhone|iPad|iPod/.test(userAgent) || (platform === "MacIntel" && (maxTouchPoints ?? 0) > 1);

/**
 * Guidance shown when geolocation returns PERMISSION_DENIED. On iOS the denial usually comes from
 * system settings (no prompt appears), so the steps point there. iPadOS reports itself as a Mac with touch.
 */
export function locationDeniedMessage(userAgent: string, platform?: string, maxTouchPoints?: number): string {
  if (isIOS(userAgent, platform, maxTouchPoints)) return /CriOS/.test(userAgent) ? IOS_CHROME_MESSAGE : IOS_SAFARI_MESSAGE;
  if (/Android/i.test(userAgent)) return ANDROID_MESSAGE;
  return DEFAULT_LOCATION_DENIED_MESSAGE;
}

/** GeolocationPositionError codes: 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT. */
export function locationErrorMessage(code: number, userAgent: string, platform?: string, maxTouchPoints?: number): string {
  if (code === 1) return locationDeniedMessage(userAgent, platform, maxTouchPoints);
  if (code === 3) return TIMEOUT_MESSAGE;
  // POSITION_UNAVAILABLE on desktops usually means the OS location service is off for the browser.
  if (!isIOS(userAgent, platform, maxTouchPoints) && !/Android/i.test(userAgent)) {
    if (/Windows/.test(userAgent)) return WINDOWS_UNAVAILABLE_MESSAGE;
    if (/Macintosh|Mac OS X/.test(userAgent)) return MAC_UNAVAILABLE_MESSAGE;
  }
  return UNAVAILABLE_MESSAGE;
}

/**
 * One explicit browser location request with the same strategy as the map's locate button: a quick network fix,
 * then a single high-accuracy retry when it is unavailable or slow. Rejects with the platform message above.
 * The coordinates are only returned to the caller (never stored or logged here).
 */
export function requestBrowserPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { reject(new Error("Este navegador não oferece localização.")); return; }
    const locate = (retry: boolean) => navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (error) => {
        if (!retry && (error.code === error.POSITION_UNAVAILABLE || error.code === error.TIMEOUT)) { locate(true); return; }
        reject(new Error(locationErrorMessage(error.code, navigator.userAgent, navigator.platform, navigator.maxTouchPoints)));
      },
      retry ? { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 } : { enableHighAccuracy: false, maximumAge: 60000, timeout: 7000 },
    );
    locate(false);
  });
}
