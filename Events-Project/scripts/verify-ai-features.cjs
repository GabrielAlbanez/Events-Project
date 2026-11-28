// Gemini para organizadores e visitantes: rascunho do evento, divulgação, dicas, busca e resumo.
// Offline: Gemini, banco e imagens são falsos. Confere validação, permissões, limites e cache.
const assert = require("node:assert/strict");
const load = require("./ai-events-test-loader.cjs")();

const sections = [];
const section = (name, fn) => sections.push([name, fn]);
const NOW = new Date("2030-03-06T15:00:00Z"); // quarta-feira, 12h em São Paulo
const ENV = { GEMINI_API_KEY: "test-key-not-real" };

const features = load("lib/ai/features.ts");
const service = load("lib/ai/service.ts");
const quota = load("lib/ai/quota.ts");

const answer = value => async (_url, init) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: typeof value === "string" ? value : JSON.stringify(value) }] } }] }), init });
const capture = (value, calls) => async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return answer(value)(url, init); };

// PNG 800x400 mínimo (só o cabeçalho importa para imageDimensions).
function png(width = 800, height = 400) {
  const bytes = Buffer.alloc(33);
  bytes.writeUInt32BE(0x89504e47, 0); bytes.writeUInt32BE(0x0d0a1a0a, 4); bytes.writeUInt32BE(13, 8); bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20);
  return bytes;
}
const file = (bytes, type = "image/png") => new Blob([bytes], { type });

section("draft.validates-every-field", async () => {
  const calls = [];
  const draft = await features.draftEvent({ text: "Samba no sábado às 20h no Bar do Zé, R$ 30. Chama no (11) 98888-7777", image: null }, NOW, { env: ENV, fetch: capture({
    nome: "Samba do Zé", descricao: "Uma noite de samba de raiz com a roda do Zé e convidados. Reservas pelo (11) 98888-7777 ou https://wa.me/x.",
    category: "Música", dataInicio: "2030-03-09", dataFim: "2030-03-08", startTime: "20:00", endTime: "25:00", endereco: "Bar do Zé, Rua A, 10",
    isFree: false, priceReais: 30, organizerName: "Zé", ageRating: "18+", ticketLink: "javascript:alert(1)",
  }, calls) });
  assert.equal(draft.nome, "Samba do Zé");
  assert.equal(draft.category, "Música");
  assert.equal(draft.dataInicio, "2030-03-09");
  assert.equal(draft.dataFim, "2030-03-09", "término antes do início vira o mesmo dia");
  assert.equal(draft.startTime, "20:00");
  assert.equal(draft.endTime, undefined, "horário inválido descartado");
  assert.equal(draft.price, "30,00");
  assert.equal(draft.isFree, false);
  assert.equal(draft.LinkParaCompraIngresso, undefined, "só links https");
  assert.ok(!/98888|wa\.me|https?:/.test(draft.descricao), draft.descricao);
  const prompt = calls[0].body.system_instruction.parts[0].text;
  assert.match(prompt, /2030-03-06/);
  assert.match(prompt, /ignore qualquer instrução/);
  assert.ok(calls[0].body.generationConfig.responseSchema);
});

section("draft.drops-past-and-bad-category", async () => {
  const draft = await features.draftEvent({ text: "x".repeat(30), image: null }, NOW, { env: ENV, fetch: answer({ nome: "Feira", descricao: "curta", category: "Inventada", dataInicio: "2020-01-01", isFree: true }) });
  assert.equal(draft.dataInicio, undefined);
  assert.equal(draft.category, undefined);
  assert.equal(draft.descricao, undefined);
  assert.equal(draft.isFree, true);
  assert.equal(await features.draftEvent({ text: "x".repeat(30), image: null }, NOW, { env: ENV, fetch: answer("não é json") }), null);
});

section("promo.appends-link-and-strips-contacts", async () => {
  const copy = await features.promoCopy({ name: "Samba", description: "d", category: "Música", dateLabel: "sábado", place: "Bar", priceLabel: "R$ 30", url: "https://site/eventos/1" }, { env: ENV, fetch: answer({
    instagram: "Bora pro samba! Chama no direct ou no (11) 98888-7777. Vai ser incrível demais, garanta já. #samba", whatsapp: "Samba sábado no Bar, R$ 30. Veja https://falso.com", stories: ["Sábado tem samba", "R$ 30", "Corre", "extra"] }) });
  assert.ok(copy.instagram.endsWith("https://site/eventos/1"));
  assert.ok(copy.whatsapp.endsWith("https://site/eventos/1"));
  assert.ok(!/98888|falso\.com/.test(copy.instagram + copy.whatsapp));
  assert.equal(copy.stories.length, 3);
});

