const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

// Executes the real useInstallApp controller and InstallAppCard with deterministic hooks; no browser, database or network.
const compile = file => ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;

function fakeReact() {
  const slots = [], effects = []; let index = 0;
  const differs = (old, next) => !old || !next || old.some((value, i) => value !== next[i]);
  const react = {
    createContext: value => ({ Provider: "Provider", _value: value }),
    useContext: context => react.contextValue ?? context._value,
    useState(initial) { const i = index++; if (!slots[i]) slots[i] = { value: typeof initial === "function" ? initial() : initial }; return [slots[i].value, value => { slots[i].value = typeof value === "function" ? value(slots[i].value) : value; }]; },
    useRef(initial) { const i = index++; return slots[i] ?? (slots[i] = { current: initial }); },
    useCallback(fn) { index++; return fn; },
    useEffect(effect, deps) { const i = index++, old = slots[i]; if (!old || differs(old.deps, deps)) { slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = effect(); }); } },
  };
  return { react, begin: () => { index = 0; }, flush: () => { while (effects.length) effects.shift()(); }, cleanup: () => slots.forEach(slot => slot?.cleanup?.()) };
}

function loadHook(react) {
  const module = { exports: {} };
  new Function("require", "module", "exports", compile("hooks/useInstallApp.ts"))(name => { if (name === "react") return react; throw new Error("Unexpected dependency: " + name); }, module, module.exports);
  return module.exports;
}

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  ipadSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  chromeIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
  firefoxIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15",
  instagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Instagram 357.0.0.25.101 (iPhone15,2; iOS 18_1; pt_BR; pt; scale=3.00; 1179x2556; 655476556)",
  facebook: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 [FBAN/FBIOS;FBAV/490.0.0.38.109;FBBV/663383214;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.1;FBSS/3;FBLC/pt_BR]",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  desktopChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  desktopFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
};

function memoryStorage() { const map = new Map(); return { getItem: key => map.has(key) ? map.get(key) : null, setItem: (key, value) => map.set(key, String(value)), map }; }
const throwingStorage = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("QuotaExceededError"); } };

function mountController({ ua = UA.iphoneSafari, touch = 5, standalone = false, store = memoryStorage(), storageThrows = false } = {}) {
  const harness = fakeReact();
  const hook = loadHook(harness.react);
  const listeners = {};
  const win = {
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter(item => item !== fn); },
    matchMedia: query => ({ matches: standalone && query === "(display-mode: standalone)" }),
    navigator: { userAgent: ua, maxTouchPoints: touch },
  };
  Object.defineProperty(win, "localStorage", { get() { if (storageThrows) throw new Error("SecurityError"); return store; }, configurable: true });
  global.window = win; Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true, writable: true });
  let state;
  const render = () => { harness.begin(); state = hook.useInstallAppController(); harness.flush(); harness.begin(); state = hook.useInstallAppController(); return state; };
  const before = (() => { harness.begin(); return hook.useInstallAppController(); })();
  harness.flush();
  render();
  const fire = (type, event = {}) => { for (const fn of listeners[type] || []) fn(event); return render(); };
  return { hook, before, render, fire, listeners, store, get state() { return state; }, unmount: harness.cleanup };
}

function promptEvent(outcome) {
  const event = { prevented: false, prompted: 0, preventDefault() { this.prevented = true; }, prompt: async () => { event.prompted++; }, userChoice: Promise.resolve({ outcome }) };
  return event;
}

