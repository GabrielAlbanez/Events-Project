// Offline checks for paid event highlights (Pix manual + admin review).
// Pure helpers in lib/promotions.ts and the real service against in-memory persistence.
// No database, network or production writes.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const ts = require("typescript");

let db;
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const resolve = (name) => {
    if (name === "@/lib/prisma") return { __esModule: true, get default() { return db; } };
    if (name.startsWith("@/")) return load(name.slice(2) + ".ts");
    if (name.startsWith(".")) {
      const base = path.resolve(path.dirname(file), name.replace(/\.js$/, ""));
      return load(fs.existsSync(base + ".ts") ? base + ".ts" : base + ".tsx");
    }
    return require(name);
  };
  new Function("require", "module", "exports", source)(resolve, mod, mod.exports);
  return mod.exports;
}

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2099-03-10T15:00:00.000Z");
const clock = () => NOW;

function checkPackages(lib) {
  const three = lib.getPromotionPackage("3d");
  const seven = lib.getPromotionPackage("7d");
  assert.deepEqual([three.days, three.amountCents], [3, 2900], "3 dias = R$ 29,00");
  assert.deepEqual([seven.days, seven.amountCents], [7, 5900], "7 dias = R$ 59,00");
  assert.equal(lib.getPromotionPackage("30d"), null, "unknown package is rejected");
  assert.equal(lib.getPromotionPackage("__proto__"), null, "prototype keys are not packages");
  assert.equal(lib.PROMOTION_PACKAGES.length, 2);
  assert.equal(lib.formatPromotionAmount(2900).replace(/\s/g, " "), "R$ 29,00");
  assert.equal(lib.formatPromotionAmount(5900).replace(/\s/g, " "), "R$ 59,00");
  assert.equal(lib.MAX_FEATURED_ON_TOP, 3);
  assert.equal(lib.PROMOTION_NOTE_MAX, 200);
}

function checkActiveWindow(lib) {
  const active = { status: "ACTIVE", startsAt: new Date(NOW.getTime() - DAY), endsAt: new Date(NOW.getTime() + DAY) };
  assert.equal(lib.isPromotionActive(active, NOW), true);
  assert.equal(lib.isPromotionActive({ ...active, startsAt: NOW }, NOW), true, "starts inclusive");
  assert.equal(lib.isPromotionActive({ ...active, endsAt: NOW }, NOW), false, "ends exclusive");
  assert.equal(lib.isPromotionActive({ ...active, startsAt: new Date(NOW.getTime() + 1) }, NOW), false, "scheduled (stacked) is not active yet");
  assert.equal(lib.isPromotionActive({ ...active, status: "REJECTED" }, NOW), false);
  assert.equal(lib.isPromotionActive({ ...active, status: "AWAITING_REVIEW" }, NOW), false);
  assert.equal(lib.isPromotionActive({ status: "ACTIVE", startsAt: null, endsAt: null }, NOW), false);
  assert.equal(lib.isPromotionActive({ ...active, startsAt: active.startsAt.toISOString(), endsAt: active.endsAt.toISOString() }, NOW), true, "serialized dates");
}

function checkStacking(lib) {
  const fresh = lib.computeActivationWindow(3, NOW, []);
  assert.equal(fresh.startsAt.getTime(), NOW.getTime(), "no active highlight: starts now");
  assert.equal(fresh.endsAt.getTime(), NOW.getTime() + 3 * DAY);
  const current = { endsAt: new Date(NOW.getTime() + 2 * DAY) };
  const later = { endsAt: new Date(NOW.getTime() + 5 * DAY) };
  const expired = { endsAt: new Date(NOW.getTime() - DAY) };
  const stacked = lib.computeActivationWindow(7, NOW, [expired, current]);
  assert.equal(stacked.startsAt.getTime(), current.endsAt.getTime(), "stacks after the current highlight");
  assert.equal(stacked.endsAt.getTime(), current.endsAt.getTime() + 7 * DAY);
  const chain = lib.computeActivationWindow(3, NOW, [current, later, { endsAt: null }]);
  assert.equal(chain.startsAt.getTime(), later.endsAt.getTime(), "stacks after the latest scheduled end");
  assert.equal(lib.computeActivationWindow(3, NOW, [expired]).startsAt.getTime(), NOW.getTime(), "expired highlight does not delay");
}