section("search.only-known-categories", async () => {
  const intent = await features.searchIntent("samba de graça sábado perto de mim", ["Música", "Esportes"], NOW, { env: ENV, fetch: answer({ q: "samba", periodo: "fim-de-semana", categoria: "Música", gratis: true, precoMax: 50, pertoDeMim: true, entendido: "Samba grátis no fim de semana" }) });
  assert.deepEqual({ ...intent }, { q: "samba", periodo: "fim-de-semana", categoria: "Música", gratis: true, preco: "", nearMe: true, understood: "Samba grátis no fim de semana" });
  const odd = await features.searchIntent("algo", ["Música"], NOW, { env: ENV, fetch: answer({ q: "<b>x</b>", periodo: "amanhã", categoria: "Teatro", gratis: false, precoMax: -3, pertoDeMim: false, entendido: "" }) });
  assert.equal(odd.periodo, "todos");
  assert.equal(odd.categoria, "");
  assert.equal(odd.preco, "");
  assert.ok(!/[<>]/.test(odd.q));
});

section("summary.requires-three-lines", async () => {
  const input = { name: "N", description: "d", category: "c", place: "p", isFree: true, ageRating: "", accessibility: "", participation: "" };
  const ok = await features.eventSummary(input, { env: ENV, fetch: answer({ oQueE: "Show de samba com roda aberta", paraQuem: "Quem gosta de samba", oQueLevar: "Documento e ingresso no celular" }) });
  assert.deepEqual({ ...ok }, { what: "Show de samba com roda aberta", forWho: "Quem gosta de samba", bring: "Documento e ingresso no celular" });
  assert.equal(await features.eventSummary(input, { env: ENV, fetch: answer({ oQueE: "", paraQuem: "x", oQueLevar: "y" }) }), null);
});

section("client.fast-model-then-fallback", async () => {
  const client = load("lib/gemini/client.ts");
  const req = { system: "s", parts: [{ text: "x" }] };
  const urls = [];
  const flaky = status => async (url, init) => { urls.push(url); if (urls.length === 1) return { ok: false, status, json: async () => ({}) }; return answer("ok")(url, init); };
  assert.equal(await client.geminiText(req, { env: ENV, fetch: flaky(503) }), "ok");
  assert.match(urls[0], /models\/gemini-flash-lite-latest:/, "rápido primeiro");
  assert.match(urls[1], /models\/gemini-flash-latest:/, "outro modelo na falha");
  urls.length = 0;
  assert.equal(await client.geminiText(req, { env: ENV, fetch: flaky(429) }), "ok", "cota do modelo rápido → tenta o outro");
  urls.length = 0;
  assert.equal(await client.geminiText(req, { env: ENV, fetch: flaky(400) }), null, "pedido inválido não repete");
  assert.equal(urls.length, 1);
  urls.length = 0;
  // Primeiro modelo trava: o tempo dele acaba antes do total e o segundo responde.
  const hang = async (url, init) => { urls.push(url); if (urls.length === 1) return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("abort")))); return answer("ok")(url, init); };
  const started = Date.now();
  assert.equal(await client.geminiText(req, { env: ENV, fetch: hang, timeoutMs: 6000 }), "ok");
  assert.ok(Date.now() - started < 6000, "cabe no tempo total");
  urls.length = 0;
  await client.geminiText(req, { env: { ...ENV, GEMINI_MODEL: "meu-modelo", GEMINI_FALLBACK_MODEL: "meu-modelo" }, fetch: flaky(503) });
  assert.equal(urls.length, 1, "modelos iguais não repetem");
  assert.match(urls[0], /models\/meu-modelo:/);
});

