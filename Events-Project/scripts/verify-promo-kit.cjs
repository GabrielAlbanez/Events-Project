// Offline checks for the organizer promotion kit (WhatsApp messages, links, QR poster and share image).
// Pure helpers in lib/promoKit.ts plus static checks of the UI entry points. No database, network or server.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const cache = new Map();
function load(file) {
  file = path.resolve(root, file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const resolve = (name) => {
    if (name.startsWith("@/")) return load(name.slice(2) + ".ts");
    if (name.startsWith(".")) {
      const base = path.resolve(path.dirname(file), name);
      return load(fs.existsSync(base + ".ts") ? base + ".ts" : base + ".tsx");
    }
    return require(name);
  };
  new Function("require", "module", "exports", source)(resolve, mod, mod.exports);
  return mod.exports;
}
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const normalizeSpaces = (value) => value.replace(/\s/g, " ");

const ORIGIN = "https://eventmap.example";
const paid = {
  id: "evt 42/á",
  nome: "Jazz no Terraço & Amigos",
  dataInicio: "2099-12-12",
  dataFim: "2099-12-12",
  startTime: "20:00",
  endTime: "23:30",
  endereco: "Rua Augusta, 100 - São Paulo",
  isFree: false,
  priceCents: 4590,
  capacity: 120,
  status: "PUBLISHED",
};
const free = { ...paid, id: "free-1", nome: "Feira Livre", isFree: true, priceCents: 0, capacity: null, startTime: null, endTime: null };

function checkUrls(lib) {
  const url = lib.promoEventUrl(ORIGIN, paid.id);
  assert.equal(url, "https://eventmap.example/eventos/evt%2042%2F%C3%A1", "absolute event URL with encoded id");
  assert.equal(lib.promoEventUrl("https://eventmap.example/qualquer/caminho?x=1", "abc"), "https://eventmap.example/eventos/abc", "only the origin is used");
  assert.equal(lib.promoEventUrl("javascript:alert(1)", "abc"), null, "non-http origins are rejected");
  assert.equal(lib.promoEventUrl("nao-e-url", "abc"), null, "invalid origins are rejected");
  assert.equal(lib.promoShortUrl("https://eventmap.example/eventos/abc"), "eventmap.example/eventos/abc", "short URL for posters");
  assert.equal(lib.promoShareImagePath(paid.id), "/eventos/evt%2042%2F%C3%A1/opengraph-image/card", "share image path");
  assert.equal(lib.promoQrFileName({ nome: "Jazz no Terraço & Amigos!" }), "qr-jazz-no-terraco-amigos.png", "safe QR file name");
  assert.equal(lib.promoQrFileName({ nome: "***" }), "qr-evento.png", "fallback QR file name");
}

function checkWhatsapp(lib) {
  const text = "Oi! Vem pro *Jazz* & amigos?\nhttps://eventmap.example/eventos/a?b=1#c";
  const wa = lib.whatsappShareUrl(text);
  assert.ok(wa.startsWith("https://wa.me/?text="), "uses wa.me");
  const encoded = wa.slice("https://wa.me/?text=".length);
  assert.equal(decodeURIComponent(encoded), text, "round-trips the full message");
  for (const raw of ["&", "#", "?", "\n", " "]) assert.ok(!encoded.includes(raw), `encodes ${JSON.stringify(raw)}`);
  assert.equal(new URL(wa).searchParams.get("text"), text, "single text parameter");
}

function checkPriceAndDate(lib) {
  assert.equal(normalizeSpaces(lib.promoPriceText(paid)), "R$ 45,90", "paid price via formatTicketAmount");
  assert.equal(lib.promoPriceText(free), "Gratuito", "free events");
  assert.equal(lib.promoPriceText({ ...paid, priceCents: 0 }), null, "unknown price is omitted");
  assert.equal(lib.promoPriceText({ ...paid, priceCents: undefined }), null, "missing price is omitted");
  const date = lib.promoDateText(paid);
  assert.match(date, /12 de dezembro de 2099/, "pt-BR date");
  assert.match(date, /sábado/, "weekday in pt-BR");
  assert.match(date, /20:00/, "start time");
  assert.equal(lib.promoDateText({ ...paid, dataInicio: "data ruim", startTime: null }), "Data a confirmar", "invalid date fallback");
  assert.doesNotMatch(lib.promoDateText(free), /às/, "no time when absent");
}

function checkVariants(lib) {
  const ids = (event) => lib.promoVariants(event).map((variant) => variant.id);
  assert.deepEqual(ids(paid), ["curto", "convite", "ultimos"], "últimos ingressos only with capacity");
  assert.deepEqual(ids(free), ["curto", "convite"], "no scarcity variant without capacity");
  assert.deepEqual(ids({ ...paid, capacity: 0 }), ["curto", "convite"], "zero capacity is not capacity");
  assert.deepEqual(ids({ ...paid, capacity: null, ticketCapacity: 50 }), ["curto", "convite", "ultimos"], "ticket capacity counts");
  for (const variant of lib.promoVariants(paid)) assert.ok(variant.label.length > 0, "variant label");

  const url = lib.promoEventUrl(ORIGIN, paid.id);
  for (const variant of ids(paid)) {
    const message = lib.buildPromoMessage(paid, variant, url);
    assert.ok(message.includes(paid.nome), `${variant}: event name`);
    assert.ok(message.includes(url), `${variant}: absolute URL`);
    assert.ok(message.includes("12 de dezembro"), `${variant}: date`);
    assert.ok(normalizeSpaces(message).includes("R$ 45,90"), `${variant}: price`);
    assert.ok(message.includes("Rua Augusta"), `${variant}: place`);
  }
  const freeMessage = lib.buildPromoMessage(free, "curto", lib.promoEventUrl(ORIGIN, free.id));
  assert.ok(freeMessage.includes("Gratuito"), "free text");
  assert.ok(!freeMessage.includes("R$"), "free has no amount");
  assert.match(lib.buildPromoMessage(paid, "ultimos", url), /[Úú]ltimos ingressos/, "scarcity text");
  assert.ok(!lib.buildPromoMessage(free, "ultimos", url).match(/[Úú]ltimos ingressos/), "scarcity text never appears without capacity");
  const noPlace = lib.buildPromoMessage({ ...paid, endereco: "" }, "curto", url);
  assert.ok(!noPlace.includes("undefined") && !noPlace.includes("null"), "missing fields are omitted cleanly");
}

function checkPromotable(lib) {
  assert.equal(lib.isPromotable("PUBLISHED"), true);
  for (const status of ["PENDING", "DRAFT", "CANCELLED", "ENDED", "CHANGES_REQUESTED", undefined]) assert.equal(lib.isPromotable(status), false, `${status} is not promotable`);
}

function checkStatic() {
  const kit = read("components/MyComponents/promo/EventPromoKit.tsx");
  assert.ok(kit.startsWith('"use client"'), "kit is a client component");
  assert.match(kit, /import\("qrcode"\)/, "reuses the existing qrcode dependency lazily");
  assert.match(kit, /whatsappShareUrl/, "WhatsApp link from pure helper");
  assert.match(kit, /navigator\.share/, "native share when available");
  assert.match(kit, /clipboard/, "clipboard copy");
  assert.match(kit, /execCommand\("copy"\)/, "clipboard fallback");
  assert.match(kit, /window\.open/, "share image falls back to a new tab");
  assert.match(kit, /window\.print/, "printable poster");
  assert.match(kit, /from "react-toastify"/, "toast feedback");
  assert.match(kit, /@\/components\/ui\/dialog/, "accessible dialog primitives");
  assert.match(kit, /<label[^>]+htmlFor=/, "labelled textarea");

  const cards = read("components/MyComponents/CardEvents.tsx");
  assert.match(cards, /isPromotable\(event\.status\) && <EventPromoKit/, "organizer list entry point only for published events");
  const page = read("app/eventos/[id]/page.tsx");
  assert.match(page, /canPromote && <EventPromoKit/, "owner entry point on the public page");
  assert.match(page, /canPromote = [^;]*isPromotable\(event\.status\)/, "public page gate checks the published status");
  assert.match(page, /canPromote = [^;]*viewerId === event\.userId[^;]*"ADMIN"/, "public page gate: owner or admin");
  const css = read("app/globals.css");
  assert.match(css, /em-printing-poster/, "print-only poster CSS");

  const pkg = JSON.parse(read("package.json"));
  assert.ok(pkg.dependencies.qrcode, "qrcode already a dependency");
}

const lib = load("lib/promoKit.ts");
checkUrls(lib);
checkWhatsapp(lib);
checkPriceAndDate(lib);
checkVariants(lib);
checkPromotable(lib);
checkStatic();
console.log("verify-promo-kit: OK");