function checkOrdering(lib) {
  const events = Array.from({ length: 9 }, (_, index) => ({ id: "e" + index, featured: [1, 3, 5, 6, 8].includes(index) || undefined }));
  const snapshot = JSON.stringify(events);
  const ordered = lib.prioritizeFeatured(events);
  assert.deepEqual(ordered.slice(0, 3).map((event) => event.id), ["e1", "e3", "e5"], "first three featured, by original (date) order");
  assert.deepEqual(ordered.slice(3).map((event) => event.id), ["e0", "e2", "e4", "e6", "e7", "e8"], "the rest keeps its normal order");
  assert.equal(JSON.stringify(events), snapshot, "input is not mutated");
  const plain = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(lib.prioritizeFeatured(plain).map((event) => event.id), ["a", "b"]);
  assert.deepEqual(lib.prioritizeFeatured(events, 1).slice(0, 2).map((event) => event.id), ["e1", "e0"]);
}

function checkEligibility(lib) {
  const event = { userId: "owner", status: "PUBLISHED", dataFim: "2099-03-12", endTime: "22:00", timezone: "America/Sao_Paulo" };
  assert.equal(lib.promotionEligibility(event, "owner", NOW), null);
  assert.equal(lib.promotionEligibility({ ...event, dataFim: "2099-03-12T00:00:00.000Z" }, "owner", NOW), null, "legacy ISO end date");
  assert.match(lib.promotionEligibility(event, "other", NOW), /organizador/i);
  assert.match(lib.promotionEligibility(null, "owner", NOW), /não encontrado/i);
  assert.match(lib.promotionEligibility({ ...event, status: "PENDING" }, "owner", NOW), /publicado/i);
  assert.match(lib.promotionEligibility({ ...event, dataFim: "2099-03-01" }, "owner", NOW), /encerrado/i);
  assert.equal(lib.shortPromotionCode("3f2a9c1e-77aa-4d1b-9c55-0123456789ab"), "3F2A9C1E");
  assert.match(lib.formatPromotionDate(new Date("2099-03-15T02:00:00.000Z")), /^14\/03$/, "DD/MM in São Paulo time");
}

// Minimal Prisma-like store for the shapes used by lib/services/promotions.ts.
function matches(row, where) {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("in" in value) return value.in.includes(row[key]);
      if ("gt" in value) return row[key] != null && row[key] > value.gt;
      if ("lte" in value) return row[key] != null && row[key] <= value.lte;
      return true;
    }
    return row[key] === value;
  });
}
function table(rows, relations = {}) {
  const hydrate = (row) => {
    const copy = { ...row };
    for (const [name, resolveRelation] of Object.entries(relations)) copy[name] = resolveRelation(row);
    return copy;
  };
  let sequence = 0;
  return {
    rows,
    findFirst: async (q) => { const row = rows.find((item) => matches(item, q.where)); return row ? hydrate(row) : null; },
    findMany: async (q) => rows.filter((row) => matches(row, q?.where)).map(hydrate),
    create: async (q) => { const row = { id: `00000000-0000-4000-8000-00000000000${++sequence}`, createdAt: NOW, updatedAt: NOW, status: "PENDING_PAYMENT", payerNote: null, reviewNote: null, reviewedBy: null, reviewedAt: null, startsAt: null, endsAt: null, ...q.data }; rows.push(row); return hydrate(row); },
    createMany: async (q) => { for (const data of q.data) rows.push({ id: "n" + rows.length, ...data }); return { count: q.data.length }; },
    updateMany: async (q) => { const hit = rows.filter((row) => matches(row, q.where)); for (const row of hit) Object.assign(row, q.data); return { count: hit.length }; },
  };
}
function freshDb() {
  const events = [
    { id: "event-1", nome: "Festival de Inverno", userId: "owner", status: "PUBLISHED", dataInicio: "2099-03-11", dataFim: "2099-03-20", endTime: null, timezone: "America/Sao_Paulo" },
    { id: "event-draft", nome: "Rascunho", userId: "owner", status: "DRAFT", dataInicio: "2099-03-11", dataFim: "2099-03-20", endTime: null, timezone: "America/Sao_Paulo" },
  ];
  const users = [{ id: "owner", role: "PROMOTER", name: "Org", email: "org@example.test", suspendedAt: null }, { id: "admin", role: "ADMIN", name: "Admin", email: "admin@example.test", suspendedAt: null }];
  const notifications = [];
  const store = {
    events: table(events), user: table(users), notification: table(notifications),
  };
  store.eventPromotion = table([], {
    event: (row) => events.find((event) => event.id === row.eventId) ?? null,
    user: (row) => users.find((user) => user.id === row.userId) ?? null,
  });
  store.$transaction = async (fn) => fn(store);
  return store;
}

