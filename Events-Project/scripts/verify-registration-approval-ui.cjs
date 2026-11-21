// Offline static checks for the organizer-approval UI: event form switch, public request flow,
// status labels, ticket purchase gate and the organizer's requests section. No database, network or server.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const plain = (value) => value.replace(/\s+/g, " ");
const match = (source, pattern, message) => assert.ok(pattern.test(source), message ? `${message} (${pattern})` : `missing ${pattern}`);
const noMatch = (source, pattern, message) => assert.ok(!pattern.test(source), message ? `${message} (${pattern})` : `unexpected ${pattern}`);

const checks = [];
const check = (name, fn) => checks.push({ name, fn });

check("event form shows the approval switch and always sends requiresApproval", () => {
  const form = plain(read("components/MyComponents/EventoForm.tsx"));
  match(form, /Aprovar inscrições manualmente/);
  match(form, /Cada pessoa pede para participar e você aprova ou recusa\. Em eventos pagos, a compra só é liberada depois da aprovação\./);
  match(form, /payload\.append\("requiresApproval", String\(/, "FormData carries requiresApproval as \"true\"/\"false\"");
  match(form, /requiresApproval: initialEvent\?\.requiresApproval \?\? true/, "new events default to ON; edits reflect the stored value");
  match(form, /<Switch\b/, "uses the shared Switch component");
  const types = read("types/index.ts");
  match(types, /requiresApproval\?: boolean;/);
});

check("public actions ask to participate and handle PENDING / APPROVED / REJECTED", () => {
  const actions = plain(read("components/MyComponents/EventPublicActions.tsx"));
  for (const status of ["PENDING", "APPROVED", "REJECTED"]) match(actions, new RegExp(`"${status}"`), `${status} in the registration union`);
  match(actions, /requiresApproval\?: boolean/);
  match(actions, /Pedir para participar/);
  match(actions, /Pedido enviado — aguardando aprovação da organização/);
  match(actions, /Cancelar pedido/);
  match(actions, /Participação aprovada — compre seu ingresso/);
  match(actions, /Entre para pedir para participar/);
  match(actions, /não foi aprovada/, "neutral message for a rejected request");
  match(actions, /<TicketPurchase[^>]*approval=/, "paid approval events hand the request block to the purchase panel");
});

check("status badge and agenda label the three request statuses", () => {
  const badge = read("components/ui/status-badge.tsx");
  const union = badge.match(/export type RegistrationStatus = ([^;]+);/);
  assert.ok(union, "RegistrationStatus union exists");
  for (const status of ["PENDING", "APPROVED", "REJECTED"]) {
    assert.ok(union[1].includes(`"${status}"`), `${status} in RegistrationStatus`);
    match(badge, new RegExp(`\\n\\s+${status}: "[^"]+",`), `${status} has a label`);
    match(badge, new RegExp(`\\n\\s+${status}: \\{ tone: "`), `${status} has a tone`);
  }
  const agenda = read("components/MyComponents/home/LoggedHomeAgenda.tsx");
  for (const status of ["PENDING", "APPROVED", "REJECTED"]) match(agenda, new RegExp(`${status}: "`), `agenda label for ${status}`);
});

check("ticket purchase renders the approval gate instead of the buy button", () => {
  const purchase = plain(read("components/MyComponents/tickets/TicketPurchase.tsx"));
  match(purchase, /case "approval":/);
  match(purchase, /approval\?: TicketApproval/);
  match(purchase, /refreshKey/, "the panel reloads after a request changes");
  const approvalCase = purchase.slice(purchase.indexOf('case "approval":'));
  const nextCase = approvalCase.indexOf("case ", 10);
  noMatch(approvalCase.slice(0, nextCase === -1 ? undefined : nextCase), /onBuy/, "no buy button while approval is required");
});

check("check-in page manages requests for owner/admin only", () => {
  const page = plain(read("app/(private)/myEvents/[id]/checkin/page.tsx"));
  match(page, /import RegistrationRequests from "@\/components\/MyComponents\/checkin\/RegistrationRequests"/);
  match(page, /canExport/);
  match(page, /canManageRequests = Boolean\(overview\?\.access\.canExport\)/, "requests gated on canExport");
  match(page, /\{canManageRequests && <RegistrationRequests/, "section rendered only for managers");
  const requests = plain(read("components/MyComponents/checkin/RegistrationRequests.tsx"));
  match(requests, /\/registration-requests/);
  match(requests, /type Decision = "APPROVE" \| "REJECT"/);
  match(requests, /runSingle\(entry, "REJECT"\)/);
  match(requests, /decide\(entry, "APPROVE"\)/);
  match(requests, /Solicitações/);
  match(requests, /method: "POST"/);
  match(requests, /JSON\.stringify\(\{ registrationId: [^,]+, decision \}\)/);
  match(requests, /Aprovar todos/);
  match(requests, /Recusar pedido\?/, "rejecting asks for confirmation");
  match(requests, /Aguardando pagamento/);
  match(requests, /Recusados/);
});

let failed = 0;
for (const { name, fn } of checks) {
  try { fn(); console.log(`ok - ${name}`); }
  catch (error) { failed += 1; console.error(`not ok - ${name}\n  ${error.message}`); }
}
if (failed) { console.error(`${failed} of ${checks.length} registration approval UI checks failed.`); process.exit(1); }
console.log(`All ${checks.length} registration approval UI checks passed.`);
