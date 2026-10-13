const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const source = fs.readFileSync("components/MyComponents/Map.tsx", "utf8");
const marker = source.indexOf("    if (!enderecoParam) return;");
const start = source.lastIndexOf("  useEffect(() => {", marker);
const end = source.indexOf("  }, [convertAddressToCoordinates, enderecoParam]);", marker);
const effectSource = source.slice(start + "  useEffect(() => {".length, end);
const manualStart = source.indexOf("  const getCurrentLocation = useCallback(() => {");
const manualEnd = source.indexOf("  }, [router]);", manualStart);
const manualSource = source.slice(manualStart + "  const getCurrentLocation = useCallback(() => {".length, manualEnd);
function compile(body, names) {
  const code = ts.transpileModule(`export function run(${names.join(",")}) { ${body} }`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} }; new Function("exports", code)(mod.exports); return mod.exports.run;
}
const addressEffect = compile(effectSource, ["enderecoParam", "locationRequestRef", "convertAddressToCoordinates", "setCurrentLocation", "toast"]);
const manual = compile(manualSource, ["locationRequestRef", "navigator", "setCurrentLocation", "setUserLocation", "router", "toast"]);
(async () => {
  const ref = { current: 0 }, locations = [], errors = [], pending = new Map();
  const geocode = address => new Promise((resolve, reject) => pending.set(address, { resolve, reject }));
  const toast = { error: value => errors.push(value) };
  const effect = address => addressEffect(address, ref, geocode, value => locations.push(value), toast);
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
  let cleanup = effect("Rua 100%");
  assert.ok(pending.has("Rua 100%"), "literal percent reaches geocoder unchanged");
  cleanup(); cleanup = effect("B"); pending.get("B").resolve("B"); await flush();
  pending.get("Rua 100%").resolve("A"); await flush(); assert.deepEqual(locations, ["B"], "obsolete address cannot replace latest search");
  cleanup(); cleanup = effect("C");
  let located;
  manual(ref, { geolocation: { getCurrentPosition: callback => { located = callback; } } }, value => locations.push(value), () => {}, { replace() {} }, toast);
  pending.get("C").resolve("C"); await flush();
  located({ coords: { latitude: 1, longitude: 2 } }); assert.deepEqual(locations.at(-1), { lat: 1, lng: 2 });
  assert.ok(!locations.includes("C"), "manual location invalidates pending geocode");
  cleanup(); cleanup = effect("D"); cleanup(); pending.get("D").reject(new Error("stale")); await flush(); assert.deepEqual(errors, [], "obsolete failures stay silent");
  console.log("PASS map address decoding, reversed responses, manual location override and stale errors");
})().catch(error => { console.error(error); process.exitCode = 1; });
