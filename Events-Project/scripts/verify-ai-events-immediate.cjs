// Importação imediata e multiplataforma (plano 2026-11-19). Offline: fontes falsas e banco em memória.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const load = require("./ai-events-test-loader.cjs")();

const fixture = name => fs.readFileSync(path.join(__dirname, "fixtures", "ai-events", name), "utf8");
const sections = [];
const section = (name, fn) => sections.push([name, fn]);

section("sources", () => {
  const s = load("lib/aiEvents/sources.ts");
  assert.deepEqual(s.platformOf("https://www.sympla.com.br/evento/x/1"), { id: "sympla", label: "Sympla" });
  assert.equal(s.platformOf("https://www.ticket360.com.br/evento/1/a").label, "Ticket360");
  assert.equal(s.platformOf("nao-e-url").label, "fonte oficial");
  assert.equal(s.importedBadge("https://www.ingresse.com/e"), "Importado de Ingresse");
  assert.deepEqual(s.ticket360EventLinks(fixture("ticket360-home.html")), [
    "https://www.ticket360.com.br/evento/33222/ingressos-para-a",
    "https://www.ticket360.com.br/evento/33514/ingressos-para-b",
  ]);
  assert.equal(s.sameCity("São Paulo", "SP", "Sao Paulo"), true);
  assert.equal(s.sameCity("Campinas", "SP", "São Paulo"), false);
  assert.equal(s.sameCity(undefined, "DF", "Brasília"), true);
});

// Páginas falsas: catálogo da Sympla, home/explore da Ticket360 e páginas de evento com JSON-LD.
const NOW = new Date("2030-01-01T00:00:00Z");
const eventPage = (url, name, locality, startDate = "2030-02-02T19:30:00-03:00") => `<html><script type="application/ld+json">${JSON.stringify({
  "@type": "MusicEvent", name, url, image: "https://images.example.com/banner.jpg", startDate, endDate: startDate.replace("19:30", "23:00"),
  location: { name: "Casa", address: { streetAddress: "Rua Exemplo, 100", addressLocality: locality, addressRegion: "SP", addressCountry: "BR" } },
  offers: { price: "40.00", priceCurrency: "BRL" },
})}</script></html>`;
const SYMPLA = ["https://www.sympla.com.br/evento/show-a/1001", "https://www.sympla.com.br/evento/show-b/1002"];
const T360 = ["https://www.ticket360.com.br/evento/1/campinas-show", "https://www.ticket360.com.br/evento/2/sp-show"];
function fakeWeb({ fail = [], delay = 0, extraSympla = [], overrides = {} } = {}) {
  const pages = {
    "https://www.sympla.com.br/eventos/campinas-sp": `<a href="${SYMPLA[0]}"></a><a href="${SYMPLA[1]}"></a>${extraSympla.map(u => `<a href="${u}"></a>`).join("")}`,
    "https://www.ticket360.com.br/": `<a href="/evento/1/campinas-show"></a><a href="/evento/2/sp-show"></a>`,
    "https://www.ticket360.com.br/explore": "",
    [SYMPLA[0]]: eventPage(SYMPLA[0], "Show A", "Campinas"),
    [SYMPLA[1]]: eventPage(SYMPLA[1], "Show B", "Campinas"),
    [T360[0]]: eventPage(T360[0], "Show Campinas", "Campinas"),
    [T360[1]]: eventPage(T360[1], "Show SP", "São Paulo"),
  };
  extraSympla.forEach((u, i) => { pages[u] = eventPage(u, "Extra " + i, "Campinas"); });
  Object.assign(pages, overrides);
  return async url => {
    if (delay) await new Promise(r => setTimeout(r, delay));
    if (fail.some(prefix => url.startsWith(prefix))) throw new Error("offline");
    const key = url.split("?")[0];
    if (!(key in pages)) throw new Error("404 " + url);
    if (url.includes("?page=")) return { url, body: "" };
    return { url, body: pages[key] };
  };
}
const providerWith = web => load("lib/aiEvents/provider.ts").createAiEventProvider({ readSource: web, now: () => NOW });