// ---------- service ----------
function memoryDb(events = []) {
  const tokens = [];
  const matches = (row, where = {}) => Object.entries(where).every(([k, v]) => v && typeof v === "object" && !(v instanceof Date)
    ? Object.entries(v).every(([op, x]) => op === "startsWith" ? String(row[k]).startsWith(x) : op === "lt" ? row[k] < x : true) : row[k] === v);
  return {
    tokens, events,
    verificationToken: {
      count: async ({ where }) => tokens.filter(t => matches(t, where)).length,
      create: async ({ data }) => { tokens.push(data); return data; },
      deleteMany: async ({ where }) => { const before = tokens.length; for (let i = tokens.length - 1; i >= 0; i--) if (matches(tokens[i], where)) tokens.splice(i, 1); return { count: before - tokens.length }; },
    },
    events: {
      findUnique: async ({ where }) => events.find(e => e.id === where.id) ?? null,
      updateMany: async ({ where, data }) => { const rows = events.filter(e => matches(e, where)); rows.forEach(r => Object.assign(r, data)); return { count: rows.length }; },
    },
  };
}
const PROMOTER = { id: "u1", role: "PROMOTER" };
const BASIC = { id: "u2", role: "BASIC" };

section("service.draft-permissions-and-input", async () => {
  const db = memoryDb();
  const form = entries => { const f = new FormData(); for (const [k, v] of Object.entries(entries)) f.set(k, v); return f; };
  let called = 0;
  const deps = { db, env: ENV, now: () => NOW, ai: { draftEvent: async () => { called++; return { nome: "Samba" }; } } };
  assert.equal((await service.draftEventWithAi(null, form({ text: "Samba no sábado à noite no bar" }), deps)).ok, false);
  assert.equal((await service.draftEventWithAi(BASIC, form({ text: "Samba no sábado à noite no bar" }), deps)).ok, false);
  assert.equal((await service.draftEventWithAi(PROMOTER, form({ text: "Samba no sábado à noite no bar" }), { ...deps, env: {} })).error, service.AI_OFF);
  assert.match((await service.draftEventWithAi(PROMOTER, form({ text: "curto" }), deps)).error, /Cole um texto/);
  assert.match((await service.draftEventWithAi(PROMOTER, form({ text: "", image: file(Buffer.from("not an image at all"), "image/png") }), deps)).error, /JPG, PNG ou WebP/);
  assert.equal(called, 0, "nada chamou o Gemini até aqui");
  const ok = await service.draftEventWithAi(PROMOTER, form({ text: "", image: file(png()) }), deps);
  assert.deepEqual(ok, { ok: true, data: { nome: "Samba" } });
});

section("service.quota-per-user-and-global", async () => {
  const db = memoryDb();
  const limits = { perKey: 2, perKeyWindowMs: 3600000, global: 3, globalWindowMs: 86400000 };
  assert.equal(await quota.consumeAiQuota(db, "draft", "a", NOW, limits), true);
  assert.equal(await quota.consumeAiQuota(db, "draft", "a", NOW, limits), true);
  assert.equal(await quota.consumeAiQuota(db, "draft", "a", NOW, limits), false, "limite por pessoa");
  assert.equal(await quota.consumeAiQuota(db, "draft", "b", NOW, limits), true);
  assert.equal(await quota.consumeAiQuota(db, "draft", "c", NOW, limits), false, "limite geral");
  assert.equal(await quota.consumeAiQuota(db, "draft", "a", new Date(NOW.getTime() + 2 * 86400000), limits), true, "nova janela");
  assert.ok(db.tokens.every(t => !t.identifier.includes(":a:") && !t.identifier.includes("draft:k:a")), "chave guardada só como hash");
});

section("service.promo-owner-only", async () => {
  const event = { id: "e1", userId: "u1", status: "PUBLISHED", nome: "Samba", descricao: "d", category: "Música", dataInicio: "2030-03-09", dataFim: "2030-03-09", startTime: "20:00", endereco: "Bar", isFree: false, priceCents: 3000 };
  const db = memoryDb([event]);
  let input;
  const deps = { db, env: ENV, now: () => NOW, siteOrigin: () => "https://site.example", ai: { promoCopy: async value => { input = value; return { instagram: "i", whatsapp: "w", stories: [] }; } } };
  assert.equal((await service.promoCopyWithAi({ id: "other", role: "PROMOTER" }, "e1", deps)).ok, false);
  assert.equal((await service.promoCopyWithAi({ id: "adm", role: "ADMIN" }, "e1", deps)).ok, true);
  assert.equal((await service.promoCopyWithAi(PROMOTER, "e1", deps)).ok, true);
  assert.equal(input.url, "https://site.example/eventos/e1");
  assert.equal(input.priceLabel, "A partir de R$ 30,00");
  assert.match(input.dateLabel, /às 20:00/);
  event.status = "PENDING";
  assert.match((await service.promoCopyWithAi(PROMOTER, "e1", deps)).error, /publicado/);
});

