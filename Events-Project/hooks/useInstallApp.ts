"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/** "ios-safari" can add to the Home Screen; "ios-other" (Chrome/Firefox iOS, Instagram, Facebook…) must reopen in Safari. */
export type InstallPlatformKind = "ios-safari" | "ios-other" | "android" | "desktop";
export type InstallPlatform = { kind: InstallPlatformKind; ipad: boolean; inApp: boolean };
export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

/** Chromium's install event (not in lib.dom). */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
};

export type InstallAppState = {
  /** false until the first client effect: render nothing before it (no SSR mismatch). */
  mounted: boolean;
  platform: InstallPlatform;
  /** The native Chromium prompt is ready. */
  canPrompt: boolean;
  /** Running from the Home Screen / installed window, or installed during this visit. */
  installed: boolean;
  /** Installed during this visit or opened standalone for the first time and not acknowledged yet. */
  welcome: boolean;
  /** Something useful can be offered here: native prompt or the iOS guide. */
  installable: boolean;
  dismissed: boolean;
  guideOpen: boolean;
  promptInstall: () => Promise<InstallOutcome>;
  /** Single entry for buttons: native prompt when available, otherwise the iOS guide. */
  startInstall: () => Promise<InstallOutcome | "guide">;
  setGuideOpen: (open: boolean) => void;
  dismiss: () => void;
  acknowledgeWelcome: () => void;
};

export const DISMISS_KEY = "eventmap:install-dismissed-until";
export const WELCOME_KEY = "eventmap:install-welcomed";
export const DISMISS_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;

const IN_APP = /\b(Instagram|FBAN|FBAV|FB_IAB|FBIOS|Line\/|Twitter|TikTok|musical_ly|Snapchat|LinkedInApp|Pinterest|GSA\/|WhatsApp)\b/i;
const IOS_OTHER_BROWSER = /\b(CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo|Brave)\b/i;

/** Pure: classifies a user agent. maxTouchPoints tells an iPad (which reports "Macintosh") from a Mac. */
export function detectPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  const ua = userAgent || "";
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  const ios = ipad || /iPhone|iPod/.test(ua);
  const inApp = IN_APP.test(ua);
  if (ios) {
    // Real Safari carries "Version/x Safari/y"; webviews usually drop the Safari token.
    const safari = /Version\/[\d.]+.*Safari\//.test(ua) && !inApp && !IOS_OTHER_BROWSER.test(ua);
    return { kind: safari ? "ios-safari" : "ios-other", ipad, inApp };
  }
  if (/Android/i.test(ua)) return { kind: "android", ipad: false, inApp };
  return { kind: "desktop", ipad: false, inApp };
}

type StandaloneWindow = { matchMedia?: (query: string) => { matches: boolean }; navigator?: { standalone?: boolean } };
export function isStandalone(win: StandaloneWindow): boolean {
  try {
    if (win.navigator?.standalone === true) return true;
    return Boolean(win.matchMedia?.("(display-mode: standalone)").matches || win.matchMedia?.("(display-mode: window-controls-overlay)").matches);
  } catch { return false; }
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;
function storage(): StorageLike | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}
export function readDismissed(store: StorageLike | null, now = Date.now()): boolean {
  try { const until = Number(store?.getItem(DISMISS_KEY)); return Number.isFinite(until) && until > now; } catch { return false; }
}
export function writeDismissed(store: StorageLike | null, now = Date.now()): void {
  try { store?.setItem(DISMISS_KEY, String(now + DISMISS_DAYS * DAY)); } catch { /* private mode: dismissal lasts this visit */ }
}
function readFlag(store: StorageLike | null, key: string): boolean {
  try { return store?.getItem(key) === "1"; } catch { return false; }
}
function writeFlag(store: StorageLike | null, key: string): void {
  try { store?.setItem(key, "1"); } catch { /* ignore */ }
}

/** What a card may show for a platform once mounted (pure, used by the card and tests). */
export function installableFor(platform: InstallPlatform, canPrompt: boolean, installed: boolean): boolean {
  if (installed) return false;
  return canPrompt || platform.kind === "ios-safari" || platform.kind === "ios-other";
}

const SERVER_PLATFORM: InstallPlatform = { kind: "desktop", ipad: false, inApp: false };
const noop = () => undefined;
export const InstallAppContext = createContext<InstallAppState>({
  mounted: false, platform: SERVER_PLATFORM, canPrompt: false, installed: false, welcome: false, installable: false, dismissed: false, guideOpen: false,
  promptInstall: async () => "unavailable", startInstall: async () => "unavailable", setGuideOpen: noop, dismiss: noop, acknowledgeWelcome: noop,
});

/** State machine behind InstallAppProvider. Mounted once, so the install events are listened to a single time. */
export function useInstallAppController(): InstallAppState {
  const [mounted, setMounted] = useState(false);
  const [platform, setPlatform] = useState<InstallPlatform>(SERVER_PLATFORM);
  const [installed, setInstalled] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const store = storage();
    setPlatform(detectPlatform(navigator.userAgent, navigator.maxTouchPoints || 0));
    const standalone = isStandalone(window as unknown as StandaloneWindow);
    setInstalled(standalone);
    setWelcome(standalone && !readFlag(store, WELCOME_KEY));
    setDismissed(readDismissed(store));
    setMounted(true);
    const onPrompt = (event: Event) => {
      event.preventDefault();
      deferred.current = event as BeforeInstallPromptEvent;
      setCanPrompt(true);
    };
    const onInstalled = () => {
      deferred.current = null;
      setCanPrompt(false); setInstalled(true); setGuideOpen(false);
      setWelcome(!readFlag(storage(), WELCOME_KEY));
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    const event = deferred.current;
    if (!event) return "unavailable";
    // A prompt event can be used only once.
    deferred.current = null; setCanPrompt(false);
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === "accepted") { setInstalled(true); setWelcome(!readFlag(storage(), WELCOME_KEY)); }
      return outcome;
    } catch { return "unavailable"; }
  }, []);

  const startInstall = useCallback(async (): Promise<InstallOutcome | "guide"> => {
    if (deferred.current) return promptInstall();
    if (platform.kind === "ios-safari" || platform.kind === "ios-other") { setGuideOpen(true); return "guide"; }
    return "unavailable";
  }, [platform.kind, promptInstall]);

  const dismiss = useCallback(() => { writeDismissed(storage()); setDismissed(true); setGuideOpen(false); }, []);
  const acknowledgeWelcome = useCallback(() => { writeFlag(storage(), WELCOME_KEY); setWelcome(false); }, []);

  return {
    mounted, platform, canPrompt, installed, welcome, dismissed, guideOpen, setGuideOpen,
    installable: mounted && installableFor(platform, canPrompt, installed),
    promptInstall, startInstall, dismiss, acknowledgeWelcome,
  };
}

export function useInstallApp(): InstallAppState {
  return useContext(InstallAppContext);
}
