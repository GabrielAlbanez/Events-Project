const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Execute the actual callback without mounting Google Maps or calling external APIs.
const filename = path.join(__dirname, "../components/MyComponents/Map.tsx");
const source = ts.createSourceFile(filename, fs.readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let initializer;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "calculateRoute") initializer = node.initializer;
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(initializer, "Map route callback exists");
const code = ts.transpileModule(`const calculateRoute = ${initializer.getText(source)};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText + "\ncalculateRoute;";
const target = { lat: -22.9, lng: -47.05 };

function harness({ origin = null, geolocation, route, busy = false } = {}) {
  const state = { loading: [], errors: [], directions: [], destinations: [], origins: [], calls: [] };
  const context = {
    Error, String, Promise,
    userLocation: origin, isRouteTracing: busy, routeRequestRef: { current: 0 },
    useCallback: (callback) => callback,
    setDestination: (value) => state.destinations.push(value),
    setShowDirections: (value) => { state.panel = value; },
    setEventoAtivo: (value) => { state.drawer = value; },
    setRouteError: (value) => state.errors.push(value),
    setIsRouteTracing: (value) => state.loading.push(value),
    setUserLocation: (value) => state.origins.push(value),
    setDirections: (value) => state.directions.push(value),
    toast: { success() {}, error() {} },
    navigator: { geolocation },
    google: { maps: {
      TravelMode: { DRIVING: "DRIVING" },
      DirectionsService: class {
        async route(request) {
          state.calls.push(request);
          return route ? route(request) : { routes: [] };
        }
      },
    } },
  };
  return { state, context, run: vm.runInNewContext(code, context) };
}

(async () => {
  const success = harness({ origin: target });
  await success.run(target);
  assert.deepEqual(success.state.loading, [true, false]);
  assert.equal(success.state.directions.filter(Boolean).length, 1);
  assert.equal(success.state.directions[0], null, "A new request clears the old route");
  assert.equal(success.state.calls[0].origin, target);

  const denied = harness({ geolocation: { getCurrentPosition(_success, failure) { failure({ code: 1 }); } } });
  await denied.run(target);
  assert.match(denied.state.errors.at(-1), /local de partida/);
  assert.equal(denied.state.panel, true);
  assert.equal(denied.state.destinations[0], target);
  assert.equal(denied.state.calls.length, 0);
  assert.deepEqual(denied.state.loading, [true, false]);

  const unavailable = harness();
  await unavailable.run(target);
  assert.match(unavailable.state.errors.at(-1), /local de partida/);

  const located = harness({ geolocation: { getCurrentPosition(done) { done({ coords: { latitude: -23, longitude: -46 } }); } } });
  await located.run(target);
  assert.equal(located.state.calls[0].origin.lat, -23);
  assert.equal(located.state.origins.length, 1);

  for (const [status, expected] of [["REQUEST_DENIED", /não está autorizado/], ["ZERO_RESULTS", /Não foi encontrada/], ["UNKNOWN_ERROR", /Tente novamente/]]) {
    const failed = harness({ origin: target, route: () => { throw new Error(status); } });
    await failed.run(target);
    assert.match(failed.state.errors.at(-1), expected);
    assert.deepEqual(failed.state.loading, [true, false]);
    assert.equal(failed.state.directions.filter(Boolean).length, 0);
  }

  let complete;
  const cancelled = harness({ origin: target, route: () => new Promise((resolve) => { complete = resolve; }) });
  const pending = cancelled.run(target);
  cancelled.context.routeRequestRef.current += 1;
  complete({ routes: [] });
  await pending;
  assert.equal(cancelled.state.directions.filter(Boolean).length, 0);
  assert.equal(cancelled.state.loading.length, 1, "Cancelled callbacks do not update an unmounted map");

  const busy = harness({ origin: target, busy: true });
  await busy.run(target);
  assert.equal(busy.state.calls.length, 0);
  console.log("Map route: origin, denial, API errors, loading, cancellation and busy guard passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
