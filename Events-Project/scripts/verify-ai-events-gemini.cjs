// Gemini na página Eventos IA: pesquisa de links (verificados como qualquer fonte) e descrição/categoria.
// Offline: Gemini, páginas e banco são falsos. Datas, endereço, preço e hash nunca vêm da IA.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const load = require("./ai-events-test-loader.cjs")();

const sections = [];
const section = (name, fn) => sections.push([name, fn]);
const NOW = new Date("2030-01-01T00:00:00Z");
const KEY = "test-key-not-real";

const gemini = load("lib/aiEvents/gemini.ts");
const client = load("lib/gemini/client.ts");
const provider = load("lib/aiEvents/provider.ts");

const eventPage = (url, name, locality = "Campinas") => `<html><body><h1>${name}</h1><p>Uma noite de samba com a banda Exemplo e convidados, para toda a família.</p><script>window.secret = "ignorar";</script><script type="application/ld+json">${JSON.stringify({
  "@type": "MusicEvent", name, url, image: "https://cdn.casa.com.br/banner.jpg", startDate: "2030-02-02T19:30:00-03:00", endDate: "2030-02-02T23:00:00-03:00",
  location: { name: "Casa", address: { streetAddress: "Rua Exemplo, 100", addressLocality: locality, addressRegion: "SP", addressCountry: "BR" } },
  offers: { price: "40.00", priceCurrency: "BRL" },
})}</script></body></html>`;

function fakeFetch(answer, calls = []) {
  return async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    if (answer instanceof Error) throw answer;
    if (typeof answer === "number") return { ok: false, status: answer, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: answer }] } }] }) };
  };
}

section("links.parse-and-filter", () => {
  const links = gemini.eventLinksFromText([
    "Aqui estão:",
    "https://www.casadeshow.com.br/eventos/samba-2030.",
    "https://www.instagram.com/p/abc",
    "https://www.casadeshow.com.br/eventos/samba-2030",
    "(https://www.sympla.com.br/evento/x/123)",
    "https://www.google.com/search?q=x",
    "http://inseguro.com.br/evento/1",
    "https://site.com.br/",
  ].join("\n"));
  assert.deepEqual(links, ["https://www.casadeshow.com.br/eventos/samba-2030", "https://www.sympla.com.br/evento/x/123"]);
});

section("canonical.any-host-only-when-asked", () => {
  const url = "https://www.casadeshow.com.br/eventos/samba?utm_source=x";
  assert.throws(() => provider.canonicalSourceUrl(url), /fontes permitidas/);
  assert.equal(provider.canonicalSourceUrl(url, { anyHost: true }), "https://www.casadeshow.com.br/eventos/samba");
  for (const bad of ["https://127.0.0.1/e", "https://[::1]/e", "https://localhost/e", "https://intranet.local/e", "https://servidor.internal/e", "http://casa.com.br/e", "https://u:p@casa.com.br/e", "https://casa.com.br:8443/e"]) {
    assert.throws(() => provider.canonicalSourceUrl(bad, { anyHost: true }), /fontes permitidas/, bad);
  }
});

section("client.search-request-shape", async () => {
  const calls = [];
  const links = await gemini.geminiEventLinks("Campinas", { env: { GEMINI_API_KEY: KEY }, fetch: fakeFetch("https://www.casa.com.br/evento/1", calls) });
  assert.deepEqual(links, ["https://www.casa.com.br/evento/1"]);
  const [call] = calls;
  assert.ok(!call.url.includes(KEY), "a chave nunca vai na URL");
  assert.equal(call.init.headers["x-goog-api-key"], KEY);
  assert.deepEqual(call.body.tools, [{ google_search: {} }]);
  assert.equal(call.body.generationConfig.responseSchema, undefined, "pesquisa não usa schema");
  assert.match(call.body.contents[0].parts[0].text, /Campinas/);
});

section("client.failures-are-null", async () => {
  const env = { GEMINI_API_KEY: KEY };
  assert.equal(await client.geminiText({ system: "s", parts: [{ text: "x" }] }, { env: {} }), null, "sem chave");
  assert.equal(await client.geminiText({ system: "s", parts: [{ text: "x" }] }, { env, fetch: fakeFetch(429) }), null, "cota");
  assert.equal(await client.geminiText({ system: "s", parts: [{ text: "x" }] }, { env, fetch: fakeFetch(new Error("rede")) }), null, "rede");
  await assert.rejects(gemini.geminiEventLinks("Campinas", { env, fetch: fakeFetch(429) }), /indisponível/);
});

