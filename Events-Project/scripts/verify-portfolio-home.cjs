const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

// Render the production components without a Next server, session, network or DOM.
// Only framework/browser boundaries and the data hook are replaced. HeroCarousel,
// HeroSearch, EventCard and the presentation's allocation logic execute unchanged.
const root = path.resolve(__dirname, "..");
const cache = new Map();
let currentEvents = [];
let heroIds = [];
let galleryIds = [];
let galleryCount;
const Region = React.createContext(null);
const motionCache = new Map();
const motion = new Proxy({}, { get(_target, tag) {
  if (!motionCache.has(tag)) motionCache.set(tag, React.forwardRef(function MotionBoundary(props, ref) {
    const { initial, animate, variants, whileInView, viewport, whileHover, whileTap, transition, children, ...dom } = props;
    if (props.className === "heroShowcase") {
      // Observe the REAL carousel element passed by the production parent. The
      // real carousel still renders below (including its first event and dots).
      assert.ok(Array.isArray(children.props.events), "hero passes events to its real carousel");
      heroIds = children.props.events.map(event => event.id);
    }
    if (props.className === "eventGrid") galleryCount = props["data-count"];
    const region = props.className === "eventGrid" ? "gallery" : props.className === "heroShowcase" ? "hero" : null;
    const content = React.createElement(tag, { ...dom, ref }, children);
    return region ? React.createElement(Region.Provider, { value: region }, content) : content;
  }));
  return motionCache.get(tag);
} });
const stubs = {
  "next-auth/react": { useSession: () => ({ status: "unauthenticated", data: null }) },
  "framer-motion": { motion, useReducedMotion: () => true },
  "next/link": { __esModule: true, default: function Link({ href, children, ...props }) {
    const region = React.useContext(Region);
    if (region === "gallery" && href.startsWith("/eventos/")) galleryIds.push(decodeURIComponent(href.slice("/eventos/".length)));
    return React.createElement("a", { ...props, href }, children);
  } },
  "next/image": { __esModule: true, default: function Image({ fill, priority, unoptimized, ...props }) { return React.createElement("img", props); } },
};
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  if (filename.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_target, name) => name }) };
  const loaded = { exports: {} };
  cache.set(filename, loaded);
  const localRequire = Module.createRequire(filename);
  function requireSource(request) {
    if (stubs[request]) return stubs[request];
    if (request === "./useLoggedHomeData") return { useLoggedHomeData: () => ({ suggestions: currentEvents.map(event => ({ event, reason: "Próximo evento publicado" })), saved: [], agendaLoading: false, agendaError: false, recommendationsError: false }) };
    if (!request.startsWith(".") && !request.startsWith("@/")) return localRequire(request);
    const base = request.startsWith("@/") ? path.join(root, request.slice(2)) : path.resolve(path.dirname(filename), request);
    const resolved = [base, base + ".tsx", base + ".ts", path.join(base, "index.ts")].find(file => fs.existsSync(file) && fs.statSync(file).isFile());
    if (!resolved) throw new Error(`Cannot resolve ${request} from ${filename}`);
    return load(resolved);
  }
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", compiled)(requireSource, loaded, loaded.exports);
  return loaded.exports;
}
const { LuxuryHomePresentation } = load(path.join(root, "components/MyComponents/home/LuxuryHomePresentation.tsx"));
for (const [count, expectedHero, expectedGallery] of [[0, 0, 0], [1, 1, 0], [2, 1, 1], [6, 3, 3]]) {
  currentEvents = Array.from({ length: count }, (_, index) => ({ id: `portfolio-${index}`, nome: `Evento ${index}`, banner: "", carrossel: [], descricao: "Evento fictício exclusivo do teste", dataInicio: "2099-06-01", dataFim: "2099-06-01", startTime: "18:00", endTime: "20:00", timezone: "America/Sao_Paulo", status: "PUBLISHED", validate: true, category: "Música", endereco: "Local de teste", user: null, validator: null, linkParaCompra: "", isFree: true }));
  heroIds = []; galleryIds = []; galleryCount = undefined;
  const html = renderToStaticMarkup(React.createElement(LuxuryHomePresentation, { events: currentEvents, loading: false, loadError: false, scrollContainer: { current: null }, period: "todos", periodLinks: [], onPeriodChange() {}, onQuickSearch() {}, searchValue: "", categoryValue: "" }));
  assert.equal(heroIds.length, expectedHero, `${count}: hero allocation`);
  assert.equal(galleryIds.length, expectedGallery, `${count}: real gallery links`);
  assert.equal(galleryCount, expectedGallery, `${count}: gallery count`);
  assert.equal(new Set([...heroIds, ...galleryIds]).size, count, `${count}: no duplicates or lost events across hero/gallery`);
  assert.deepEqual([...heroIds, ...galleryIds].sort(), currentEvents.map(event => event.id).sort(), `${count}: every supplied ID represented`);
  assert.equal(html.includes('data-compact="true"'), count === 1, `${count}: compact single-event section`);
  if (count === 0) assert.match(html, /class="empty"/, "zero events renders the real empty state");
  else assert.doesNotMatch(html, /class="empty"/, `${count}: no incorrect empty state`);
  if (expectedHero > 0) assert.ok(html.includes(`/eventos/${heroIds[0]}`), "real carousel renders first hero link");
  // A carousel mounts only its active card. Remaining hero items must remain
  // reachable through the real per-event accessible navigation controls.
  if (expectedHero > 1) heroIds.forEach((id, index) => {
    const event = currentEvents.find(item => item.id === id);
    assert.ok(html.includes(`aria-label="Mostrar evento ${index + 1}: ${event.nome}"`), `${id}: carousel control exposes the event`);
  });
  console.log(`PASS portfolio home ${count} events: ${expectedHero} hero + ${expectedGallery} gallery; unique IDs and correct empty/compact state.`);
}
