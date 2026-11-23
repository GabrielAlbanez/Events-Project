const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

// Offline: runs the shared validation and inspects the UI contracts. No browser, server or database.
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function loadSchema() {
  const file = path.join(root, "schemas/eventInput.ts");
  const { outputText } = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const loaded = new Module(file, module);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(root);
  loaded._compile(outputText, file);
  return loaded.exports;
}

const { eventTimeError, normalizeEventTime, parseEventInput } = loadSchema();
const base = { nome: "Evento de teste", descricao: "Descrição detalhada do evento.", endereco: "Rua de teste, 100", dataInicio: "2099-01-02", dataFim: "2099-01-02", startTime: "10:00", endTime: "11:00", isFree: "true", category: "Cultura" };
const parse = (change = {}) => {
  const form = new FormData();
  for (const [key, value] of Object.entries({ ...base, ...change })) form.set(key, value);
  return parseEventInput(form, true);
};

// Format and normalization.
assert.equal(normalizeEventTime("09:30:00"), "09:30", "iOS seconds are dropped");
assert.equal(normalizeEventTime("09:30:15.250"), "09:30", "iOS milliseconds are dropped");
assert.equal(normalizeEventTime(""), "");
assert.equal(normalizeEventTime(null), "");
assert.equal(normalizeEventTime("9:30"), "9:30", "invalid values are not silently repaired");
assert.equal(parse({ startTime: "09:30:00", endTime: "10:45:59" }).data.startTime, "09:30");
assert.equal(parse({ startTime: "09:30:00", endTime: "10:45:59" }).data.endTime, "10:45");
for (const invalid of ["25:00", "9:30", "10:60", "abc", "10:00:99"]) assert.equal(parse({ startTime: invalid, endTime: "" }).success, false, `start ${invalid}`);
for (const invalid of ["24:00", "1:00", "aa:bb"]) assert.equal(parse({ endTime: invalid }).success, false, `end ${invalid}`);

// Range rules.
assert.equal(parse().success, true);
assert.equal(parse({ startTime: "", endTime: "" }).success, true, "times stay optional");
assert.equal(parse({ endTime: "" }).success, true, "start without end is valid");
assert.equal(parse({ endTime: "10:00" }).success, false, "same day: equal times rejected");
assert.equal(parse({ endTime: "09:00" }).success, false, "same day: earlier end rejected");
assert.equal(parse({ dataFim: "2099-01-03", startTime: "22:00", endTime: "02:00" }).success, true, "multi-day may end earlier on the clock");
assert.equal(parse({ startTime: "", endTime: "11:00" }).success, false, "end without start rejected");
assert.match(parse({ startTime: "", endTime: "11:00" }).message, /horário de início/);

// Stored end-only events stay editable only while that value is kept.
assert.equal(parse({ startTime: "", endTime: "11:00", keepStoredEndOnlyTime: "11:00" }).success, true);
assert.equal(parse({ startTime: "", endTime: "12:00", keepStoredEndOnlyTime: "11:00" }).success, false);
assert.equal("keepStoredEndOnlyTime" in parse({ startTime: "", endTime: "11:00", keepStoredEndOnlyTime: "11:00" }).data, false, "marker never reaches the database payload");
assert.equal(eventTimeError({ startTime: "", endTime: "11:00" }, true), null);

// Form contracts.
const form = read("components/MyComponents/EventoForm.tsx");
assert.match(form, /normalizeEventTime\(initialEvent\?\.startTime\)/, "edit loads the stored start");
assert.match(form, /normalizeEventTime\(initialEvent\?\.endTime\)/, "edit loads the stored end");
assert.match(form, /payload\.append\("startTime", values\.startTime\)/);
assert.match(form, /payload\.append\("endTime", values\.endTime\)/);
assert.match(form, /grid-cols-\[minmax\(0,1fr\)\]/, "time grid cannot be widened by the native input");
for (const token of ["min-w-0", "w-full", "appearance-none", "text-base", "md:text-base"]) assert.ok(form.includes(token), `time input: ${token}`);
assert.match(form, /onTextChange=\{\(text\) => \{ field\.onChange\(text\); setCoordinates\(null\); setAddressNeedsPick/, "editing the address clears the coordinates");
assert.match(form, /onPlaceSelect=\{\(\{ address, lat, lng \}\) => \{ field\.onChange\(address\); setCoordinates\(\{ lat, lng \}\); setAddressNeedsPick\(false\)/, "address and coordinates change together");
assert.match(form, /!draft && addressNeedsPick/, "submitting requires picking again");

// Combobox contracts.
const places = read("components/MyComponents/PlaceAutocomplete.tsx");
const combobox = places.slice(places.indexOf("export function PlaceSearchCombobox"));
for (const attribute of ['role="combobox"', 'aria-autocomplete="list"', "aria-expanded=", "aria-controls=", "aria-activedescendant=", 'role="listbox"', 'role="option"', "aria-selected="]) assert.ok(combobox.includes(attribute), attribute);
for (const key of ["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab"]) assert.ok(combobox.includes(`"${key}"`), `key ${key}`);
assert.match(combobox, /onMouseDown=\{event => event\.preventDefault\(\)\}/, "tap keeps focus on the input");
assert.doesNotMatch(combobox, /onBlur=\{\(\) => (?:close|setOpen)/, "blur never closes the list before the tap lands");
assert.match(combobox, /setTimeout\(\(\) => \{ timerRef\.current = null; void search/, "debounced search");
assert.match(combobox, /if \(!tokenRef\.current\) tokenRef\.current = new places\.AutocompleteSessionToken\(\)/, "session token reused while typing");
assert.match(combobox, /tokenRef\.current = null;\n\s*setOptions\(\[\]\)/, "new session after a pick");
assert.match(combobox, /removeEventListener\("pointerdown"/);
assert.match(combobox, /viewport\?\.removeEventListener\("resize"/);
assert.match(combobox, /visualViewport/, "list respects the on-screen keyboard");

// Organizer on the own event.
const actions = read("components/MyComponents/EventPublicActions.tsx");
for (const guarded of ["showParticipation && ticketSale && registrationOpen && <TicketPurchase", "showParticipation && sellsElsewhere", "showParticipation && !ticketSale", "showParticipation && ticketUrl", "showStickyBar = showParticipation"]) assert.ok(actions.includes(guarded), guarded);
assert.match(actions, /viewerIsOwner \?\? \(status === "authenticated"/, "server answer wins over the session");
assert.match(actions, /ownershipPending = viewerIsOwner === undefined && Boolean\(ownerId\) && status === "loading"/, "no flash while the session loads");
const page = read("app/eventos/[id]/page.tsx");
assert.match(page, /viewerIsOwner = Boolean\(viewerId\) && viewerId === event\.userId/, "ownership is only the event owner, not admins");
assert.match(page, /viewerIsOwner=\{viewerIsOwner\}/);
for (const label of ["Você organiza este evento", "Editar", "Check-in", "Solicitações", "Destacar", "Pagamentos"]) assert.ok(page.includes(label), label);
assert.match(page, /checkin#solicitacoes/);

console.log("PASS event-form-mobile: time rules, address/coordinates, combobox contracts and organizer view");