section("discover.sympla+ticket360", async () => {
  const r = await providerWith(fakeWeb()).discoverAllSources("Campinas", 5, { deadline: Date.now() + 10_000 });
  assert.equal(r.sources.length, 3);
  assert.deepEqual(r.sources.filter(s => s.platform === "Ticket360").map(s => s.url), [T360[0]]);
  assert.equal(r.sources.filter(s => s.platform === "Sympla").length, 2);
  assert.deepEqual(r.sourceErrors, []);
  assert.equal(r.partial, false);
});
section("discover.source-down", async () => {
  const r = await providerWith(fakeWeb({ fail: ["https://www.ticket360.com.br/"] })).discoverAllSources("Campinas", 5, { deadline: Date.now() + 10_000 });
  assert.equal(r.sources.length, 2);
  assert.equal(r.sourceErrors.length, 1);
  assert.equal(r.sourceErrors[0].platform, "Ticket360");
  assert.match(r.sourceErrors[0].message, /indisponível/);
});
section("discover.deadline", async () => {
  const started = Date.now();
  const r = await providerWith(fakeWeb({ delay: 200 })).discoverAllSources("Campinas", 5, { deadline: Date.now() + 50 });
  assert.equal(r.partial, true);
  assert.ok(Date.now() - started < 1000, "resolve dentro do orçamento");
});
section("discover.known", async () => {
  const r = await providerWith(fakeWeb()).discoverAllSources("Campinas", 5, { deadline: Date.now() + 10_000, alreadyKnown: async url => url === SYMPLA[0] });
  assert.ok(!r.sources.some(s => s.url === SYMPLA[0]));
});
section("discover.max", async () => {
  const extra = Array.from({ length: 8 }, (_, i) => `https://www.sympla.com.br/evento/extra-${i}/${2000 + i}`);
  const r = await providerWith(fakeWeb({ extraSympla: extra })).discoverAllSources("Campinas", 2, { deadline: Date.now() + 10_000 });
  assert.equal(r.sources.length, 2);
  assert.equal(new Set(r.sources.map(s => s.platform)).size, 2, "intercala as plataformas antes de cortar");
});

section("fix.layout-change", async () => {
  // HTTP 200 sem nenhum link de evento: mudança de layout, não "nenhum evento novo".
  const r = await providerWith(fakeWeb({ overrides: { "https://www.sympla.com.br/eventos/campinas-sp": "<html>novo layout</html>", "https://www.ticket360.com.br/": "<html>novo layout</html>" } }))
    .discoverAllSources("Campinas", 5, { deadline: Date.now() + 10_000 });
  assert.deepEqual(r.sourceErrors.map(e => e.platform).sort(), ["Sympla", "Ticket360"]);
});
section("fix.discovery-carries-verified", async () => {
  const r = await providerWith(fakeWeb()).discoverAllSources("Campinas", 5, { deadline: Date.now() + 10_000 });
  assert.ok(r.sources.every(s => s.verified && s.verified.sourceUrl === s.url), "a descoberta devolve o evento já lido");
});

