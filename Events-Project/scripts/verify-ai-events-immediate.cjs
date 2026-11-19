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
  "@type": "MusicEvent", name, url, startDate, endDate: startDate.replace("19:30", "23:00"),
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

(async () => {
  let failed = 0;
  for (const [name, fn] of sections) {
    try { await fn(); console.log("PASS " + name); }
    catch (error) { failed++; console.log("FAIL " + name + ": " + (error && error.message)); }
  }
  if (failed) process.exit(1);
  console.log("PASS: importação imediata e multiplataforma");
})();