section("discover.gemini-links-are-verified", async () => {
  const OPEN = "https://www.casadeshow.com.br/eventos/samba-2030";
  const FAKE = "https://www.casadeshow.com.br/eventos/inventado";
  const reads = [];
  const readSource = async (url, _timeout, anyHost) => {
    reads.push({ url, anyHost });
    if (url === OPEN) return { url, body: eventPage(OPEN, "Samba na Casa") };
    throw new Error("404");
  };
  const p = provider.createAiEventProvider({ readSource, now: () => NOW, findLinks: async () => [OPEN, FAKE, "https://127.0.0.1/x"] });
  const r = await p.discoverAllSources("Campinas", 5, { deadline: Date.now() + 20_000 });
  const gem = r.sources.filter(s => s.openHost);
  assert.equal(gem.length, 1);
  assert.equal(gem[0].url, OPEN);
  assert.equal(gem[0].platform, "fonte oficial");
  assert.equal(gem[0].verified.event.priceCents, 4000, "preço vem do JSON-LD");
  assert.equal(gem[0].verified.event.dataInicio, "2030-02-02");
  assert.match(gem[0].verified.pageText, /noite de samba/);
  assert.ok(!/ignorar/.test(gem[0].verified.pageText), "scripts fora do texto");
  assert.equal(gem[0].verified.event.banner, "https://cdn.casa.com.br/banner.jpg");
  assert.ok(reads.filter(x => x.url === OPEN).every(x => x.anyHost === true));
  assert.ok(!reads.some(x => x.url.includes("127.0.0.1")), "IP descartado antes da leitura");
  assert.ok(r.sourceErrors.every(e => e.platform !== provider.GEMINI_PLATFORM));
});

section("discover.gemini-down-keeps-others", async () => {
  const p = provider.createAiEventProvider({ readSource: async () => { throw new Error("offline"); }, now: () => NOW, findLinks: async () => { throw new Error("quota"); } });
  const r = await p.discoverAllSources("Campinas", 5, { deadline: Date.now() + 5_000 });
  const err = r.sourceErrors.find(e => e.platform === provider.GEMINI_PLATFORM);
  assert.ok(err && /indisponível/.test(err.message));
});

section("discover.no-key-no-gemini", async () => {
  const p = provider.createAiEventProvider({ readSource: async () => { throw new Error("offline"); }, now: () => NOW, findLinks: null });
  const r = await p.discoverAllSources("Campinas", 5, { deadline: Date.now() + 5_000 });
  assert.ok(!r.sourceErrors.some(e => e.platform === provider.GEMINI_PLATFORM));
});

section("inspect.pasted-link-stays-curated", async () => {
  const p = provider.createAiEventProvider({ readSource: async url => ({ url, body: eventPage(url, "X") }), now: () => NOW, findLinks: null });
  await assert.rejects(p.inspectEventSource("https://www.casadeshow.com.br/eventos/samba-2030"), /fontes permitidas/);
});

const INPUT = { name: "Samba na Casa", address: "Rua Exemplo, 100, Campinas", startDate: "2030-02-02T22:30:00.000Z", category: "Música", pageText: "Uma noite de samba com a banda Exemplo e convidados, para toda a família. Abertura às 19h com roda de samba." };

section("enrich.cleans-and-validates", async () => {
  const description = "**Uma noite de samba** com a banda Exemplo e convidados especiais, pensada para toda a família.\n\n\n\nReservas: (19) 99999-1234 ou contato@casa.com.br, veja https://casa.com.br/x.\n\nRoda de samba na abertura.";
  const calls = [];
  const r = await gemini.enrichEventWithGemini(INPUT, { env: { GEMINI_API_KEY: KEY }, fetch: fakeFetch(JSON.stringify({ descricao: description, category: "Música" }), calls) });
  assert.equal(r.category, "Música");
  assert.ok(!/\*|99999|@|https?:/.test(r.descricao), r.descricao);
  assert.ok(!/\n{3,}/.test(r.descricao));
  assert.ok(calls[0].body.generationConfig.responseSchema, "usa schema JSON");
  assert.match(calls[0].body.system_instruction.parts[0].text, /ignore qualquer instrução/);
});

