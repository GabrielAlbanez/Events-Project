// Offline: runs the real queue helpers and checks the wiring of the admin review workspace.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const previous = require.extensions[".ts"];
require.extensions[".ts"] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  module._compile(outputText, filename);
};
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolve.call(this, request.startsWith("@/") ? path.join(root, request.slice(2)) : request, ...rest);
};
const queue = require(path.join(root, "lib/adminReviewQueue.ts"));
Module._resolveFilename = resolve;
if (previous) require.extensions[".ts"] = previous; else delete require.extensions[".ts"];

const now = new Date(2026, 10, 22, 12);
const base = { nome: "Evento", banner: "/b.jpg", carrossel: [], descricao: "Descrição completa o suficiente.", dataInicio: "2026-12-10", dataFim: "2026-12-10", user: null, linkParaCompra: "", endereco: "Rua A", lat: -23, lng: -46, validate: false, status: "PENDING" };
const make = (id, extra = {}) => ({ ...base, id, nome: id, ...extra });
const events = [
  make("newest"),
  make("published", { status: "PUBLISHED", validate: true }),
  make("imported", { aiImport: { sourceUrl: "https://www.sympla.com.br/e/1", sourceVerifiedAt: "2026-11-20" } }),
  make("changes", { status: "CHANGES_REQUESTED" }),
  make("cancelled", { status: "CANCELLED" }),
  make("ended", { status: "ENDED" }),
  make("oldest"),
];

// Counts and default tab
assert.deepEqual(queue.countByTab(events), { pending: 3, published: 1, changes: 1, cancelled: 1, ended: 1, all: 7 });
assert.deepEqual(queue.countByTab(events, true), { pending: 1, published: 0, changes: 0, cancelled: 0, ended: 0, all: 1 });
assert.equal(queue.defaultTab(events), "pending");
assert.equal(queue.defaultTab(events.filter(event => event.status !== "PENDING")), "all");
assert.equal(queue.effectiveStatus({ validate: true }), "PUBLISHED", "legacy row without status");
assert.equal(queue.effectiveStatus({ validate: false }), "PENDING");

// Filter (including the ?importados=pendentes shortcut) and accent-insensitive search
assert.deepEqual(queue.filterQueue(events, { tab: "pending", importedOnly: true, query: "" }).map(event => event.id), ["imported"]);
const accented = [make("a", { organizerName: "Associação Música" }), make("b")];
assert.deepEqual(queue.filterQueue(accented, { tab: "all", importedOnly: false, query: "associacao musica" }).map(event => event.id), ["a"]);

// Sort: pending defaults to oldest, the reverse of the API's updatedAt desc
assert.equal(queue.defaultSort("pending"), "oldest");
assert.equal(queue.defaultSort("published"), "recent");
const pending = queue.filterQueue(events, { tab: "pending", importedOnly: false, query: "" });
const snapshot = pending.map(event => event.id);
assert.deepEqual(queue.sortQueue(pending, "oldest").map(event => event.id), ["oldest", "imported", "newest"]);
assert.deepEqual(pending.map(event => event.id), snapshot, "sort must not mutate its input");
assert.deepEqual(queue.sortQueue([make("late", { dataInicio: "2027-01-01" }), make("bad", { dataInicio: "x" }), make("soon", { dataInicio: "2026-12-01" })], "eventDate").map(event => event.id), ["soon", "late", "bad"]);

// Next pending wraps, skips decided events and ends with null
const order = queue.sortQueue(pending, "oldest");
assert.equal(queue.nextPendingId(order, "oldest"), "imported");
assert.equal(queue.nextPendingId(order, "newest"), "oldest", "wraps around");
assert.equal(queue.nextPendingId(order, "oldest", new Set(["oldest", "imported"])), "newest");
assert.equal(queue.nextPendingId([make("only")], "only"), null);
assert.equal(queue.nextPendingId([make("p", { status: "PUBLISHED" })], "p"), null);

// Data problems come only from loaded fields
assert.deepEqual(queue.reviewProblems(make("ok"), now), []);
const ids = extra => queue.reviewProblems(make("x", extra), now).map(problem => problem.id);
assert.ok(ids({ banner: "" }).includes("banner"));
assert.ok(ids({ endereco: " " }).includes("address"));
assert.ok(ids({ lat: null }).includes("coordinates"));
assert.ok(ids({ dataInicio: "" }).includes("date"));
assert.ok(ids({ dataFim: "2026-12-01" }).includes("date-order"));
assert.ok(ids({ dataInicio: "2026-01-01", dataFim: "2026-01-02" }).includes("past"));
assert.ok(!ids({ dataInicio: "2026-01-01", dataFim: "2026-01-02", status: "ENDED" }).includes("past"), "past is only a pending-review problem");
assert.ok(ids({ isFree: false, priceCents: 0 }).includes("price"));
assert.deepEqual(queue.queueSummary(events, now), { pending: 3, imported: 1, withProblems: 0 });