// Banco em memória (mesmo modelo de scripts/verify-ai-events.cjs).
const { randomUUID } = require("node:crypto");
const ADMIN = randomUUID();
function memory() {
  let store = { user: [{ id: ADMIN, role: "ADMIN", suspendedAt: null, suspendedUntil: null }], aiEventAutomation: [], aiEventRun: [], aiEventCandidate: [], events: [], communitySignal: [], eventHistory: [], notification: [], follow: [], favorite: [] };
  const notes = [], db = { failCandidateCreate: null };
  const matches = (row, where = {}) => Object.entries(where).every(([k, v]) => v && typeof v === "object" && !(v instanceof Date)
    ? Object.entries(v).every(([op, x]) => op === "in" ? x.includes(row[k]) : op === "gte" ? row[k] >= x : op === "lt" ? row[k] < x : row[k] === v)
    : row[k] === v);
  for (const name of Object.keys(store)) {
    const list = args => store[name].filter(r => matches(r, args?.where)).slice(0, args?.take ?? Infinity);
    const create = async ({ data }) => {
      if (name === "aiEventCandidate" && db.failCandidateCreate) throw db.failCandidateCreate;
      const row = { id: randomUUID(), createdAt: NOW, status: name === "aiEventRun" ? "QUEUED" : name === "aiEventCandidate" ? "PENDING" : undefined, ...data };
      store[name].push(row); return row;
    };
    db[name] = {
      findUnique: async a => list(a)[0] ?? null, findFirst: async a => list(a)[0] ?? null, findMany: async a => list(a), count: async a => list(a).length, create,
      createMany: async ({ data }) => { for (const row of data) await create({ data: row }); return { count: data.length }; },
      update: async a => { const row = list(a)[0]; assert.ok(row); Object.assign(row, a.data); return row; },
      updateMany: async a => { const rows = list(a); rows.forEach(r => Object.assign(r, a.data)); return { count: rows.length }; },
      upsert: async a => { const row = list(a)[0]; if (row) { Object.assign(row, a.update); return row; } return create({ data: a.create }); },
    };
  }
  db.$queryRaw = async strings => { notes.push(strings.join("?")); return []; };
  db.$transaction = async fn => { const backup = structuredClone(store); try { return await fn(db); } catch (error) { store = backup; throw error; } };
  return { db, get store() { return store; }, notes };
}
const { parseOfficialEvent } = load("lib/aiEvents/provider.ts");
const verified = (url, name, startDate = "2030-02-02T19:30:00-03:00", locality = "Campinas") => parseOfficialEvent(JSON.stringify({
  "@type": "MusicEvent", name, url, image: "https://images.example.com/banner.jpg", startDate, endDate: startDate.replace("19:30", "23:00"),
  location: { name: "Casa", address: { streetAddress: "Rua Exemplo, 100", addressLocality: locality, addressRegion: "SP", addressCountry: "BR" } },
  isAccessibleForFree: true,
}), url, locality, new Date("2029-01-01T00:00:00Z"));
const depsFor = (pages, now = NOW) => ({ configured: () => true, discover: async () => [], inspect: async url => { if (!pages[url]) throw new Error("offline"); return pages[url](); }, now: () => now });

section("pipeline.creates-pending", async () => {
  const { importSources } = load("lib/aiEvents/service.ts");
  const m = memory();
  const report = await importSources(m.db, ADMIN, "run-1", [{ url: SYMPLA[0], platform: "Sympla" }], "Campinas", depsFor({ [SYMPLA[0]]: () => verified(SYMPLA[0], "Show A") }));
  assert.equal(report.created, 1);
  const [event] = m.store.events;
  assert.equal(event.status, "PENDING"); assert.equal(event.validate, false); assert.equal(event.userId, ADMIN);
  assert.equal(m.store.aiEventCandidate[0].eventId, event.id);
  assert.equal(m.store.eventHistory[0].note, "Importado de Sympla");
  assert.equal(m.store.notification.length, 0, "nenhuma notificação na criação");
  assert.ok(!m.notes.some(n => n.includes("pg_notify('eventmap_events_updated'")), "não anuncia publicação");
});
section("pipeline.rejected-not-reimported", async () => {
  const { importSources } = load("lib/aiEvents/service.ts");
  const m = memory();
  m.store.aiEventCandidate.push({ id: randomUUID(), sourceUrl: SYMPLA[0], status: "REJECTED", eventId: null });
  const report = await importSources(m.db, ADMIN, "run-1", [{ url: SYMPLA[0], platform: "Sympla" }], "Campinas", depsFor({ [SYMPLA[0]]: () => verified(SYMPLA[0], "Show A") }));
  assert.equal(report.items[0].outcome, "previously_rejected");
  assert.equal(m.store.events.length, 0);
});
section("pipeline.cross-platform-duplicate", async () => {
  const { importSources } = load("lib/aiEvents/service.ts");
  const m = memory();
  const report = await importSources(m.db, ADMIN, "run-1", [{ url: SYMPLA[0], platform: "Sympla" }, { url: T360[0], platform: "Ticket360" }], "Campinas",
    depsFor({ [SYMPLA[0]]: () => verified(SYMPLA[0], "Show do Fulano"), [T360[0]]: () => verified(T360[0], "SHOW DO FULANO!") }));
  assert.deepEqual(report.items.map(i => i.outcome), ["created", "possible_duplicate"]);
  assert.equal(m.store.events.length, 1);
});
section("pipeline.past-event", async () => {
  const { importSources } = load("lib/aiEvents/service.ts");
  const m = memory();
  const report = await importSources(m.db, ADMIN, "run-1", [{ url: SYMPLA[0], platform: "Sympla" }], "Campinas",
    depsFor({ [SYMPLA[0]]: () => verified(SYMPLA[0], "Antigo", "2029-06-01T19:30:00-03:00") }, new Date("2030-01-01T00:00:00Z")));
  assert.equal(report.items[0].outcome, "invalid");
  assert.equal(m.store.events.length, 0);
});
section("pipeline.race", async () => {
  const { importSources } = load("lib/aiEvents/service.ts");
  const { Prisma } = require("@prisma/client");
  const m = memory();
  m.db.failCandidateCreate = new Prisma.PrismaClientKnownRequestError("duplicado", { code: "P2002", clientVersion: "test" });
  const report = await importSources(m.db, ADMIN, "run-1", [{ url: SYMPLA[0], platform: "Sympla" }], "Campinas", depsFor({ [SYMPLA[0]]: () => verified(SYMPLA[0], "Show A") }));
  assert.equal(report.items[0].outcome, "already_imported");
  assert.equal(m.store.events.length, 0, "a transação desfaz o evento");
});

