// Offline checks: the organizer's event list carries the pending approval count and the ticket flags
// (so My events can show "Solicitações (N)" and the coupon manager). No database, no network.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const ts = require("typescript");

globalThis.fetch = async () => { throw new Error("real network is forbidden in offline tests"); };

let lastQuery = null;
let actor = { id: "promoter", role: "PROMOTER" };
const rows = [
  { id: "ev-1", nome: "Festa", validate: true, requiresApproval: true, ticketsEnabled: false, aiImport: null, _count: { registrations: 3 } },
  { id: "ev-2", nome: "Importado", validate: null, requiresApproval: true, ticketsEnabled: true, aiImport: { sourceUrl: "https://x.test" }, _count: { registrations: 2 } },
];
const prisma = {
  user: { findUnique: async () => ({ id: "promoter" }) },
  events: { findMany: async (query) => { lastQuery = query; return rows.map((row) => ({ ...row })); } },
};
const stubs = {
  "@/lib/prisma": { __esModule: true, default: prisma },
  "@/lib/adminAuth": { getAuthenticatedUser: async () => actor },
  "@/lib/eventQueries": { publicEventSelect: { id: true, nome: true, aiImport: { select: { sourceUrl: true } } } },
};
function load(file) {
  const source = ts.transpileModule(fs.readFileSync(path.resolve(file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", source)((name) => (Object.hasOwn(stubs, name) ? stubs[name] : require(name)), mod, mod.exports);
  return mod.exports;
}

(async () => {
  const { getForEventsForUserById } = load("app/(actions)/getForEventsByUserId/action.ts");
  const result = await getForEventsForUserById("promoter");
  assert.equal(result.status, "success");
  const select = lastQuery.select;
  assert.equal(select.ticketsEnabled, true, "ticket flag loaded for the coupon manager");
  assert.equal(select.requiresApproval, true);
  assert.deepEqual(select._count, { select: { registrations: { where: { status: "PENDING" } } } }, "counts only pending requests");
  const [own, imported] = result.events;
  assert.equal(own.pendingRequests, 3);
  assert.equal(imported.pendingRequests, 0, "imported events never wait for approval");
  assert.equal("_count" in own, false, "raw _count is not sent to the client");
  const types = fs.readFileSync("types/index.ts", "utf8");
  assert.match(types, /pendingRequests\?: number;/);

  actor = { id: "other", role: "BASIC" };
  assert.equal((await getForEventsForUserById("promoter")).status, "error", "only the owner or an admin");
  const card = fs.readFileSync("components/MyComponents/CardEvents.tsx", "utf8");
  assert.match(card, /\/checkin#solicitacoes`/, "card links to the requests section");
  assert.match(card, /event\.status === "PUBLISHED" && \(event\.pendingRequests \?\? 0\) > 0/, "link only for published events with pending requests");
  assert.match(card, /"1 pedido de participação aguardando aprovação"/, "singular aria label");
  assert.match(card, /pedidos de participação aguardando aprovação/, "plural aria label");
  assert.match(card, /event\.ticketsEnabled && !event\.isFree.*<TicketCoupons /, "coupon manager gated on ticketsEnabled");
  const requestsUi = fs.readFileSync("components/MyComponents/checkin/RegistrationRequests.tsx", "utf8");
  assert.match(requestsUi, /<section id="solicitacoes"[^>]*scroll-mt-24/, "requests section is hash-linkable");
  console.log("PASS my events requests: pending approval count and ticket flags in the organizer's list.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
