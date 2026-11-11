const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");

// Execute the production component/effects; replace only React scheduling, theme,
// DOM host and the Google boundary. No API calls, browser or database required.
const source = fs.readFileSync(path.join(__dirname, "../components/MyComponents/PlaceAutocomplete.tsx"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function harness(importOverride, geocodeOverride = async () => ({ results: [] })) {
  const slots = [], widgets = [], callbacks = [];
  let cursor = 0, pending = [], theme = "light", mounted = true, lateStateUpdates = 0, tree;
  const host = { firstElementChild: null, replaceChildren(element) { this.firstElementChild = element; element.host = this; } };
  class Widget {
    constructor() { this.style = {}; this.listeners = new Map(); this.attributes = {}; this.query = ""; this.removeCalls = 0; this.listenerRemovals = 0; widgets.push(this); }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    removeEventListener(name, listener) { assert.equal(this.listeners.get(name), listener, "cleanup removes the registered handler"); this.listeners.delete(name); this.listenerRemovals++; }
    remove() { this.removeCalls++; if (this.host?.firstElementChild === this) this.host.firstElementChild = null; }
    select(place) { const handler = this.listeners.get("gmp-select"); return handler?.({ placePrediction: { toPlace: () => place } }); }
  }
  const hooks = {
    useRef(initial) { const index = cursor++; return slots[index] ?? (slots[index] = { current: initial }); },
    useState(initial) { const index = cursor++; if (!slots[index]) slots[index] = { value: initial }; return [slots[index].value, value => { if (!mounted) lateStateUpdates++; slots[index].value = typeof value === "function" ? value(slots[index].value) : value; }]; },
    useId() { const index = cursor++; return slots[index] ?? (slots[index] = `autocomplete-fixture-${index}`); },
    useEffect(effect, dependencies) { const index = cursor++, previous = slots[index]; if (!previous || dependencies.some((item, i) => !Object.is(item, previous.dependencies[i]))) { pending.push(() => { previous?.cleanup?.(); const cleanup = effect(); slots[index] = { dependencies, cleanup }; }); } },
  };
  const loaded = { exports: {} };
  const googleBoundary = { maps: { importLibrary: importOverride ?? (async () => ({ PlaceAutocompleteElement: Widget })), Geocoder: class { geocode(input) { return geocodeOverride(input); } } } };
  new Function("require", "module", "exports", "window", "google", compiled)(request => request === "react" ? hooks : request === "next-themes" ? { useTheme: () => ({ resolvedTheme: theme }) } : request === "./GoogleMapsLoader" ? { useGoogleMaps: () => ({ isLoaded: true, enabled: true }) } : require(request), loaded, loaded.exports, { google: googleBoundary }, googleBoundary);
  const props = { onPlaceSelect: place => callbacks.push(place) };
  function attach(node) { if (!React.isValidElement(node)) return; if (node.ref) node.ref.current = host; React.Children.forEach(node.props.children, attach); }
  function render() { cursor = 0; pending = []; tree = loaded.exports.PlaceAutocomplete(props); attach(tree); pending.forEach(effect => effect()); return tree; }
  function statuses(node = tree) { if (!React.isValidElement(node)) return []; return [...(["status", "alert"].includes(node.props.role) ? [node.props.children] : []), ...React.Children.toArray(node.props.children).flatMap(child => statuses(child))]; }
  function find(predicate, node = tree) { if (!React.isValidElement(node)) return null; if (predicate(node)) return node; for (const child of React.Children.toArray(node.props.children)) { const result = find(predicate, child); if (result) return result; } return null; }
  return { widgets, callbacks, host, render, statuses, find, get lateStateUpdates() { return lateStateUpdates; }, setTheme(value) { theme = value; render(); }, unmount() { mounted = false; slots.forEach(slot => slot?.cleanup?.()); } };
}
async function main() {
  const view = harness(); view.render(); await flush();
  assert.equal(view.widgets.length, 1);
  const widget = view.widgets[0];
  assert.equal(widget.style.colorScheme, "light", "light app overrides dark OS preferences");
  widget.query = "Praça da Sé";
  view.setTheme("dark"); await flush();
  assert.equal(view.widgets.length, 1, "theme does not recreate widget");
  assert.equal(view.host.firstElementChild, widget);
  assert.equal(widget.style.colorScheme, "dark");
  assert.equal(widget.query, "Praça da Sé", "typed query survives theme switch");
  const place = { formattedAddress: "Praça da Sé", location: { lat: () => -23.55, lng: () => -46.63 }, fetchFields: async () => {} };
  await widget.select(place);
  assert.deepEqual(view.callbacks, [{ address: "Praça da Sé", lat: -23.55, lng: -46.63 }]);
  await widget.select({ ...place, fetchFields: async () => { throw new Error("fixture fetch failure"); } });
  view.render();
  assert.equal(view.statuses().length, 1, "fetchFields rejection is visibly announced");
  assert.match(view.statuses()[0], /Não foi possível selecionar esse local/);
  assert.equal(view.callbacks.length, 1, "failed fields do not select a place");
  await widget.select(place); view.render();
  assert.equal(view.statuses().length, 0, "successful retry clears visible error");
  const olderFields = deferred();
  const olderSelection = widget.select({ ...place, formattedAddress: "Older selection", fetchFields: () => olderFields.promise });
  await widget.select({ ...place, formattedAddress: "Latest selection" });
  olderFields.resolve(); await olderSelection;
  assert.equal(view.callbacks.length, 3, "older fields response cannot overwrite the latest selection");
  assert.equal(view.callbacks.at(-1).address, "Latest selection");
  const fields = deferred();
  const inFlight = widget.select({ ...place, fetchFields: () => fields.promise });
  view.unmount(); fields.resolve(); await inFlight;
  assert.equal(view.callbacks.length, 3, "no selection callback after unmount");
  assert.equal(widget.listenerRemovals, 1);
  assert.equal(widget.listeners.size, 0);
  assert.equal(widget.removeCalls, 1);
  assert.equal(view.lateStateUpdates, 0);
  console.log("PASS place autocomplete: theme changes preserve widget/query; fields errors, retry and unmount cleanup.");

  const failedImport = harness(async () => { throw new Error("fixture import failure"); }, async input => {
    assert.equal(input.address, "Rua da Praça, 10, São Paulo");
    assert.equal(input.region, "br");
    return { results: [{ formatted_address: "Rua da Praça, 10, São Paulo", geometry: { location: { lat: () => -23.55, lng: () => -46.63 } } }] };
  });
  failedImport.render(); await flush(); failedImport.render();
  assert.equal(failedImport.statuses().length, 1, "import rejection renders feedback");
  assert.match(failedImport.statuses()[0], /indisponível/);
  assert.equal(failedImport.callbacks.length, 0);
  failedImport.find(node => node.type === "input").props.onChange({ target: { value: "Rua da Praça, 10, São Paulo" } }); failedImport.render();
  const locate = failedImport.find(node => node.type === "button" && node.props.children === "Localizar endereço");
  assert.equal(locate.props.disabled, false);
  locate.props.onClick(); await flush(); failedImport.render();
  assert.deepEqual(failedImport.callbacks, [{ address: "Rua da Praça, 10, São Paulo", lat: -23.55, lng: -46.63 }], "manual address fallback remains usable after Places import fails");
  assert.match(failedImport.statuses()[0], /Endereço selecionado/);
  assert.ok(failedImport.find(node => node.type === "input"), "manual field remains available for another address after success");
  failedImport.unmount();

  const library = deferred(), lateImport = harness(() => library.promise);
  lateImport.render(); lateImport.unmount(); library.reject(new Error("fixture late rejection")); await flush();
  assert.equal(lateImport.lateStateUpdates, 0, "late import rejection does not update unmounted state");
  assert.equal(lateImport.widgets.length, 0);
  assert.equal(lateImport.callbacks.length, 0);
  const lateLibrary = deferred(), lateSuccess = harness(() => lateLibrary.promise);
  let constructedAfterUnmount = 0;
  lateSuccess.render(); lateSuccess.unmount();
  lateLibrary.resolve({ PlaceAutocompleteElement: class { constructor() { constructedAfterUnmount++; } } });
  await flush();
  assert.equal(constructedAfterUnmount, 0, "resolved import never constructs widget after unmount");
  assert.equal(lateSuccess.lateStateUpdates, 0);
  console.log("PASS place autocomplete: import failures are visible; late import success/rejection are ignored after unmount.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