(async () => {
  const { detectPlatform, isStandalone, readDismissed, writeDismissed, installableFor, DISMISS_KEY, DISMISS_DAYS } = mountController().hook;

  // Platform matrix.
  const kind = (ua, touch = 0) => detectPlatform(ua, touch);
  assert.deepEqual(kind(UA.iphoneSafari), { kind: "ios-safari", ipad: false, inApp: false });
  assert.deepEqual(kind(UA.ipadSafari, 5), { kind: "ios-safari", ipad: true, inApp: false }, "iPadOS reports Macintosh but has touch");
  assert.equal(kind(UA.macSafari, 0).kind, "desktop", "Mac Safari without touch is desktop");
  assert.equal(kind(UA.chromeIos).kind, "ios-other", "Chrome iOS (CriOS)");
  assert.equal(kind(UA.firefoxIos).kind, "ios-other", "Firefox iOS (FxiOS)");
  assert.deepEqual(kind(UA.instagram), { kind: "ios-other", ipad: false, inApp: true }, "Instagram in-app browser");
  assert.deepEqual(kind(UA.facebook), { kind: "ios-other", ipad: false, inApp: true }, "Facebook in-app browser");
  assert.equal(kind(UA.android).kind, "android");
  assert.equal(kind(UA.desktopChrome).kind, "desktop");
  assert.equal(kind(UA.desktopFirefox).kind, "desktop");
  assert.equal(kind("").kind, "desktop", "empty UA is safe");
  // Installable: iOS always (guide), others only with the native prompt, never once installed.
  assert.equal(installableFor(kind(UA.iphoneSafari), false, false), true);
  assert.equal(installableFor(kind(UA.instagram), false, false), true);
  assert.equal(installableFor(kind(UA.desktopFirefox), false, false), false, "Firefox desktop (no prompt) hides the card");
  assert.equal(installableFor(kind(UA.android), false, false), false, "Android without beforeinstallprompt hides the card");
  assert.equal(installableFor(kind(UA.android), true, false), true);
  assert.equal(installableFor(kind(UA.iphoneSafari), false, true), false, "installed hides everything");

  // Standalone detection.
  assert.equal(isStandalone({ navigator: { standalone: true } }), true, "iOS navigator.standalone");
  assert.equal(isStandalone({ matchMedia: q => ({ matches: q === "(display-mode: standalone)" }) }), true);
  assert.equal(isStandalone({ matchMedia: () => ({ matches: false }), navigator: {} }), false);
  assert.equal(isStandalone({ matchMedia: () => { throw new Error(); } }), false, "matchMedia failures are safe");

  // Dismissal: 14 days in localStorage only, safe when storage throws.
  const store = memoryStorage(), now = 1_700_000_000_000;
  writeDismissed(store, now);
  assert.equal(Number(store.getItem(DISMISS_KEY)), now + DISMISS_DAYS * 86400000);
  assert.equal(readDismissed(store, now + 13 * 86400000), true);
  assert.equal(readDismissed(store, now + 15 * 86400000), false, "expires after 14 days");
  assert.doesNotThrow(() => writeDismissed(throwingStorage, now));
  assert.equal(readDismissed(throwingStorage, now), false);
  assert.equal(readDismissed(null, now), false);

  // Controller: nothing before mount (SSR-safe), iPhone Safari opens the guide.
  let c = mountController();
  assert.equal(c.before.mounted, false); assert.equal(c.before.installable, false, "server/first render shows nothing");
  assert.equal(c.state.mounted, true); assert.equal(c.state.installable, true); assert.equal(c.state.platform.kind, "ios-safari");
  assert.equal(await c.state.startInstall(), "guide"); c.render(); assert.equal(c.state.guideOpen, true);
  c.state.dismiss(); c.render();
  assert.equal(c.state.dismissed, true); assert.equal(c.state.guideOpen, false);
  assert.ok(Number(c.store.getItem("eventmap:install-dismissed-until")) > Date.now(), "dismissal stored locally");
  // Dismissal survives a reload; with throwing storage it lasts only the visit.
  assert.equal(mountController({ store: c.store }).state.dismissed, true);
  c = mountController({ storageThrows: true });
  assert.equal(c.state.dismissed, false); assert.doesNotThrow(() => c.state.dismiss()); c.render(); assert.equal(c.state.dismissed, true);
  assert.equal(mountController({ storageThrows: true }).state.dismissed, false);

  // Standalone: installed, card hidden, welcome shown once.
  c = mountController({ standalone: true });
  assert.equal(c.state.installed, true); assert.equal(c.state.installable, false); assert.equal(c.state.welcome, true);
  c.state.acknowledgeWelcome(); c.render(); assert.equal(c.state.welcome, false);
  assert.equal(mountController({ standalone: true, store: c.store }).state.welcome, false, "welcome is shown only once");

  // Android: hidden until beforeinstallprompt; accepted → installed + welcome.
  c = mountController({ ua: UA.android, touch: 5 });
  assert.equal(c.state.installable, false);
  assert.equal(await c.state.promptInstall(), "unavailable");
  const accepted = promptEvent("accepted");
  c.fire("beforeinstallprompt", accepted);
  assert.equal(accepted.prevented, true, "mini-infobar suppressed; event kept");
  assert.equal(c.state.canPrompt, true); assert.equal(c.state.installable, true);
  assert.equal(await c.state.startInstall(), "accepted"); c.render();
  assert.equal(accepted.prompted, 1);
  assert.equal(c.state.installed, true); assert.equal(c.state.welcome, true); assert.equal(c.state.canPrompt, false); assert.equal(c.state.installable, false);
  // Dismissed: event consumed, card hides until the browser offers a new prompt.
  c = mountController({ ua: UA.desktopChrome });
  const declined = promptEvent("dismissed");
  c.fire("beforeinstallprompt", declined);
  assert.equal(await c.state.promptInstall(), "dismissed"); c.render();
  assert.equal(c.state.installed, false); assert.equal(c.state.canPrompt, false); assert.equal(c.state.installable, false);
  assert.equal(await c.state.promptInstall(), "unavailable", "a prompt event is used once");
  // appinstalled (e.g. from the browser menu) closes everything and shows the welcome.
  c = mountController({ ua: UA.android });
  c.fire("beforeinstallprompt", promptEvent("accepted"));
  c.fire("appinstalled");
  assert.equal(c.state.installed, true); assert.equal(c.state.welcome, true); assert.equal(c.state.canPrompt, false);
  // Listeners are registered once and cleaned up.
  assert.equal(c.listeners.beforeinstallprompt.length, 1); assert.equal(c.listeners.appinstalled.length, 1);
  c.unmount();
  assert.equal(c.listeners.beforeinstallprompt.length, 0); assert.equal(c.listeners.appinstalled.length, 0);

  // InstallAppCard rendering per state.
  const cardModule = (state) => {
    const harness = fakeReact();
    harness.react.contextValue = state;
    const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
    const module = { exports: {} };
    const requireCard = name => {
      if (name === "react") return harness.react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (name === "next/image") return { __esModule: true, default: "Image" };
      if (name === "@radix-ui/react-dialog") return new Proxy({}, { get: (_, part) => "Dialog." + String(part) });
      if (name === "lucide-react") return new Proxy({}, { get: (_, part) => part });
      if (name === "@/hooks/useInstallApp") return { useInstallApp: () => state };
      if (name === "./PushSettings") return { __esModule: true, default: "PushSettings" };
      throw new Error("Unexpected dependency: " + name);
    };
    new Function("require", "module", "exports", compile("components/MyComponents/InstallAppCard.tsx"))(requireCard, module, module.exports);
    return { exports: module.exports, harness };
  };
  const baseState = (over = {}) => ({ mounted: true, platform: { kind: "ios-safari", ipad: false, inApp: false }, canPrompt: false, installed: false, welcome: false, installable: true, dismissed: false, guideOpen: false, calls: [], promptInstall: async () => "accepted", startInstall: async () => "guide", setGuideOpen() {}, dismiss() {}, acknowledgeWelcome() {}, ...over });
  const nodes = tree => { const result = []; const visit = value => { if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === "object" && "type" in value) { result.push(value); visit(value.props.children); } }; visit(tree); return result; };
  const text = value => Array.isArray(value) ? value.map(text).join("") : value && typeof value === "object" ? text(value.props?.children) : value == null || value === false ? "" : String(value);
  const renderCard = (state, props = { variant: "compact", fallback: "push-fallback" }) => { const { exports, harness } = cardModule(state); harness.begin(); const tree = exports.default(props); return { tree, all: nodes(tree), text: text(tree), exports }; };

  let card = renderCard(baseState({ mounted: false }));
  assert.equal(card.tree, null, "renders nothing before mount (no SSR mismatch)");
  card = renderCard(baseState());
  assert.match(card.text, /Instale o EventMap no seu celular/); assert.match(card.text, /Instalar app/); assert.match(card.text, /Agora não/);
  assert.equal(card.all.find(n => typeof n.type === "function" && n.type.name === "Shell").props.compact, true, "compact variant");
  let started = 0;
  card = renderCard(baseState({ startInstall: async () => { started++; return "guide"; } }));
  await card.all.find(n => n.type === "button" && /Instalar app/.test(text(n))).props.onClick(); assert.equal(started, 1);
  let dismissedCalls = 0;
  card = renderCard(baseState({ dismiss: () => { dismissedCalls++; } }));
  card.all.find(n => n.type === "button" && text(n) === "Agora não").props.onClick(); assert.equal(dismissedCalls, 1);
  // In-app/other iOS browser: Safari message + copy link.
  card = renderCard(baseState({ platform: { kind: "ios-other", ipad: false, inApp: true } }));
  assert.match(card.text, /Abra no Safari para instalar/); assert.match(card.text, /Copiar link/); assert.match(card.text, /Ver passos/);
  assert.ok(card.all.some(n => n.type === "button" && n.props["aria-label"] === "Agora não"), "in-app card keeps a labelled dismiss");
  // Standalone/installed or dismissed on iPhone: nothing (push is unavailable there anyway).
  assert.equal(renderCard(baseState({ installable: false, installed: false })).tree, null);
  assert.equal(renderCard(baseState({ dismissed: true })).tree, null);
  // Android/desktop without install: push invitation as fallback, never stacked with the install card.
  card = renderCard(baseState({ platform: { kind: "android", ipad: false, inApp: false }, installable: false }));
  assert.equal(card.text, "push-fallback");
  card = renderCard(baseState({ platform: { kind: "android", ipad: false, inApp: false }, canPrompt: true }));
  assert.ok(!card.text.includes("push-fallback"), "install first, push after");
  // Installed standalone: fallback (push) shows; first run shows the welcome with PushSettings compact.
  card = renderCard(baseState({ installed: true, installable: false }));
  assert.equal(card.text, "push-fallback");
  card = renderCard(baseState({ installed: true, installable: false, welcome: true }));
  assert.match(card.text, /App instalado!/); assert.match(card.text, /Ative as notificações/);
  assert.ok(card.all.some(n => n.type === "PushSettings" && n.props.variant === "compact"), "reuses PushSettings compact");
  assert.ok(!card.text.includes("push-fallback"), "welcome replaces the fallback");

  // Guide sheet: dialog a11y, 3 steps, arrow honours reduced motion.
  const guide = (platform, guideOpen = true) => { const { exports, harness } = cardModule(baseState({ platform, guideOpen })); harness.begin(); const tree = exports.InstallAppGuide(); return { tree, all: nodes(tree), text: text(tree) }; };
  let g = guide({ kind: "ios-safari", ipad: false, inApp: false });
  assert.ok(g.all.some(n => n.type === "Dialog.Title") && g.all.some(n => n.type === "Dialog.Description"), "titled, described dialog");
  assert.equal(g.all.find(n => n.type === "ol").props.children.length, 3);
  assert.match(g.text, /Compartilhar/); assert.match(g.text, /Adicionar à Tela de Início/); assert.match(g.text, /Adicionar/);
  const pointer = g.all.find(n => n.props["data-install-guide"] === "pointer");
  assert.match(pointer.props.children[0].props.className, /motion-safe:animate-bounce/, "arrow bounces only without reduced motion");
  assert.match(g.text, /aqui embaixo/, "iPhone points to the bottom toolbar");
  g = guide({ kind: "ios-safari", ipad: true, inApp: false });
  assert.match(g.all.find(n => n.props["data-install-guide"] === "pointer").props.className, /top-3/, "iPad points to the top-right");
  g = guide({ kind: "ios-other", ipad: false, inApp: true });
  assert.match(g.text, /Abra no Safari para instalar/); assert.match(g.text, /Copiar link/);
  assert.equal(guide({ kind: "android", ipad: false, inApp: false }).tree, null, "no guide outside iOS");
  assert.equal(card.exports.installLink({ origin: "https://eventmap.app", pathname: "/conversas" }), "https://eventmap.app/conversas", "copied link has no query or hash");

  // Wiring: provider mounted once, entries in sidebar/footer/conversas, manifest install criteria, sw untouched.
  const providers = fs.readFileSync("components/Providers/ClientProviders.tsx", "utf8");
  assert.equal((providers.match(/<InstallAppProvider>/g) || []).length, 1);
  assert.match(fs.readFileSync("components/ui/app-sidebar.tsx", "utf8"), /installable && [\s\S]*Instalar app/);
  assert.match(fs.readFileSync("components/MyComponents/SiteFooter.tsx", "utf8"), /<InstallAppFooterLink \/>/);
  assert.match(fs.readFileSync("components/MyComponents/PartyInbox.tsx", "utf8"), /<InstallAppCard variant="compact" fallback=\{<PushSettings variant="compact" \/>\} \/>/);
  const manifest = fs.readFileSync("app/manifest.ts", "utf8");
  for (const field of ['name: "EventMap"', 'short_name: "EventMap"', 'id: "/"', 'start_url: "/"', 'scope: "/"', 'display: "standalone"', "theme_color", "background_color", 'sizes: "192x192"', 'sizes: "512x512"', 'purpose: "maskable"']) assert.ok(manifest.includes(field), "manifest " + field);
  for (const file of ["public/branding/app-icon-192.png", "public/branding/app-icon-512.png", "public/branding/app-icon-maskable-512.png"]) {
    const png = fs.readFileSync(file); const size = Number(file.match(/(\d+)\.png$/)[1]);
    assert.equal(png.readUInt32BE(16), size, file + " width"); assert.equal(png.readUInt32BE(20), size, file + " height");
  }
  assert.ok(!/addEventListener\(\s*["']fetch["']/.test(fs.readFileSync("public/sw.js", "utf8")), "service worker still never intercepts (or caches) requests");

  console.log("PASS install app: platform matrix, standalone, 14-day dismissal (throwing storage), prompt accepted/dismissed, appinstalled, card/guide states, wiring, manifest icons");
})().catch(error => { console.error(error); process.exit(1); });
