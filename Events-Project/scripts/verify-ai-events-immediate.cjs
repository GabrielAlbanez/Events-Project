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
function fakeWeb({ fail = [], delay = 0, extraSympla = [] } = {}) {
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

(async () => {
  let failed = 0;
  for (const [name, fn] of sections) {
    try { await fn(); console.log("PASS " + name); }
    catch (error) { failed++; console.log("FAIL " + name + ": " + (error && error.message)); }
  }
  if (failed) process.exit(1);
  console.log("PASS: importação imediata e multiplataforma");
})();