async function checkService() {
  const service = load("lib/services/promotions.ts");
  const owner = async () => ({ id: "owner", role: "PROMOTER" });
  const stranger = async () => ({ id: "stranger", role: "BASIC" });
  const anonymous = async () => null;
  const admin = async () => "admin";
  const notAdmin = async () => null;

  db = freshDb();
  delete process.env.FEATURED_PIX_KEY; delete process.env.FEATURED_PIX_NAME;
  const unavailable = await service.createPromotionOrder({ eventId: "event-1", packageId: "3d" }, owner, clock);
  assert.equal(unavailable.success, false);
  assert.match(unavailable.message, /indisponível/i, "no Pix key: orders cannot be created");
  const overviewWithoutPix = await service.getPromotionOverview("event-1", owner, clock);
  assert.equal(overviewWithoutPix.success && overviewWithoutPix.data.payment, null, "overview exposes the unavailable state");

  process.env.FEATURED_PIX_KEY = "pix@example.test"; process.env.FEATURED_PIX_NAME = "EventMap Teste";
  assert.equal((await service.createPromotionOrder({ eventId: "event-1", packageId: "3d" }, anonymous, clock)).success, false, "requires a session");
  assert.equal((await service.createPromotionOrder({ eventId: "event-1", packageId: "3d" }, stranger, clock)).success, false, "only the owner");
  assert.equal((await service.createPromotionOrder({ eventId: "event-draft", packageId: "3d" }, owner, clock)).success, false, "only published events");
  assert.equal((await service.createPromotionOrder({ eventId: "event-1", packageId: "30d" }, owner, clock)).success, false, "unknown package");
  assert.equal((await service.createPromotionOrder({ eventId: "event-1", packageId: "3d", amountCents: 1 }, owner, clock)).success, false, "client cannot send a price");
  assert.equal((await service.getPromotionOverview("event-1", stranger, clock)).success, false, "overview is owner-only");
  assert.equal(db.eventPromotion.rows.length, 0);

  const created = await service.createPromotionOrder({ eventId: "event-1", packageId: "7d" }, owner, clock);
  assert.equal(created.success, true, created.message);
  const order = db.eventPromotion.rows[0];
  assert.deepEqual([order.days, order.amountCents, order.status, order.userId], [7, 5900, "PENDING_PAYMENT", "owner"], "price and days come from the server");
  assert.equal((await service.createPromotionOrder({ eventId: "event-1", packageId: "3d" }, owner, clock)).success, false, "one open order per event");

  assert.equal((await service.markPromotionPaid({ promotionId: order.id, note: "x".repeat(201) }, owner, clock)).success, false, "note up to 200 characters");
  assert.equal((await service.markPromotionPaid({ promotionId: order.id }, stranger, clock)).success, false, "only the requester confirms payment");
  assert.equal((await service.reviewPromotion({ promotionId: order.id, decision: "confirm" }, admin, clock)).success, false, "cannot confirm before payment is reported");
  const paid = await service.markPromotionPaid({ promotionId: order.id, note: "  Pago por Maria  " }, owner, clock);
  assert.equal(paid.success, true, paid.message);
  assert.deepEqual([order.status, order.payerNote], ["AWAITING_REVIEW", "Pago por Maria"]);
  assert.ok(db.notification.rows.some((notice) => notice.userId === "admin" && notice.href === "/admin/destaques"), "admins are told about the payment");
  assert.equal((await service.cancelPromotionOrder({ promotionId: order.id }, owner, clock)).success, false, "cannot cancel after reporting payment");

  assert.equal((await service.reviewPromotion({ promotionId: order.id, decision: "confirm" }, notAdmin, clock)).success, false, "admin only");
  assert.equal((await service.listPromotionReview(notAdmin, clock)).success, false, "queue is admin only");
  const queue = await service.listPromotionReview(admin, clock);
  assert.equal(queue.success && queue.data.queue.length, 1);
  const confirmed = await service.reviewPromotion({ promotionId: order.id, decision: "confirm" }, admin, clock);
  assert.equal(confirmed.success, true, confirmed.message);
  assert.equal(order.status, "ACTIVE");
  assert.equal(order.startsAt.getTime(), NOW.getTime());
  assert.equal(order.endsAt.getTime(), NOW.getTime() + 7 * DAY);
  assert.equal(order.reviewedBy, "admin");
  assert.ok(db.notification.rows.some((notice) => notice.userId === "owner" && /aprovado/i.test(notice.title)), "organizer is notified");
  assert.equal((await service.reviewPromotion({ promotionId: order.id, decision: "confirm" }, admin, clock)).success, false, "cannot confirm twice");

  // Stacking: a second paid order starts when the current highlight ends.
  const second = await service.createPromotionOrder({ eventId: "event-1", packageId: "3d" }, owner, clock);
  assert.equal(second.success, true, "new order allowed while a highlight is active");
  const secondRow = db.eventPromotion.rows[1];
  await service.markPromotionPaid({ promotionId: secondRow.id }, owner, clock);
  await service.reviewPromotion({ promotionId: secondRow.id, decision: "confirm" }, admin, clock);
  assert.equal(secondRow.startsAt.getTime(), order.endsAt.getTime(), "stacks after the active highlight");
  assert.equal(secondRow.endsAt.getTime(), order.endsAt.getTime() + 3 * DAY);

  // Rejection requires a reason and notifies the organizer; cancel works only while pending payment.
  const third = await service.createPromotionOrder({ eventId: "event-1", packageId: "3d" }, owner, clock);
  const thirdRow = db.eventPromotion.rows[2];
  assert.equal(third.success, true);
  await service.markPromotionPaid({ promotionId: thirdRow.id }, owner, clock);
  assert.equal((await service.reviewPromotion({ promotionId: thirdRow.id, decision: "reject", reason: "" }, admin, clock)).success, false, "reason required");
  const rejected = await service.reviewPromotion({ promotionId: thirdRow.id, decision: "reject", reason: "Pix não localizado" }, admin, clock);
  assert.equal(rejected.success, true);
  assert.deepEqual([thirdRow.status, thirdRow.reviewNote], ["REJECTED", "Pix não localizado"]);
  assert.ok(db.notification.rows.some((notice) => notice.userId === "owner" && /recusado/i.test(notice.title)));
  const fourth = await service.createPromotionOrder({ eventId: "event-1", packageId: "3d" }, owner, clock);
  const fourthRow = db.eventPromotion.rows[3];
  assert.equal(fourth.success, true);
  assert.equal((await service.cancelPromotionOrder({ promotionId: fourthRow.id }, stranger, clock)).success, false);
  assert.equal((await service.cancelPromotionOrder({ promotionId: fourthRow.id }, owner, clock)).success, true);
  assert.equal(fourthRow.status, "CANCELLED");

  const overview = await service.getPromotionOverview("event-1", owner, clock);
  assert.equal(overview.success, true);
  assert.equal(overview.data.payment.key, "pix@example.test");
  assert.equal(overview.data.open, null);
  assert.equal(new Date(overview.data.activeUntil).getTime(), secondRow.endsAt.getTime(), "active until the end of the stacked chain");
  assert.equal(overview.data.packages.length, 2);

  // Catalog annotation only flags events with a highlight running now.
  const { listFeaturedEventIds } = load("lib/eventQueries.ts");
  const ids = await listFeaturedEventIds(["event-1", "event-draft"], clock);
  assert.deepEqual([...ids], ["event-1"]);
  const later = await listFeaturedEventIds(["event-1"], () => new Date(secondRow.endsAt.getTime() + 1));
  assert.equal(later.size, 0, "expired highlight is not featured (no cron needed)");
}