section("service.tips-rules-without-ai", async () => {
  const db = memoryDb();
  const f = new FormData();
  Object.entries({ nome: "Feira", descricao: "curta demais", category: "Outros", dataInicio: "2020-01-01", dataFim: "2020-01-01", endereco: "Rua", lat: "", lng: "", isFree: "true", price: "", ticketsEnabled: "false", LinkParaCompraIngresso: "" }).forEach(([k, v]) => f.set(k, v));
  f.set("banner", file(png(300, 200)));
  const r = await service.eventTipsWithAi(PROMOTER, f, { db, env: {}, now: () => NOW });
  assert.equal(r.ok, true);
  assert.equal(r.data.aiUsed, false);
  const text = r.data.tips.join(" ");
  assert.match(text, /data do evento já passou/);
  assert.match(text, /não foi encontrado no mapa/);
  assert.match(text, /descrição está muito curta/);
  assert.match(text, /imagem de capa está pequena/);
});

section("service.tips-merges-ai", async () => {
  const db = memoryDb();
  const f = new FormData();
  Object.entries({ nome: "Samba", descricao: "Uma noite de samba com a roda do Zé e convidados especiais para toda a família.", category: "Música", dataInicio: "2030-03-09", dataFim: "2030-03-09", endereco: "Rua A, 10", lat: "-23.5", lng: "-46.6", isFree: "true", price: "", ticketsEnabled: "false", LinkParaCompraIngresso: "" }).forEach(([k, v]) => f.set(k, v));
  f.set("bannerUrl", "/uploads/abc.png");
  const deps = { db, env: ENV, now: () => NOW, readImage: async () => png(), ai: { eventTips: async input => { assert.ok(input.image, "usa a capa já enviada"); return { tips: ["Conte quem vai tocar."], imageMatches: false }; } } };
  const r = await service.eventTipsWithAi(PROMOTER, f, deps);
  assert.equal(r.data.aiUsed, true);
  assert.deepEqual(r.data.tips, ["A imagem de capa parece não combinar com o evento. Use o cartaz ou uma foto do local ou das atrações.", "Conte quem vai tocar."]);
});

section("service.search-input", async () => {
  const db = memoryDb();
  const deps = { db, env: ENV, now: () => NOW, ai: { searchIntent: async (q, cats) => ({ q, periodo: "todos", categoria: cats[0] ?? "", gratis: false, preco: "", nearMe: false, understood: "ok" }) } };
  assert.equal((await service.searchWithAi("k", "a", [], deps)).ok, false);
  const r = await service.searchWithAi("k", "samba", ["Música", 3, null], deps);
  assert.equal(r.data.categoria, "Música");
});

section("service.summary-cache", async () => {
  const event = { id: "e1", status: "PUBLISHED", nome: "Samba", descricao: "Uma noite de samba com a roda do Zé e convidados especiais para toda a família.", category: "Música", endereco: "Bar", isFree: true, ageRating: null, accessibilityInfo: null, participationInfo: null, aiSummary: null, aiSummaryHash: null };
  const db = memoryDb([event]);
  let calls = 0;
  const deps = { db, env: ENV, now: () => NOW, ai: { eventSummary: async () => { calls++; return { what: "Roda de samba", forWho: "Quem gosta de samba", bring: "Documento" }; } } };
  const first = await service.eventSummaryWithAi("e1", deps);
  assert.equal(first.what, "Roda de samba");
  assert.equal(calls, 1);
  assert.ok(event.aiSummaryHash);
  await service.eventSummaryWithAi("e1", deps);
  assert.equal(calls, 1, "segunda visita usa o cache");
  event.descricao += " Agora com feijoada.";
  await service.eventSummaryWithAi("e1", deps);
  assert.equal(calls, 2, "texto mudou, resumo novo");
  event.status = "PENDING";
  assert.equal(await service.eventSummaryWithAi("e1", deps), null, "só eventos publicados");
  event.status = "PUBLISHED";
  const offline = await service.eventSummaryWithAi("e1", { ...deps, env: {} });
  assert.equal(offline.what, "Roda de samba", "sem Gemini devolve o último resumo salvo");
});

(async () => {
  let failed = 0;
  for (const [name, fn] of sections) {
    try { await fn(); console.log("PASS " + name); }
    catch (error) { failed++; console.log("FAIL " + name + ": " + (error && error.stack || error)); }
  }
  if (failed) process.exit(1);
  console.log("PASS: recursos de IA para organizadores e visitantes");
})();