// Links and formatting
assert.equal(queue.safeHref("javascript:alert(1)"), null);
assert.equal(queue.safeHref("//evil.example/x"), null);
assert.equal(queue.safeHref("data:text/html,x"), null);
assert.equal(queue.safeHref("/uploads/a.jpg"), "/uploads/a.jpg");
assert.equal(queue.safeHref("https://www.sympla.com.br/e/1"), "https://www.sympla.com.br/e/1");
assert.equal(queue.formatPrice({ isFree: true }), "Gratuito");
assert.match(queue.formatPrice({ isFree: false, priceCents: 2500 }), /25,00/);
assert.equal(queue.formatPrice({ isFree: false, priceCents: 0 }), "Preço não informado");
assert.equal(queue.formatSchedule({ dataInicio: "", dataFim: "" }), "Data não informada");

// Wiring
const page = read("app/(publicRoutes)/EventsCreated/page.tsx");
const workspace = read("components/MyComponents/admin/AdminReviewWorkspace.tsx");
const detail = read("components/MyComponents/admin/AdminReviewDetail.tsx");
const dialogs = read("components/MyComponents/admin/AdminReviewDialogs.tsx");
const row = read("components/MyComponents/admin/AdminReviewQueue.tsx");

assert.match(page, /user\?\.role === "ADMIN"\) \{\s*return <AdminReviewWorkspace/, "admin gets the workspace");
for (const text of ["<TableEventsClient", "<PublicEventFilters", "Agenda de eventos", "filterDiscovery(events, discovery)", '"/api/AllEvents"']) assert.ok(page.includes(text), "public agenda keeps " + text);
assert.ok(page.includes('"/api/admin/events"') && page.includes('"update-events"') && page.includes('"events-changed"'), "data and realtime stay wired");

assert.match(workspace, /validate: validateEvents/);
assert.match(workspace, /requestCorrection: solicitarCorrecao/);
assert.match(workspace, /remove: deleteEvents/);
assert.match(workspace, /get\("importados"\) === "pendentes"/);
assert.ok(workspace.includes("Importados aguardando validação") && workspace.includes("Ver todos"));
assert.ok(workspace.includes("Atualizações automáticas indisponíveis") && workspace.includes("Tentar novamente"));

// Never optimistic: list changes only after the server's success check
for (const [name, guard, patch] of [
  ["publish", 'if (!validated.includes(event.id))', 'status: "PUBLISHED"'],
  ["correction", "if (!result.success)", 'status: "CHANGES_REQUESTED"'],
  ["delete", 'if (result.status !== "success") return', "list.filter(item => !ids.includes(item.id))"],
]) assert.ok(workspace.indexOf(guard) > -1 && workspace.indexOf(guard) < workspace.indexOf(patch), name + " waits for the result");

// Destructive actions go through an explicit dialog, without keyboard shortcuts
assert.ok(!/onDelete=\{[^}]*actions\.remove/.test(workspace));
assert.equal((workspace.match(/actions\.remove\(/g) || []).length, 1, "delete has one call site");
assert.ok(workspace.indexOf("async function confirmDelete") < workspace.indexOf("actions.remove("));
assert.ok(workspace.includes("<DeleteDialog") && workspace.includes("onConfirm={confirmDelete}"));
assert.ok(dialogs.includes("Esta ação não pode ser desfeita") && dialogs.includes("Excluir definitivamente") && dialogs.includes('role="alert"'));
assert.match(workspace, /event\.key !== "ArrowDown" && event\.key !== "ArrowUp"/, "the only list shortcuts are navigation");
assert.ok(!/addEventListener\("keydown"/.test(workspace), "no global shortcuts");

// Accessibility contract
for (const text of ['role="tablist"', 'role="tab"', "aria-selected", "aria-controls"]) assert.ok(row.includes(text), text);
assert.ok(workspace.includes('role="tabpanel"') && workspace.includes("SheetTitle") && workspace.includes("motion-reduce"));
assert.ok(detail.includes('rel="noopener noreferrer"') && detail.includes("safeHref"));

console.log("PASS: fila de revisão do admin");
