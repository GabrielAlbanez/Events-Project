const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
function load(file, dependencies) {
  const module = { exports: {} };
  new Function("require", "module", "exports", ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText)(name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name), module, module.exports);
  return module.exports;
}
(async () => {
  const calls = [];
  const prisma = { user: {
    findMany: async args => { calls.push(args); return [{ id: "u1", name: "Name" }]; },
    count: async args => { calls.push({ count: args }); return 56; },
  }, events: { findMany: async args => { calls.push(args); return Array.from({ length: 11 }, (_, id) => ({ id })); } } };
  const admin = load("lib/services/adminPagination.ts", { "@/lib/prisma": { __esModule: true, default: prisma }, "@/lib/eventQueries": { publicEventSelect: { id: true } } });
  assert.equal((await admin.getAdminUsersPage(async () => null)).status, "error"); assert.equal(calls.length, 0);
  const result = await admin.getAdminUsersPage(async () => "admin", { page: 2, q: " Name ", role: "BASIC" });
  assert.equal(calls[0].take, 25); assert.equal(calls[0].skip, 25); assert.equal(calls[0].where.role, "BASIC");
  assert.equal(calls[0].where.OR[0].name.contains, "Name"); assert.equal(calls[0].select.password, undefined); assert.equal(calls[0].select.Events, undefined);
  assert.deepEqual(result.data[0].Events, []); assert.equal(result.pagination.totalPages, 3); assert.equal(result.counts.admins, 56);
  calls.length = 0;
  await admin.getAdminUsersPage(async () => "admin", { page: Number.MAX_SAFE_INTEGER, role: "INVALID", q: "x".repeat(1000) });
  assert.equal(calls[0].skip, 99999 * 25); assert.equal(calls[0].where.role, undefined); assert.equal(calls[0].where.OR[0].name.contains.length, 100);
  calls.length = 0;
  assert.equal(await admin.getAdminUserEvents(async () => null, "u1"), null); assert.equal(calls.length, 0);
  const events = await admin.getAdminUserEvents(async () => "admin", "u1", 2);
  assert.equal(calls[0].where.userId, "u1"); assert.equal(calls[0].take, 11); assert.equal(calls[0].skip, 10); assert.equal(events.events.length, 10); assert.equal(events.hasMore, true);

  let query;
  const date = new Date("2026-10-03T12:00:00.000Z");
  const rows = Array.from({ length: 51 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(1000 - index).padStart(12,"0")}`, title: "Title", message: "Message", href: "/", readAt: null, createdAt: date }));
  const notices = load("lib/services/notifications.ts", { "@/lib/prisma": { __esModule: true, default: { notification: { findMany: async args => { query = args; return rows; } } } } });
  assert.deepEqual(await notices.getNotificationPage(async () => null), { items: [], nextBefore: null }); assert.equal(query, undefined);
  const page = await notices.getNotificationPage(async () => ({ id: "owner" }), { unread: true });
  assert.equal(query.where.userId, "owner"); assert.equal(query.where.readAt, null); assert.equal(query.take, 51); assert.equal(page.items.length, 50);
  assert.deepEqual(query.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
  await notices.getNotificationPage(async () => ({ id: "other" }), { before: page.nextBefore });
  assert.equal(query.where.userId, "other"); assert.equal(query.where.OR[1].id.lt, rows[49].id); assert.equal(query.where.OR[1].createdAt.toISOString(), date.toISOString());
  await assert.rejects(notices.getNotificationPage(async () => ({ id: "owner" }), { before: "invalid" }));
  await assert.rejects(notices.getNotificationPage(async () => ({ id: "owner" }), { before: "x".repeat(401) }));

  const period = load("lib/discoveryPeriod.ts", {});
  const sunday = new Date(2026, 9, 4, 12);
  assert.equal(period.matchesPeriod({ dataInicio: "2026-10-04" }, "fim-de-semana", sunday), true);
  assert.equal(period.matchesPeriod({ dataInicio: "2026-10-10" }, "fim-de-semana", sunday), false);
  assert.equal(period.matchesPeriod({ dataInicio: "2026-10-02", dataFim: "2026-10-05" }, "fim-de-semana", sunday), true);
  assert.equal(period.matchesPeriod({ dataInicio: "2026-10-03", dataFim: "2026-10-05" }, "hoje", sunday), true);
  assert.equal(period.matchesPeriod({ dataInicio: "2026-09-30", dataFim: "2026-10-01" }, "mes", sunday), true);
  assert.equal(period.matchesPeriod({ dataInicio: "invalid" }, "hoje", sunday), false);

  const state = [], refs = []; let stateIndex = 0, refIndex = 0, tree;
  const changes = [], locations = [];
  const jsx = (type, props) => ({ type, props });
  const filters = load("components/MyComponents/PublicEventFilters.tsx", {
    react: { useEffect: () => {}, useRef: value => refs[refIndex++] ??= { current: value }, useState: value => { const index = stateIndex++; state[index] ??= value; return [state[index], next => { state[index] = next; }]; } },
    "react/jsx-runtime": { jsx, jsxs: jsx }, "./GoogleMapsLoader": { useGoogleMaps: () => ({ isLoaded: true }) },
  });
  const props = { events: [], value: { ...filters.emptyDiscoveryFilter }, onChange: value => changes.push(value) };
  function render() { stateIndex = 0; refIndex = 0; tree = filters.default(props); }
  function find(node, predicate) { if (!node || typeof node !== "object") return null; if (predicate(node)) return node; const children = node.props?.children; for (const child of Array.isArray(children) ? children : [children]) { const found = find(child, predicate); if (found) return found; } return null; }
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { geolocation: { getCurrentPosition: success => locations.push(success) } } });
  render();
  const radius = find(tree, node => node.type === "select" && node.props.children?.[0]?.props?.children === "Qualquer distância");
  radius.props.onChange({ target: { value: "5" } });
  find(tree, node => node.type === "button" && node.props.children === "Limpar filtros").props.onClick();
  const countAfterClear = changes.length;
  locations[0]({ coords: { latitude: 1, longitude: 2 } });
  assert.equal(changes.length, countAfterClear); assert.deepEqual(changes.at(-1), filters.emptyDiscoveryFilter);
  render(); radius.props.onChange({ target: { value: "10" } });
  props.value = { ...filters.emptyDiscoveryFilter, category: "Music" }; render();
  locations[1]({ coords: { latitude: 1, longitude: 2 } }); assert.equal(changes.length, countAfterClear);
  let resolveMatrix;
  const matrixPending = new Promise(resolve => { resolveMatrix = resolve; });
  globalThis.window = { google: { maps: {} } };
  globalThis.google = { maps: { importLibrary: async () => ({ RouteMatrix: { computeRouteMatrix: () => matrixPending } }) } };
  props.events = [{ id: "e1", lat: 1, lng: 2, category: "Music", isFree: true }]; render();
  find(tree, node => node.type === "select" && node.props.id === "travel-time-filter").props.onChange({ target: { value: "15" } }); render();
  find(tree, node => node.type === "button" && node.props.children === "Aplicar tempo de viagem").props.onClick();
  locations[2]({ coords: { latitude: 1, longitude: 2 } });
  await new Promise(resolve => setImmediate(resolve));
  find(tree, node => node.type === "select" && node.props.id === "travel-time-filter").props.onChange({ target: { value: "30" } }); render();
  const countBeforeMatrix = changes.length;
  resolveMatrix({ matrix: { rows: [{ items: [{ condition: "ROUTE_EXISTS", durationMillis: 60000 }] }] } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(changes.length, countBeforeMatrix, "A previous travel choice must not replace the current one");
  let rejectMatrix;
  const failedMatrix = new Promise((_, reject) => { rejectMatrix = reject; });
  globalThis.google.maps.importLibrary = async () => ({ RouteMatrix: { computeRouteMatrix: () => failedMatrix } });
  find(tree, node => node.type === "button" && node.props.children === "Aplicar tempo de viagem").props.onClick();
  locations[3]({ coords: { latitude: 1, longitude: 2 } });
  await new Promise(resolve => setImmediate(resolve));
  find(tree, node => node.type === "button" && node.props.children === "Limpar filtros").props.onClick(); render();
  const afterSecondClear = changes.length;
  rejectMatrix(Error("network failed"));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(changes.length, afterSecondClear); assert.equal(state[3], ""); assert.equal(state[2], false);
  console.log("PASS: bounded authorized admin pagination, demand-loaded events, isolated stable notification cursors, Sunday and multi-day periods, late geolocation/matrix success/failure ignored after clear or newer filters");
})().catch(error => { console.error(error); process.exitCode = 1; });