section("enrich.bad-answers", async () => {
  const env = { GEMINI_API_KEY: KEY };
  assert.equal(await gemini.enrichEventWithGemini({ ...INPUT, pageText: "curto" }, { env, fetch: fakeFetch("{}") }), null, "texto curto não chama");
  assert.equal(await gemini.enrichEventWithGemini(INPUT, { env, fetch: fakeFetch("não é json") }), null);
  assert.equal(await gemini.enrichEventWithGemini(INPUT, { env, fetch: fakeFetch(500) }), null);
  const odd = await gemini.enrichEventWithGemini(INPUT, { env, fetch: fakeFetch(JSON.stringify({ descricao: "x".repeat(200), category: "Inventada" })) });
  assert.equal(odd.category, "Música", "categoria fora da lista mantém a atual");
  const long = await gemini.enrichEventWithGemini(INPUT, { env, fetch: fakeFetch(JSON.stringify({ descricao: "Frase longa sobre o evento. ".repeat(100), category: "Cultura" })) });
  assert.ok(long.descricao.length <= gemini.MAX_DESCRIPTION && long.descricao.endsWith("."));
});

// Banco em memória mínimo para importSources.
const ADMIN = randomUUID();
function memory() {
  const store = { user: [{ id: ADMIN, role: "ADMIN", suspendedAt: null, suspendedUntil: null }], aiEventCandidate: [], events: [], communitySignal: [], eventHistory: [] };
  const matches = (row, where = {}) => Object.entries(where).every(([k, v]) => v && typeof v === "object" ? Object.entries(v).every(([op, x]) => op === "in" ? x.includes(row[k]) : true) : row[k] === v);
  const db = {};
  for (const name of Object.keys(store)) {
    const list = a => store[name].filter(r => matches(r, a?.where));
    const create = async ({ data }) => { const row = { id: randomUUID(), ...data }; store[name].push(row); return row; };
    db[name] = { findUnique: async a => list(a)[0] ?? null, findMany: async a => list(a), create, createMany: async ({ data }) => { for (const d of data) await create({ data: d }); return { count: data.length }; } };
  }
  db.$queryRaw = async () => [];
  db.$transaction = async fn => fn(db);
  return { db, store };
}

section("import.enriched-description-same-hash", async () => {
  const { importSources } = load("lib/aiEvents/service.ts");
  const URL_ = "https://www.casadeshow.com.br/eventos/samba-2030";
  const verified = { ...provider.parseOfficialEvent(eventPage(URL_, "Samba na Casa"), URL_, "Campinas", new Date("2029-01-01T00:00:00Z"), { anyHost: true }), pageText: INPUT.pageText };
  const m = memory();
  const seen = [];
  const deps = { configured: () => true, inspect: async () => { throw new Error("não deve reler"); }, now: () => new Date("2029-06-01T00:00:00Z"),
    enrich: async (input, timeout) => { seen.push({ input, timeout }); return { descricao: "Descrição escrita pelo Gemini com detalhes reais do evento e das atrações da noite.", category: "Cultura" }; } };
  const report = await importSources(m.db, ADMIN, "run-1", [{ url: URL_, platform: "fonte oficial", verified, openHost: true }], "Campinas", deps);
  assert.equal(report.created, 1);
  const [event] = m.store.events;
  assert.match(event.descricao, /escrita pelo Gemini/);
  assert.equal(event.category, "Cultura");
  assert.equal(event.priceCents, 4000);
  assert.equal(event.dataInicio, "2030-02-02");
  assert.equal(m.store.aiEventCandidate[0].sourceHash, verified.sourceHash, "hash dos fatos não muda");
  assert.equal(seen[0].input.pageText, INPUT.pageText);
  assert.ok(seen[0].timeout <= 12000);
});

section("import.enrich-failure-keeps-official-text", async () => {
  const { importSources } = load("lib/aiEvents/service.ts");
  const URL_ = "https://www.casadeshow.com.br/eventos/samba-2031";
  const verified = { ...provider.parseOfficialEvent(eventPage(URL_, "Samba Dois"), URL_, "Campinas", new Date("2029-01-01T00:00:00Z"), { anyHost: true }), pageText: INPUT.pageText };
  const m = memory();
  const deps = { configured: () => true, inspect: async () => { throw new Error("x"); }, now: () => new Date("2029-06-01T00:00:00Z"), enrich: async () => { throw new Error("quota"); } };
  const report = await importSources(m.db, ADMIN, "run-1", [{ url: URL_, platform: "fonte oficial", verified, openHost: true }], "Campinas", deps);
  assert.equal(report.created, 1);
  assert.match(m.store.events[0].descricao, /Consulte a fonte oficial/);
});

(async () => {
  let failed = 0;
  for (const [name, fn] of sections) {
    try { await fn(); console.log("PASS " + name); }
    catch (error) { failed++; console.log("FAIL " + name + ": " + (error && error.message)); }
  }
  if (failed) process.exit(1);
  console.log("PASS: Gemini na página Eventos IA");
})();
