// Offline checks for the multi-ticket UI: checkout quantity, one QR per ticket, door messages and financial summaries.
// Static wiring checks plus the pure totals rule. No database, network or server.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function loadTickets() {
  const stub = { eventInstant: () => null };
  const source = ts.transpileModule(read("lib/tickets.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", source)(() => stub, mod, mod.exports);
  return mod.exports;
}

function checkTotals({ ticketOrderTotals, TICKET_MAX_PER_ORDER, TICKET_FEE_PERCENT }) {
  assert.equal(TICKET_MAX_PER_ORDER, 6);
  assert.equal(TICKET_FEE_PERCENT, 10);
  assert.deepEqual(ticketOrderTotals(5000, 3), { grossCents: 15000, feeCents: 1500, netCents: 13500 });
  assert.deepEqual(ticketOrderTotals(1999, 3), { grossCents: 5997, feeCents: 600, netCents: 5397 }, "fee rounds once, on the order total");
}

function checkCheckout() {
  const source = read("components/MyComponents/tickets/TicketPurchase.tsx");
  assert.match(source, /createTicketOrder\(\{ eventId, quantity: selectedQuantity,/, "sends the quantity");
  assert.match(source, /purchase\?\.maxQuantity/, "limited by the server");
  assert.match(source, /Math\.min\(quantity, maxQuantity\)/, "never above the limit");
  assert.match(source, /aria-label="Diminuir quantidade de ingressos"/);
  assert.match(source, /aria-label="Aumentar quantidade de ingressos"/);
  assert.match(source, /h-11 w-11/, "44px touch targets");
  assert.match(source, /applied\.finalCents \* quantity/, "coupon preview is per ticket");
  assert.match(source, /applied\.discountCents \* quantity/, "discount total");
  assert.match(source, /formatTicketAmount\(order\.totalCents\)/, "pending Pix shows the real total");
  assert.doesNotMatch(source, /formatTicketAmount\(order\.unitCents\)/, "unit price is never the order total");
}

function checkPasses() {
  const pass = read("components/MyComponents/CheckInPass.tsx");
  assert.match(pass, /passId\?: string/, "optional pass");
  assert.match(pass, /\?pass=\$\{encodeURIComponent\(passId\)\}/, "pass token request");
  assert.match(pass, /response\.status === 409/, "used pass clears the QR");
  const page = read("app/(private)/ingressos/page.tsx");
  assert.match(page, /Ingresso \$\{position\} de \$\{ticket\.quantity\}/, "each ticket labelled");
  assert.match(page, /<CheckInPass eventId=\{ticket\.eventId\} passId=\{pass\?\.id\} label=\{label\}/, "one QR per ticket");
  assert.match(page, /position === 1 \? ticket\.ownTicketStatus : pass\?\.status/, "ticket 1 uses the registration state");
  assert.match(page, /status === "USED"/);
  assert.match(page, /status === "CANCELLED"/);
  assert.match(page, /ticket\.status === "PAID" && <OrderTickets/, "QR only for paid orders");
  assert.match(page, /formatTicketAmount\(ticket\.totalCents\)/);
  assert.doesNotMatch(page, /<Link[^>]*>\s*<CheckInPass/, "no buttons inside links");
}

function checkDoor() {
  const source = read("app/(private)/myEvents/[id]/checkin/page.tsx");
  assert.match(source, /ticketLabel\?: string/);
  assert.equal((source.match(/= data\.ticketLabel\r?\n/g) ?? []).length, 2, "label in success and reused-QR messages");
  assert.match(source, /extraTickets\.checkedIn/);
  assert.match(source, /extraTickets\.total/);
}

function checkFinance() {
  const panel = read("components/MyComponents/tickets/PaymentsPanel.tsx");
  const admin = read("components/MyComponents/tickets/AdminTickets.tsx");
  for (const [name, source] of [["panel", panel], ["admin", admin]]) {
    assert.doesNotMatch(source, /unitCents/, `${name}: unitCents is not an order total`);
    assert.match(source, /Comissão/, `${name}: commission`);
    assert.match(source, /Estornos/, `${name}: refunds`);
    assert.match(source, /antes da tarifa do Mercado Pago/, `${name}: net is before Mercado Pago's fee`);
    assert.match(source, /\.totalCents/, `${name}: order total`);
    assert.match(source, /\.quantity/, `${name}: order quantity`);
    assert.doesNotMatch(source, /Recebido|A receber|Saldo dispon/, `${name}: no invented payout numbers`);
  }
  assert.match(panel, /overview\.totals\.refundedCents/);
  assert.match(panel, /event\.refundedCents/);
}

checkTotals(loadTickets());
checkCheckout();
checkPasses();
checkDoor();
checkFinance();
console.log("verify-multi-ticket-ui: OK");