section("fix.import-no-reread", async () => {
  const { importSources } = load("lib/aiEvents/service.ts");
  const m = memory();
  const report = await importSources(m.db, ADMIN, "run-1", [{ url: SYMPLA[0], platform: "Sympla", verified: verified(SYMPLA[0], "Show A") }], "Campinas", depsFor({}));
  assert.equal(report.created, 1, "usa o evento lido na descoberta, sem nova leitura");
});
section("fix.import-deadline", async () => {
  const { importSources } = load("lib/aiEvents/service.ts");
  const m = memory();
  const report = await importSources(m.db, ADMIN, "run-1", [{ url: SYMPLA[0], platform: "Sympla" }], "Campinas", depsFor({ [SYMPLA[0]]: () => verified(SYMPLA[0], "Show A") }), Date.now() - 1);
  assert.equal(report.partial, true);
  assert.equal(m.store.events.length, 0);
  let timeout;
  const deps = { ...depsFor({}), inspect: async (url, city, ms) => { timeout = ms; return verified(SYMPLA[0], "Show A"); } };
  await importSources(memory().db, ADMIN, "run-1", [{ url: SYMPLA[0], platform: "Sympla" }], "Campinas", deps, Date.now() + 3000);
  assert.ok(timeout > 0 && timeout <= 3000, "cada leitura cabe no tempo restante");
});

