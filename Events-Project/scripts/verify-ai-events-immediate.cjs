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

(async () => {
  let failed = 0;
  for (const [name, fn] of sections) {
    try { await fn(); console.log("PASS " + name); }
    catch (error) { failed++; console.log("FAIL " + name + ": " + (error && error.message)); }
  }
  if (failed) process.exit(1);
  console.log("PASS: importação imediata e multiplataforma");
})();
