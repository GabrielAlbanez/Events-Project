#!/usr/bin/env node
// Offline: platform-specific guidance when the browser denies geolocation (PERMISSION_DENIED).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const file = path.join(__dirname, "../lib/geolocationHelp.ts");
const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function("exports", "module", output)(mod.exports, mod);
const { locationDeniedMessage, locationErrorMessage, DEFAULT_LOCATION_DENIED_MESSAGE } = mod.exports;

const iosSafari = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const iosChrome = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1";
const iPadOS = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const desktop = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const safariText = locationDeniedMessage(iosSafari, "iPhone", 5);
assert.match(safariText, /^A localização está bloqueada no iPhone\./);
assert.match(safariText, /Sites do Safari → “Durante o Uso”/);
assert.match(safariText, /aA na barra de endereço → Ajustes do Site → Localização → Permitir/);
assert.match(safariText, /Você também pode selecionar um endereço\.$/);

const chromeText = locationDeniedMessage(iosChrome, "iPhone", 5);
assert.match(chromeText, /Ajustes → Chrome → Localização → “Durante o Uso”/);
assert.match(chromeText, /Serviços de Localização está ligado/);
assert.doesNotMatch(chromeText, /Safari/);

// iPadOS reports itself as a Mac; touch points reveal the tablet.
assert.equal(locationDeniedMessage(iPadOS, "MacIntel", 5), safariText);
// A real Mac (no touch) keeps the generic desktop guidance.
assert.equal(locationDeniedMessage(iPadOS, "MacIntel", 0), DEFAULT_LOCATION_DENIED_MESSAGE);

const androidText = locationDeniedMessage(android, "Linux armv8l", 5);
assert.match(androidText, /^A localização está bloqueada\. Toque no cadeado/);
assert.match(androidText, /Permissões → Localização → Permitir/);

assert.equal(locationDeniedMessage(desktop, "Win32", 0), DEFAULT_LOCATION_DENIED_MESSAGE);
assert.equal(locationDeniedMessage(desktop), DEFAULT_LOCATION_DENIED_MESSAGE, "platform and touch are optional");
assert.equal(locationDeniedMessage(""), DEFAULT_LOCATION_DENIED_MESSAGE);
assert.match(DEFAULT_LOCATION_DENIED_MESSAGE, /permita o acesso nas configurações deste site/);

// Error codes: 1 denied (same guidance as above), 2 unavailable (desktop OS location service), 3 timeout.
assert.equal(locationErrorMessage(1, iosSafari, "iPhone", 5), safariText);
assert.equal(locationErrorMessage(1, android, "Linux armv8l", 5), androidText);
const windowsUnavailable = locationErrorMessage(2, desktop, "Win32", 0);
assert.match(windowsUnavailable, /^Não foi possível obter sua localização\. No Windows, ative em Configurações → Privacidade e segurança → Localização/);
assert.match(windowsUnavailable, /“Permitir que aplicativos da área de trabalho acessem sua localização”/);
const macUnavailable = locationErrorMessage(2, iPadOS, "MacIntel", 0);
assert.match(macUnavailable, /No Mac, ative em Ajustes do Sistema → Privacidade e Segurança → Serviços de Localização e permita o navegador/);
assert.doesNotMatch(locationErrorMessage(2, iPadOS, "MacIntel", 5), /No Mac/, "iPadOS is not treated as a Mac");
assert.doesNotMatch(locationErrorMessage(2, iosSafari, "iPhone", 5), /No Mac|No Windows/, "iPhone UA contains 'Mac OS X' but is not a Mac");
assert.match(locationErrorMessage(2, android, "Linux armv8l", 5), /^Não foi possível acessar sua localização/);
assert.match(locationErrorMessage(3, desktop, "Win32", 0), /demorou para responder/);

const map = fs.readFileSync(path.join(__dirname, "../components/MyComponents/Map.tsx"), "utf8");
assert.ok(map.includes("locationErrorMessage(error.code, navigator.userAgent, navigator.platform, navigator.maxTouchPoints)"));
assert.ok(map.includes('const LOCATION_TOAST_ID = "location";'), "one stable toast id for every location message");
assert.ok(map.includes("toastId: LOCATION_TOAST_ID"));
assert.ok(map.includes("toast.dismiss(LOCATION_TOAST_ID)"), "success clears any lingering location error");
assert.ok(map.includes("retry ? { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }"), "high-accuracy retry options");

// Behaviour: run the real handler with a fake geolocation and toast.
const startIndex = map.indexOf("  const getCurrentLocation = useCallback(() => {");
const body = map.slice(startIndex + "  const getCurrentLocation = useCallback(() => {".length, map.indexOf("  }, [clearAddressParam]);", startIndex));
const run = (() => {
  const code = ts.transpileModule(`export function run(locationInFlightRef, locationRequestRef, navigator, toast, LOCATION_TOAST_ID, locationErrorMessage, setIsLocating, setCurrentLocation, setUserLocation, setShowLocationPrompt, clearAddressParam) { ${body} }`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const m = { exports: {} }; new Function("exports", code)(m.exports); return m.exports.run;
})();
function scenario() {
  const calls = [], log = [], active = new Set();
  const toast = Object.assign((message, options) => { log.push(["show", message, options.toastId]); active.add(options.toastId); }, {
    error: (message, options) => log.push(["error", message, options && options.toastId]),
    isActive: id => active.has(id), update: (id, options) => log.push(["update", options.render, id]), dismiss: id => { log.push(["dismiss", id]); active.delete(id); },
  });
  const nav = { userAgent: desktop, platform: "Win32", maxTouchPoints: 0, geolocation: { getCurrentPosition: (ok, fail, options) => calls.push({ ok, fail, options }) } };
  const state = { inFlight: { current: false }, request: { current: 0 }, located: null };
  const start = () => run(state.inFlight, state.request, nav, toast, "location", locationErrorMessage, () => {}, () => {}, value => { state.located = value; }, () => {}, () => {});
  return { calls, log, state, start };
}
const unavailable = { code: 2, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
{
  const t = scenario(); t.start();
  t.calls[0].fail(unavailable);
  assert.equal(t.calls.length, 2, "first POSITION_UNAVAILABLE retries once");
  assert.deepEqual(t.calls[1].options, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  assert.deepEqual(t.log, [], "no toast before the retry finishes");
  t.calls[1].ok({ coords: { latitude: 1, longitude: 2 } });
  assert.deepEqual(t.state.located, { lat: 1, lng: 2 });
  assert.deepEqual(t.log, [["dismiss", "location"]]);
  assert.equal(t.state.inFlight.current, false);
}
{
  const t = scenario(); t.start();
  t.calls[0].fail(unavailable); t.calls[1].fail(unavailable);
  assert.equal(t.calls.length, 2, "only one retry");
  assert.deepEqual(t.log, [["show", windowsUnavailable, "location"]]);
  t.start(); t.calls[2].fail({ ...unavailable, code: 1 });
  assert.equal(t.calls.length, 3, "denied never retries");
  assert.equal(t.log.at(-1)[0], "update", "repeated attempts reuse the visible toast");
}
{
  const t = scenario(); t.start();
  t.state.request.current += 1; // superseded (address search or cancel)
  t.calls[0].fail(unavailable);
  assert.equal(t.calls.length, 1); assert.deepEqual(t.log, [], "superseded errors stay silent");
}

console.log("PASS geolocation help: iOS Safari, iOS Chrome, iPadOS as Mac, Android, desktop fallback, Windows/Mac unavailable steps, single retry, stable toast and success dismissal");