const immediateDeps = (m, pages) => ({
  ...depsFor(pages),
  discoverAll: async () => ({ sources: Object.keys(pages).map(url => ({ url, platform: url.includes("ticket360") ? "Ticket360" : "Sympla" })), sourceErrors: [], partial: false }),
});
section("immediate.run", async () => {
  const { aiEventsAction } = load("lib/aiEvents/service.ts");
  const m = memory();
  const report = await aiEventsAction(m.db, ADMIN, { action: "run", city: "Campinas", maxPerRun: 3 }, immediateDeps(m, { [SYMPLA[0]]: () => verified(SYMPLA[0], "Show A") }));
  assert.equal(report.created, 1);
  const [run] = m.store.aiEventRun;
  assert.equal(run.status, "SUCCEEDED"); assert.equal(run.createdCount, 1);
  assert.equal(m.store.aiEventRun.filter(r => r.status === "QUEUED").length, 0, "nada fica na fila");
});
section("immediate.inspect", async () => {
  const { aiEventsAction } = load("lib/aiEvents/service.ts");
  const m = memory();
  const report = await aiEventsAction(m.db, ADMIN, { action: "inspect", url: SYMPLA[0] }, immediateDeps(m, { [SYMPLA[0]]: () => verified(SYMPLA[0], "Show A") }));
  assert.equal(report.items.length, 1);
  assert.equal(m.store.events[0].status, "PENDING");
});
section("immediate.concurrency", async () => {
  const { aiEventsAction } = load("lib/aiEvents/service.ts");
  const busy = memory();
  for (let i = 0; i < 3; i++) busy.store.aiEventRun.push({ id: randomUUID(), status: "RUNNING", startedAt: new Date(NOW.getTime() - 60_000), requestedBy: "outro", createdAt: new Date(NOW.getTime() - 60_000) });
  await assert.rejects(() => aiEventsAction(busy.db, ADMIN, { action: "run", city: "Campinas", maxPerRun: 3 }, immediateDeps(busy, {})), e => e.status === 429);
  const stale = memory();
  for (let i = 0; i < 3; i++) stale.store.aiEventRun.push({ id: randomUUID(), status: "RUNNING", startedAt: new Date(NOW.getTime() - 11 * 60_000), requestedBy: "outro", createdAt: new Date(NOW.getTime() - 11 * 60_000) });
  await aiEventsAction(stale.db, ADMIN, { action: "run", city: "Campinas", maxPerRun: 3 }, immediateDeps(stale, {}));
});
section("immediate.approve-legacy-pending", async () => {
  const { aiEventsAction } = load("lib/aiEvents/service.ts");
  const m = memory();
  const v = verified(SYMPLA[0], "Legado");
  const id = randomUUID();
  m.store.aiEventCandidate.push({ id, sourceUrl: v.sourceUrl, sourceHash: v.sourceHash, status: "PENDING", eventId: null, name: v.name });
  await aiEventsAction(m.db, ADMIN, { action: "approve", id }, depsFor({ [SYMPLA[0]]: () => v }));
  assert.equal(m.store.events[0].status, "PENDING");
  assert.equal(m.store.aiEventCandidate[0].eventId, m.store.events[0].id);
  assert.equal(m.store.notification.length, 0);
});
section("immediate.worker-keeps-running", async () => {
  const { pollAiEvents } = load("lib/aiEvents/service.ts");
  const m = memory();
  m.store.aiEventAutomation.push({ id: "default", city: "Campinas", enabled: false, maxPerRun: 3, leaseUntil: null });
  m.store.aiEventRun.push({ id: "fresh", status: "RUNNING", startedAt: new Date(NOW.getTime() - 60_000), requestedBy: ADMIN, createdAt: NOW });
  await pollAiEvents(m.db, immediateDeps(m, {}));
  assert.equal(m.store.aiEventRun.find(r => r.id === "fresh").status, "RUNNING");
});

section("immediate.route", () => {
  const route = fs.readFileSync(path.join(__dirname, "..", "app", "api", "admin", "ai-events", "route.ts"), "utf8");
  assert.match(route, /export const maxDuration = 60;/);
  assert.match(route, /\{ \.\.\.\(await aiEventsSnapshot\(prisma, adminId\)\), report \}/, "POST devolve o relatório da busca");
});

// Server actions reais com dependências "@/..." substituídas; registra a ordem das chamadas ao banco.
function loadAction(file, dependencies) {
  const ts = require("typescript");
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", code)(name => name in dependencies ? dependencies[name] : require(name), mod, mod.exports);
  return mod.exports;
}
function actionDb(calls, events) {
  const op = (model, name, result) => async args => { calls.push({ model, name, args }); return typeof result === "function" ? result(args) : result; };
  const tx = {
    user: { findUnique: op("user", "findUnique", { name: "Admin" }) },
    events: { findMany: op("events", "findMany", events), updateMany: op("events", "updateMany", { count: 1 }), deleteMany: op("events", "deleteMany", { count: events.length }), count: op("events", "count", 0) },
    eventHistory: { create: op("eventHistory", "create", {}), createMany: op("eventHistory", "createMany", {}) },
    notification: { updateMany: op("notification", "updateMany", { count: 0 }) },
    aiEventCandidate: { updateMany: op("aiEventCandidate", "updateMany", { count: 1 }) },
  };
  return { ...tx, $transaction: async fn => fn(tx) };
}
const actionDeps = db => ({
  "@/lib/prisma": { __esModule: true, default: db },
  "@/lib/adminAuth": { getAuthenticatedAdminId: async () => ADMIN },
  "@/lib/eventNotifications": { notifyEventAudience: async () => {} },
  "@/lib/services/attendance": { reconcileEventWaitlist: async () => {} },
});
section("lifecycle.validate", async () => {
  const calls = [];
  const { validateEvents } = loadAction("app/(actions)/validateEvents/action.ts", actionDeps(actionDb(calls, [{ id: "e1", nome: "Show", userId: ADMIN }])));
  await validateEvents(["e1"], ADMIN);
  const candidate = calls.find(c => c.model === "aiEventCandidate");
  assert.ok(candidate, "atualiza o candidato do evento validado");
  assert.deepEqual(candidate.args.where, { eventId: { in: ["e1"] } });
  assert.equal(candidate.args.data.status, "PUBLISHED");
  assert.equal(candidate.args.data.approvedBy, ADMIN);
});
section("lifecycle.delete-before-cascade", async () => {
  const calls = [];
  const { deleteEvents } = loadAction("app/(actions)/deleteEvents/action.ts", actionDeps(actionDb(calls, [{ id: "e1", nome: "Show", userId: ADMIN, banner: "", carrossel: [], status: "PENDING" }])));
  await deleteEvents(["e1"], ADMIN);
  const reject = calls.findIndex(c => c.model === "aiEventCandidate" && c.args.data.status === "REJECTED");
  const remove = calls.findIndex(c => c.model === "events" && c.name === "deleteMany");
  assert.ok(reject >= 0, "marca o candidato como rejeitado");
  assert.deepEqual(calls[reject].args.where, { eventId: { in: ["e1"] } });
  assert.ok(reject < remove, "antes da exclusão (onDelete: SetNull)");
});

