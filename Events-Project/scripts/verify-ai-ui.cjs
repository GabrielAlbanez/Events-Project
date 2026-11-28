// Offline checks for the Gemini features in the UI: "Escrever com IA", tips before sending, promotion texts,
// natural-language search and the quick summary. Static wiring checks only: no database, network or server.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const plain = (value) => value.replace(/\s+/g, " ");
const has = (source, pattern, message) => assert.match(source, pattern, message);

const AI = "components/MyComponents/ai/";

function checkDraft() {
  const dialog = plain(read(AI + "EventAiDraftDialog.tsx"));
  has(dialog, /^"use client";/, "draft dialog is a client component");
  has(dialog, /import \{ draftEventAction \} from "@\/app\/\(actions\)\/ai\/action"/, "draft dialog uses draftEventAction");
  has(dialog, /payload\.append\("text", text\.slice\(0, 4000\)\)/, "text is sent and capped at 4000");
  has(dialog, /payload\.append\("image", poster\)/, "poster is sent as image");
  has(dialog, /prepareAiImage\(/, "poster goes through the client-side resize");
  has(dialog, /Cole aqui a descrição, o post ou a mensagem do evento/, "textarea label");
  has(dialog, /Enviar foto do cartaz/, "poster option");
  has(dialog, /Aplicar ao formulário/, "apply button");
  has(dialog, /Confira tudo antes de enviar — a IA pode errar\./, "AI disclaimer");
  has(dialog, /Usar o cartaz como capa/, "poster as cover option");
  has(dialog, /Confirme o endereço no mapa/, "address confirmation hint");
  has(dialog, /aria-live="polite"/, "async result is announced");
  has(dialog, /role="alert"/, "errors are announced");
  has(dialog, /!filled\[field\]/, "fields that already have a value start unchecked");
  has(dialog, /setError\(result\.error\)/, "server message is shown as is");

  const image = read(AI + "aiImage.ts");
  has(image, /3\.5 \* 1024 \* 1024/, "poster target stays under ~3.5 MB");
  has(image, /image\/jpeg", "image\/png", "image\/webp"/, "only JPG/PNG/WebP");

  const form = plain(read("components/MyComponents/EventoForm.tsx"));
  has(form, /import \{ EventAiDraftDialog, type DraftField \} from "\.\/ai\/EventAiDraftDialog"/, "form imports the draft dialog");
  has(form, /<EventAiDraftDialog filled=\{aiFilled\}[^>]*onApply=\{applyAiDraft\}/, "draft dialog rendered with apply handler");
  has(form, /form\.setValue\(name, value, \{ shouldDirty: true, shouldValidate: true \}\)/, "applies through setValue with dirty + validate");
  for (const field of ["nome", "descricao", "category", "startTime", "endTime", "endereco", "isFree", "price", "organizerName", "ageRating", "LinkParaCompraIngresso"]) {
    has(form, new RegExp(`set\\((?:"${field}"|field)`), `applies ${field}`);
  }
  has(form, /setDateRange\(start\.compare\(end\) <= 0/, "dates go to the dateRange state");
  has(form, /setCoordinates\(null\);[^}]*setAddressNeedsPick\(mapsLoaded && addressMode === "search"\)/, "address never invents coordinates and asks for a pick");
  has(form, /if \(poster && !banner && !initialEvent\?\.banner[^)]*\) showBannerFile\(poster\)/, "poster becomes the cover only without one");
}

function checkTips() {
  const dialog = plain(read(AI + "EventAiTipsDialog.tsx"));
  has(dialog, /Dicas antes de enviar/, "tips title");
  has(dialog, /Enviar mesmo assim/, "send anyway");
  has(dialog, /Ajustar/, "adjust");
  has(dialog, /Lightbulb/, "lamp icon");
  has(dialog, /aria-live="polite"/, "tips are announced");

  const form = plain(read("components/MyComponents/EventoForm.tsx"));
  has(form, /import \{ eventTipsAction \} from "@\/app\/\(actions\)\/ai\/action"/, "form imports eventTipsAction");
  has(form, /eventTipsAction\(payload\)/, "form calls eventTipsAction");
  for (const field of ["nome", "descricao", "category", "dataInicio", "dataFim", "endereco", "lat", "lng", "isFree", "price", "ticketsEnabled", "LinkParaCompraIngresso"]) {
    has(form, new RegExp(`payload\\.append\\("${field}"`), `tips payload sends ${field}`);
  }
  has(form, /payload\.append\("banner", banner\)/, "tips send the new banner");
  has(form, /payload\.append\("bannerUrl", initialEvent\.banner\)/, "tips send the stored banner URL");
  has(form, /if \(!draft && !tipsReviewed\) \{ reviewWithAi\(values, reviewConfirmed\); return; \}/, "tips run before a real submission, never for drafts");
  has(form, /if \(!result\.ok\) \{ unavailable\(\); return; \}/, "failing tips do not block");
  has(form, /\.catch\(unavailable\)/, "network failure does not block");
  has(form, /onSubmit\(values, reviewConfirmed, true\)/, "submission continues after tips");
  has(form, /onSubmit\(values, true, true\)/, "review prompt does not ask for tips again");
}

function checkPromo() {
  const copy = plain(read(AI + "EventAiPromoCopy.tsx"));
  has(copy, /import \{ promoCopyAction \} from "@\/app\/\(actions\)\/ai\/action"/, "promo uses promoCopyAction");
  has(copy, /promoCopyAction\(eventId\)/, "promo action called with the event id");
  has(copy, /Textos com IA/, "section title");
  has(copy, /Gerar com IA/, "generate button");
  has(copy, /Gerar outra versão/, "regenerate button");
  has(copy, /copy\.instagram/, "instagram text");
  has(copy, /copy\.whatsapp/, "whatsapp text");
  has(copy, /copy\.stories\.join/, "stories text");
  has(copy, /Copiar/, "copy buttons");
  has(copy, /aria-live="polite"/, "result announced");
  has(copy, /setError\(result\.error\)/, "server message shown");

  const kit = plain(read("components/MyComponents/promo/EventPromoKit.tsx"));
  has(kit, /event\.status === "PUBLISHED" && <EventAiPromoCopy eventId=\{event\.id\} onCopy=\{handleCopyAiText\}/, "kit shows AI texts for published events");
  has(kit, /if \(await copyText\(text\)\) notify\(success\)/, "kit copy helper reused");
  has(kit, /Mensagem para WhatsApp/, "original kit content kept");
}

function checkSearch() {
  const box = plain(read(AI + "AiSearchBox.tsx"));
  has(box, /fetch\("\/api\/ai\/search", \{ method: "POST"/, "search posts to /api/ai/search");
  has(box, /JSON\.stringify\(\{ q, categories: categories\.slice\(0, 40\) \}\)/, "sends q and categories");
  has(box, /Buscar com IA/, "mode label");
  has(box, /Sparkles/, "sparkles icon");
  has(box, /Buscando:<\/span> \{understood\}/, "understood sentence");
  has(box, /aria-label="Limpar busca com IA"/, "clear button");
  has(box, /aria-live="polite"/, "result announced");
  has(box, /setError\(data\.error\)/, "server message shown");

  const home = plain(read("components/MyComponents/home/HomeDiscoveryClient.tsx"));
  has(home, /<AiSearchBox className="order-2" categories=\{categories\} onApply=\{applyAiSearch\} onClear=\{clearAiSearch\} \/>/, "home renders the AI search with the loaded categories");
  has(home, /setSearch\(intent\.q/, "q → search");
  has(home, /intent\.periodo/, "periodo → period");
  has(home, /category: categories\.includes\(intent\.categoria\)/, "categoria → discovery.category");
  has(home, /free: intent\.gratis/, "gratis → discovery.free");
  has(home, /maxPrice: \/\^\\d\{1,6\}/, "preco → discovery.maxPrice");
  has(home, /if \(intent\.nearMe && !discovery\.origin\) \{ aiNearMe\.current = true; void locateMe\(\); \}/, "nearMe uses the existing locate function");
}

function checkSummary() {
  const summary = plain(read(AI + "EventAiSummary.tsx"));
  has(summary, /fetch\(`\/api\/events\/\$\{encodeURIComponent\(eventId\)\}\/ai-summary`/, "summary fetches the route");
  for (const label of ["O que é", "Para quem", "O que levar", "Resumo gerado por IA a partir da descrição."]) assert.ok(summary.includes(label), `summary shows ${label}`);
  has(summary, /if \(state\.status === "empty"\) return null;/, "nothing rendered without a summary");
  has(summary, /h-\[124px\] animate-pulse/, "fixed-height skeleton");
  has(summary, /controller\.abort\(\)/, "fetch is cancelled on unmount");

  const page = plain(read("app/eventos/[id]/page.tsx"));
  has(page, /import \{ EventAiSummary \} from "@\/components\/MyComponents\/ai\/EventAiSummary"/, "page imports the summary");
  has(page, /<section aria-labelledby="event-about-title">\{event\.status === "PUBLISHED" && !preview && <EventAiSummary eventId=\{event\.id\} \/>\}<h2 id="event-about-title"/, "summary sits above 'Sobre o evento', published only, never on preview");
}

function checkBoundaries() {
  for (const file of fs.readdirSync(path.join(root, AI))) {
    const source = read(AI + file);
    assert.doesNotMatch(source, /GEMINI|process\.env/, `${file} never touches server secrets`);
    if (file.endsWith(".tsx")) has(source, /^"use client";/, `${file} is a client component`);
  }
}

checkDraft();
checkTips();
checkPromo();
checkSearch();
checkSummary();
checkBoundaries();
console.log("verify-ai-ui: OK");