function checkWiring() {
  const queries = fs.readFileSync("lib/eventQueries.ts", "utf8");
  assert.match(queries, /listFeaturedEventIds/, "catalog reads active highlights");
  assert.match(queries, /prioritizeFeatured/, "catalog orders featured first");
  const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
  assert.match(schema, /model EventPromotion[\s\S]*@@map\("event_promotions"\)/);
  const actions = fs.readFileSync("app/(actions)/promotions/action.ts", "utf8");
  assert.match(actions, /^"use server";/);
  assert.match(actions, /getAuthenticatedAdminId/);
}

function checkUiWiring() {
  const panel = fs.readFileSync("components/MyComponents/promotions/PromoteEventPanel.tsx", "utf8");
  assert.doesNotMatch(panel, /NEXT_PUBLIC_FEATURED|process\.env/, "Pix key never reaches client code directly");
  const badge = fs.readFileSync("components/MyComponents/FeaturedBadge.tsx", "utf8");
  assert.match(badge, /aria-label="Evento em destaque patrocinado"/);
}

(async () => {
  const lib = load("lib/promotions.ts");
  checkPackages(lib);
  checkActiveWindow(lib);
  checkStacking(lib);
  checkOrdering(lib);
  checkEligibility(lib);
  await checkService();
  checkWiring();
  console.log("PASS promotions: server-side packages, active window, stacking, top-3 ordering, owner/admin guards and notifications.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