section("ui", () => {
  const ui = fs.readFileSync(path.join(__dirname, "..", "components", "MyComponents", "AdminAiEvents.tsx"), "utf8");
  for (const text of ["Buscar agora em {city}", "Buscando em Sympla e Ticket360…", "evento(s) criado(s) e aguardando validação", "Validar agora", "/EventsCreated?importados=pendentes",
    "A busca foi interrompida pelo tempo limite; rode de novo para continuar.", "Verificar e importar agora", "Aguardando validação", "importedBadge("]) assert.ok(ui.includes(text), "falta: " + text);
  assert.match(ui, /aria-busy=\{/);
  assert.match(ui, /65_?000/, "limite próprio acima do orçamento de 45 s da busca");
  assert.doesNotMatch(ui.replace(/\/\/.*$/gm, ""), /\bIA\b/, "sem 'IA' nos textos da tela");
  assert.doesNotMatch(ui, /Aprovar e publicar/, "nada é publicado direto desta tela");
});

section("fix.preview-pending", () => {
  const { canPreviewEvent } = load("lib/eventPreview.ts");
  const event = { userId: "dono", status: "PENDING" };
  assert.equal(canPreviewEvent({ id: ADMIN, role: "ADMIN", suspended: false }, event), true, "admin vê o importado pendente");
  assert.equal(canPreviewEvent({ id: "dono", role: "USER", suspended: false }, event), true, "quem criou vê o próprio rascunho");
  assert.equal(canPreviewEvent({ id: "outro", role: "USER", suspended: false }, event), false);
  assert.equal(canPreviewEvent(null, event), false, "público continua sem acesso");
  assert.equal(canPreviewEvent({ id: ADMIN, role: "ADMIN", suspended: true }, event), false, "conta suspensa não vê");
  const page = fs.readFileSync(path.join(__dirname, "..", "app", "eventos", "[id]", "page.tsx"), "utf8");
  assert.match(page, /canPreviewEvent\(/, "a página do evento usa a regra de prévia");
  assert.match(page, /Prévia: este evento ainda não está no ar/);
});

section("queue", () => {
  const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  assert.match(read("lib/eventQueries.ts"), /aiImport: \{ select: \{ sourceUrl: true/, "a fila recebe a origem do evento importado");
  assert.match(read("app/api/admin/events/route.ts"), /publicEventSelect/);
  const page = read("app/(publicRoutes)/EventsCreated/page.tsx");
  assert.match(page, /get\("importados"\) === "pendentes"/);
  assert.match(page, /status === "PENDING" && event\.aiImport/);
  assert.ok(page.includes("Importados aguardando validação") && page.includes("Ver todos"));
  const table = read("components/MyComponents/TableEventsAdmin.tsx");
  assert.match(table, /importedBadge\(event\.aiImport\.sourceUrl\)/);
});

(async () => {
  let failed = 0;
  for (const [name, fn] of sections) {
    try { await fn(); console.log("PASS " + name); }
    catch (error) { failed++; console.log("FAIL " + name + ": " + (error && error.message)); }
  }
  if (failed) process.exit(1);
  console.log("PASS: importação imediata e multiplataforma");
})();
