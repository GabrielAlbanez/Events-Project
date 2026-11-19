// Offline checks for package F (descoberta e desempenho): no database, no HTTP server, no Google APIs.
// Runs the real TypeScript sources (transpiled in memory) against mocked Prisma/Next dependencies.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
function load(file, dependencies = {}) {
  const module = { exports: {} };
  const output = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", output)(name => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    if (name.startsWith("@/")) throw new Error("Unmocked project import in " + file + ": " + name);
    return require(name);
  }, module, module.exports);
  return module.exports;
}
/** Extracts exported pure functions from a client component without React/Google dependencies. */
function extractFunctions(file, names) {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const pieces = [];
  source.statements.forEach(node => { if (ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text)) pieces.push(node.getText(source)); });
  assert.equal(pieces.length, names.length, "functions found in " + file);
  const output = ts.transpileModule(pieces.join("\n") + "\nmodule.exports = { " + names.join(", ") + " };", { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function("module", "exports", "URLSearchParams", output)(module, module.exports, URLSearchParams);
  return module.exports;
}
const jsx = (type, props) => ({ type, props });
const flatText = node => node == null || typeof node === "boolean" ? "" : typeof node !== "object" ? String(node) : Array.isArray(node) ? node.map(flatText).join("") : flatText(node.props?.children);
function findAll(node, predicate, found = []) {
  if (!node || typeof node !== "object") return found;
  if (Array.isArray(node)) { node.forEach(child => findAll(child, predicate, found)); return found; }
  if (predicate(node)) found.push(node);
  findAll(node.props?.children, predicate, found);
  return found;
}

(async () => {
  // 1. Artwork URL normalization (pure).
  const images = load("lib/eventImageUrl.ts");
  const n = images.normalizeEventImageUrl;
  assert.equal(n("  /uploads/a.jpg "), "/uploads/a.jpg");
  assert.equal(n("//cdn.example.com/x.png"), "https://cdn.example.com/x.png");
  assert.equal(n("http://localhost:3000/uploads/123e4567-e89b-12d3-a456-426614174000.jpg"), "/uploads/123e4567-e89b-12d3-a456-426614174000.jpg");
  assert.equal(n("https://images.example.com/a.jpg?w=1"), "https://images.example.com/a.jpg?w=1");
  for (const bad of ["javascript:alert(1)", "data:image/png;base64,AAA", "https://user:pass@example.com/a.jpg", "C:\\fotos\\a.jpg", "", null, undefined, "not a url"]) assert.equal(n(bad), "", String(bad));
  assert.deepEqual(images.normalizeEventImages({ banner: " /b.jpg", carrossel: ["javascript:x", "//c.example.com/1.jpg"] }), { banner: "/b.jpg", carrossel: ["https://c.example.com/1.jpg"] });

  // 2. Catalog queries: unchanged default contract, opt-in lean pagination.
  const calls = [];
  let rows = [];
  const prisma = { events: { findMany: async query => { calls.push(query); return typeof rows === "function" ? rows(query) : rows; }, findFirst: async query => { calls.push(query); return rows[0] ?? null; } } };
  const queries = load("lib/eventQueries.ts", { react: { cache: fn => fn }, "@/lib/prisma": { __esModule: true, default: prisma }, "@/lib/eventImageUrl": images, "@/types": {} });
  const historicFields = ["id", "nome", "banner", "carrossel", "descricao", "organizerName", "dataInicio", "dataFim", "linkParaCompra", "endereco", "userId", "validate", "status", "category", "priceCents", "isFree", "lat", "lng", "startTime", "endTime", "timezone", "capacity", "ageRating", "accessibilityInfo", "participationInfo", "validatedAt", "aiImport", "user", "validator"];
  assert.deepEqual(Object.keys(queries.publicEventSelect).sort(), [...historicFields].sort(), "default /api/AllEvents fields kept for existing consumers");
  for (const nested of ["user", "validator"]) assert.deepEqual(Object.keys(queries.publicEventSelect[nested].select).sort(), ["id", "image", "name"], nested + " exposes only public fields");
  const card = Object.keys(queries.publicEventCardSelect);
  for (const heavy of ["descricao", "carrossel", "accessibilityInfo", "participationInfo", "validator", "user", "aiImport"]) assert.ok(!card.includes(heavy), "card view omits " + heavy);
  for (const needed of ["id", "nome", "banner", "dataInicio", "dataFim", "endereco", "lat", "lng", "category", "isFree", "priceCents", "status", "validate"]) assert.ok(card.includes(needed), "card view keeps " + needed);
  rows = [{ id: "a", banner: "//cdn.example.com/a.jpg", carrossel: [" /x.jpg "], validate: null }];
  const catalog = await queries.listPublicCatalog();
  assert.equal(calls.length, 1, "one query for the default catalog");
  assert.equal(calls[0].where.status, "PUBLISHED"); assert.equal(calls[0].take, undefined, "default catalog is not truncated");
  assert.deepEqual(calls[0].orderBy, [{ dataInicio: "asc" }, { id: "asc" }]);
  assert.deepEqual(catalog, [{ id: "a", banner: "https://cdn.example.com/a.jpg", carrossel: ["/x.jpg"], validate: false }]);
  calls.length = 0; rows = query => Array.from({ length: query.take }, (_, index) => ({ id: "e" + index, banner: "", validate: true }));
  const page = await queries.listPublicCatalogPage({ limit: 2, cursor: "e9", from: "2026-11-19", view: "card" });
  assert.equal(calls[0].take, 3, "limit + 1 detects the next page"); assert.deepEqual(calls[0].cursor, { id: "e9" }); assert.equal(calls[0].skip, 1);
  assert.deepEqual(calls[0].where, { status: "PUBLISHED", dataFim: { gte: "2026-11-19" } }); assert.equal(calls[0].select, queries.publicEventCardSelect);
  assert.deepEqual(page.events.map(event => event.id), ["e0", "e1"]); assert.equal(page.nextCursor, "e1");
  rows = [{ id: "last", banner: "", validate: true }];
  assert.equal((await queries.listPublicCatalogPage({ limit: 5, view: "full" })).nextCursor, null);

  // 3. /api/AllEvents: no params => historical array; pagination only when asked; no internal errors leaked.
  const json = (body, init = {}) => ({ body, status: init.status ?? 200 });
  let catalogImpl = async () => [{ id: "x" }], pageImpl = async options => ({ events: [], nextCursor: null, options });
  const route = load("app/api/AllEvents/route.ts", { "next/server": { NextResponse: { json } }, "@/lib/eventQueries": { listPublicCatalog: () => catalogImpl(), listPublicCatalogPage: options => pageImpl(options) } });
  const get = query => route.GET(new Request("http://local.test/api/AllEvents" + query));
  assert.deepEqual((await get("")).body, [{ id: "x" }]);
  assert.deepEqual((await get("?utm_source=x")).body, [{ id: "x" }], "unrelated params keep the array contract");
  assert.deepEqual((await get("?limit=20&view=card&from=2026-11-19")).body.options, { limit: 20, view: "card", from: "2026-11-19" });
  assert.deepEqual((await get("?cursor=abc")).body.options, { limit: 100, view: "full", cursor: "abc" });
  for (const bad of ["?limit=0", "?limit=201", "?limit=abc", "?cursor=../x", "?from=19-11-2026", "?view=admin"]) assert.equal((await get(bad)).status, 400, bad);
  catalogImpl = async () => { throw new Error("connection string postgres://secret"); };
  const failed = await get("");
  assert.equal(failed.status, 503); assert.ok(!JSON.stringify(failed.body).includes("secret"));

  // 4. Recommendation ranking: registrations, co-saves, exclusions, determinism, explainable reasons.
  const time = load("lib/eventTime.ts");
  const rank = load("lib/eventRecommendations.ts", { "@/lib/eventTime": time });
  const event = (id, extra = {}) => ({ id, nome: "Evento " + id, descricao: "", endereco: "Campinas", dataInicio: "2099-03-01", dataFim: "2099-03-01", startTime: "19:00", endTime: "22:00", timezone: "America/Sao_Paulo", status: "PUBLISHED", category: "Música", lat: -22.9, lng: -47.06, userId: "org", ...extra });
  const candidates = [
    event("theater", { category: "Teatro", lat: null, lng: null }),
    event("music", { lat: null, lng: null }),
    event("cosaved", { category: "Outros", lat: null, lng: null }),
    event("mine", { userId: "viewer" }),
    event("saved"),
    event("past", { dataInicio: "2020-01-01", dataFim: "2020-01-01" }),
    event("draft", { status: "PENDING" }),
    event("near", { category: "Outros", lat: -22.91, lng: -47.07 }),
  ];
  const prefs = [
    { id: "reg", nome: "Festival de Jazz", category: "Teatro", lat: null, lng: null, source: "registration" },
    { id: "fav", nome: "Show de Rock", category: "Música", lat: -22.9, lng: -47.06, source: "favorite" },
  ];
  const coSaved = new Map([["cosaved", { count: 3, anchor: { id: "fav", nome: "Show de Rock" } }], ["music", { count: 1 }]]);
  const options = { ownerId: "viewer", excludeIds: ["saved"], coSaved };
  const ranked = rank.rankRecommendedEvents(candidates, prefs, [], new Date("2026-11-19T12:00:00Z"), options);
  const ids = ranked.map(item => item.event.id);
  for (const excluded of ["mine", "saved", "past", "draft"]) assert.ok(!ids.includes(excluded), excluded + " excluded");
  assert.deepEqual(ids.slice(0, 3), ["cosaved", "theater", "music"], "co-saves first, then a registration-backed category above a favorite-backed one");
  assert.match(ranked[0].reason, /Quem salvou “Show de Rock” também salvou/);
  assert.match(ranked.find(item => item.event.id === "theater").reason, /“Festival de Jazz”, em que você se inscreveu/);
  assert.match(ranked.find(item => item.event.id === "music").reason, /Porque você salvou “Show de Rock”/);
  assert.match(ranked.find(item => item.event.id === "near").reason, /Perto de “Show de Rock”/);
  const shuffled = rank.rankRecommendedEvents([...candidates].reverse(), [...prefs].reverse(), [], new Date("2026-11-19T12:00:00Z"), options);
  assert.deepEqual(shuffled.map(item => item.event.id).slice(0, 3), ids.slice(0, 3), "deterministic regardless of input order");
  const lone = rank.rankRecommendedEvents([event("solo", { category: "Outros", lat: null, lng: null })], [], [], new Date("2026-11-19T12:00:00Z"), { coSaved: new Map([["solo", { count: 1, anchor: { id: "a", nome: "A" } }]]) });
  assert.equal(lone[0].reason, "Próximo evento publicado", "a single co-saver is never surfaced");
  const legacy = rank.rankRecommendedEvents([event("first"), event("followed", { userId: "followed", category: "Teatro" })], [{ category: "Música", lat: null, lng: null }], ["followed"]);
  assert.deepEqual(legacy.map(item => item.event.id), ["followed", "first"], "historic 3-argument call keeps working (home fallback)");
  const similar = rank.rankSimilarEvents(event("base"), [event("base"), event("same-cat", { lat: null, lng: null }), event("unrelated", { category: "Teatro", userId: "other", lat: 10, lng: 10 }), event("cos", { category: "Teatro", userId: "other", lat: null, lng: null })], new Map([["cos", 2]]), new Date("2026-11-19T12:00:00Z"));
  assert.deepEqual(similar.map(item => item.event.id), ["same-cat", "cos"], "only linked events (category + organizer first), never the base itself or generic filler");
  assert.equal(similar[1].reason, "Quem salvou este evento também salvou");

  // 5. Recommendation service: bounded queries, viewer exclusions, aggregated co-saves only.
  const db = { calls: [] };
  const record = (model, result) => async query => { db.calls.push({ model, query }); return typeof result === "function" ? result(query) : result; };
  Object.assign(db, {
    favorite: { findMany: record("favorite", query => {
      if (query.where.userId === "viewer") return [{ event: { id: "fav", nome: "Show de Rock", category: "Música", lat: null, lng: null } }];
      if (query.where.eventId?.in) return [{ userId: "u1", eventId: "fav" }, { userId: "u2", eventId: "fav" }];
      if (query.where.userId?.in) return [{ userId: "u1", eventId: "cosaved" }, { userId: "u2", eventId: "cosaved" }];
      if (query.where.eventId === "base") return [{ userId: "u1" }, { userId: "u2" }];
      return [];
    }) },
    follow: { findMany: record("follow", []) },
    eventRegistration: { findMany: record("eventRegistration", [{ status: "CONFIRMED", event: { id: "reg", nome: "Festival", category: "Teatro", lat: null, lng: null } }, { status: "WAITLISTED", event: { id: "wait", nome: "Espera", category: "Dança", lat: null, lng: null } }]) },
    events: {
      findMany: record("events", [event("cosaved", { category: "Outros", lat: null, lng: null }), event("theater", { category: "Teatro", lat: null, lng: null })]),
      findFirst: record("events.findFirst", query => query.where.id === "base" ? { id: "base", category: "Música", lat: -22.9, lng: -47.06, userId: "org" } : null),
    },
  });
  const service = load("lib/services/recommendations.ts", { "@/lib/prisma": { __esModule: true, default: db }, "@/lib/eventQueries": { publicEventSelect: { id: true }, toPublicEvent: value => ({ ...value, validate: value.validate ?? false }) }, "@/lib/eventRecommendations": rank, "@/lib/services/authContext": {} });
  assert.deepEqual(await service.getRecommendedEvents(async () => null), []); assert.equal(db.calls.length, 0, "anonymous viewers trigger no query");
  const recommended = await service.getRecommendedEvents(async () => ({ id: "viewer", role: "BASIC" }));
  const own = db.calls.filter(call => call.model === "favorite" && call.query.where.userId === "viewer")[0];
  assert.equal(own.query.take, 100);
  const registrationsQuery = db.calls.find(call => call.model === "eventRegistration").query;
  assert.equal(registrationsQuery.where.userId, "viewer"); assert.deepEqual(registrationsQuery.where.status.in, ["CONFIRMED", "WAITLISTED", "CHECKED_IN"]);
  const coPairsQuery = db.calls.find(call => call.model === "favorite" && call.query.where.userId?.in).query;
  assert.ok(coPairsQuery.where.eventId.notIn.includes("fav") && coPairsQuery.where.eventId.notIn.includes("reg") && coPairsQuery.where.eventId.notIn.includes("wait"), "already saved/registered (incl. waitlist) are excluded");
  for (const call of db.calls.filter(item => item.model === "favorite")) { assert.ok(call.query.take > 0 && call.query.take <= 2000, "favorite queries are bounded"); assert.ok(!call.query.select?.user, "no identities selected"); }
  for (const call of db.calls.filter(item => item.model === "events")) {
    const where = call.query.where.AND ? call.query.where.AND[0] : call.query.where;
    assert.equal(where.status, "PUBLISHED"); assert.equal(where.favorites.none.userId, "viewer"); assert.equal(where.registrations.none.userId, "viewer");
    assert.deepEqual(where.OR, [{ userId: null }, { userId: { not: "viewer" } }], "own events excluded"); assert.equal(call.query.take, 80);
  }
  assert.equal(recommended[0].event.id, "cosaved"); assert.match(recommended[0].reason, /Quem salvou “Show de Rock”/);
  assert.ok(!JSON.stringify(recommended).includes("u1"), "co-saver identities never leave the service");
  db.calls.length = 0;
  assert.deepEqual(await service.getSimilarEvents("../etc", 4), []); assert.deepEqual(await service.getSimilarEvents("", 4), []); assert.equal(db.calls.length, 0, "invalid ids never reach the database");
  assert.deepEqual(await service.getSimilarEvents("missing", 4), []);
  db.calls.length = 0;
  const similarItems = await service.getSimilarEvents("base", 50);
  const candidatesQuery = db.calls.filter(call => call.model === "events").at(-1).query;
  assert.equal(candidatesQuery.take, 60); assert.equal(candidatesQuery.where.AND[0].status, "PUBLISHED"); assert.deepEqual(candidatesQuery.where.AND[0].id, { not: "base" });
  assert.ok(similarItems.length <= 12, "limit clamped");
  assert.ok(similarItems.every(item => item.event.id !== "base"));

  // 6. Map: stored coordinates only, query string preserved, no duplicated toastify CSS.
  const map = read("components/MyComponents/Map.tsx");
  const helpers = extractFunctions("components/MyComponents/Map.tsx", ["hasMapCoordinates", "withoutAddressParam"]);
  assert.equal(helpers.hasMapCoordinates({ lat: -23.5, lng: -46.6 }), true);
  for (const bad of [{ lat: null, lng: -46 }, { lat: undefined, lng: undefined }, { lat: Number.NaN, lng: 1 }, { lat: 91, lng: 0 }, { lat: 0, lng: 181 }]) assert.equal(helpers.hasMapCoordinates(bad), false, JSON.stringify(bad));
  assert.equal(helpers.withoutAddressParam("?q=rock&endereco=Rua%20A&periodo=hoje", "/", "#home-discovery"), "/?q=rock&periodo=hoje#home-discovery");
  assert.equal(helpers.withoutAddressParam("?endereco=x", "/", ""), "/");
  assert.equal(helpers.withoutAddressParam("?q=rock", "/", ""), null, "nothing to change keeps history untouched");
  assert.ok(!map.includes('router.replace("/")'), "filters are no longer wiped from the URL");
  assert.ok(!/ReactToastify\.css/.test(map), "toastify CSS comes only from the root layout");
  assert.equal((map.match(/convertAddressToCoordinates\(/g) || []).length, 1, "the geocoder only resolves the explicit ?endereco= search");
  assert.ok(!/geocodedEvents/.test(map), "no per-visit geocoding of events");
  assert.ok(/aria-label="Fechar evento"[^>]*h-11 w-11/.test(map), "44px close target");

  // 7. Home: server-provided initial events, no session-keyed remount, realtime effect preserved.
  const pageSource = read("app/page.tsx");
  assert.ok(!pageSource.includes('"use client"'), "app/page.tsx is a Server Component");
  assert.match(pageSource, /export const dynamic = "force-dynamic"/);
  const client = read("components/MyComponents/home/HomeDiscoveryClient.tsx");
  assert.ok(client.startsWith('"use client"'));
  assert.ok(!/key=\{session/.test(client), "presentation is not remounted when the session resolves");
  assert.match(client, /useState\(initialEvents === null\)/, "no skeleton when the server already rendered events");
  let catalogResult;
  const home = load("app/page.tsx", { "react/jsx-runtime": { jsx, jsxs: jsx }, "@/components/MyComponents/home/HomeDiscoveryClient": { __esModule: true, default: "HomeDiscoveryClient" }, "@/lib/eventQueries": { listPublicCatalog: () => catalogResult() }, "@/types": {} });
  catalogResult = async () => [{ id: "ok", validate: true, status: "PUBLISHED", validatedAt: new Date("2026-01-02T03:04:05Z") }, { id: "pending", validate: false, status: "PUBLISHED" }, { id: "gone", validate: true, status: "CANCELLED" }];
  const rendered = await home.default();
  assert.equal(rendered.type, "HomeDiscoveryClient");
  assert.deepEqual(rendered.props.initialEvents, [{ id: "ok", validate: true, status: "PUBLISHED", validatedAt: "2026-01-02T03:04:05.000Z" }], "same visibility rule and JSON shape as /api/AllEvents");
  catalogResult = async () => { throw new Error("database down"); };
  assert.equal((await home.default()).props.initialEvents, null, "database failure falls back to the client fetch");
  // Same assertions as test:realtime, executed against the effect's new home.
  const realtime = spawnSync(process.execPath, ["-e", `const fs=require("fs");const original=fs.readFileSync;fs.readFileSync=function(file,...rest){return original.call(this,file==="app/page.tsx"?"components/MyComponents/home/HomeDiscoveryClient.tsx":file,...rest);};require("./scripts/verify-home-realtime.cjs");`], { cwd: root, encoding: "utf8" });
  assert.equal(realtime.status, 0, "home realtime effect: " + realtime.stderr + realtime.stdout);
  assert.match(realtime.stdout, /PASS actual home effect/);

  // 8. Render purity and small logic fixes.
  const filters = read("components/MyComponents/PublicEventFilters.tsx");
  assert.ok(!/if \(currentValue\.current !== value\)[^\n]*generation\.current\+\+/.test(filters), "no counter increment during render");
  const table = load("components/MyComponents/TableEventsClient.tsx", { react: { useMemo: fn => fn(), useState: value => [typeof value === "function" ? value() : value, () => {}] }, "react/jsx-runtime": { jsx, jsxs: jsx }, "next/link": "Link", "lucide-react": {}, "@/types": {}, "@/lib/discoveryPeriod": { parseEventDate: () => null }, "@/components/animations/PresenceGrid": { PresenceGrid: "PresenceGrid" }, "@/components/MyComponents/EventDateBlock": { EventDateBlock: "EventDateBlock" } });
  assert.equal(table.localMonth(new Date(2026, 10, 30, 23, 30)), "2026-11", "last evening of the month stays in the month");
  assert.equal(table.localMonth(new Date(2027, 0, 1, 0, 5)), "2027-01");
  assert.match(read("components/MyComponents/TableEventsClient.tsx"), /const published = useMemo\(/);
  assert.match(read("components/MyComponents/EventRecommendations.tsx"), /\[savedKey,retry\]/, "recommendations refetch only when saved ids change");

  // 9. Bundle: home animations use LazyMotion + m with on-demand features.
  for (const file of ["components/MyComponents/home/LuxuryHomePresentation.tsx", "components/MyComponents/home/HeroDiscovery.tsx"]) {
    const source = read(file);
    assert.ok(!/import \{[^}]*\bmotion\b[^}]*\} from "framer-motion"/.test(source), file + " does not import the full motion component");
    assert.ok(!/<motion\./.test(source), file + " renders m.* components");
  }
  assert.match(read("components/MyComponents/home/LuxuryHomePresentation.tsx"), /<LazyMotion features=\{loadAnimationFeatures\}>/);

  // 10. SimilarEvents: renders nothing without items, explicit reason and safe links otherwise.
  const similarComponent = load("components/MyComponents/SimilarEvents.tsx", { "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" }, "next/link": "Link", "lucide-react": { CalendarDays: "CalendarDays", MapPin: "MapPin", Sparkles: "Sparkles" }, "@/lib/eventRecommendations": {}, "@/lib/eventTime": time });
  assert.equal(similarComponent.SimilarEvents({ items: [] }), null);
  const tree = similarComponent.SimilarEvents({ items: [{ event: event("a b/c", { isFree: true }), reason: "Do mesmo organizador" }] });
  const links = findAll(tree, node => node.type === "Link");
  assert.equal(links.length, 1); assert.equal(links[0].props.href, "/eventos/a%20b%2Fc");
  assert.match(flatText(tree), /Do mesmo organizador/); assert.match(flatText(tree), /Entrada gratuita/);

  console.log("PASS discovery/performance: image normalization, lean opt-in catalog pagination with unchanged default contract, deterministic explainable recommendations (registrations, co-saves, exclusions), similar events, map without client geocoding or URL wipe, server-rendered home data with fallback, render purity and LazyMotion home.");
})().catch(error => { console.error(error); process.exitCode = 1; });
