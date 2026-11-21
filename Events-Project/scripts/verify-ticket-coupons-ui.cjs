// Offline checks for the ticket coupon UI: buyer checkout (apply/remove, ?cupom= links) and organizer management.
// Pure helpers in lib/ticketCoupons.ts plus static wiring checks. No database, network or server.
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
const plain = (value) => value.replace(/\s/g, " ");

function checkHelpers(lib) {
  // Share links: same origin, encoded id and code, nothing for unsafe origins.
  assert.equal(lib.couponShareUrl("https://eventmap.example/qualquer", "evt 1", "vip10"), "https://eventmap.example/eventos/evt%201?cupom=VIP10");
  assert.equal(lib.couponShareUrl("javascript:alert(1)", "evt", "VIP10"), null);
  assert.equal(lib.couponShareUrl("nada", "evt", "VIP10"), null);
  assert.equal(lib.couponCodeFromSearch("?cupom=vip10"), "VIP10");
  assert.equal(lib.couponCodeFromSearch("?x=1&cupom=%20promo_1%20"), "PROMO_1");
  assert.equal(lib.couponCodeFromSearch("?cupom=a"), null, "invalid codes are ignored");
  assert.equal(lib.couponCodeFromSearch(""), null);

  assert.equal(plain(lib.couponDiscountLabel({ percentOff: 10, amountOffCents: null })), "10% off");
  assert.equal(plain(lib.couponDiscountLabel({ percentOff: null, amountOffCents: 1500 })), "R$ 15,00 off");

  // The example the organizer sees: R$ 50,00 with 10% -> buyer pays 45,00, organizer gets 36,00 (fee on the discounted value).
  const example = lib.couponExample(5000, { percentOff: 10, amountOffCents: null });
  assert.deepEqual(example, { priceCents: 5000, finalCents: 4500, netCents: 3600 });
  assert.equal(lib.couponExample(5000, { percentOff: null, amountOffCents: 10_000 }).finalCents, 100, "never below R$ 1,00");

  // Form parsing mirrors the server rules and returns the server action input.
  const ok = lib.parseCouponForm({ eventId: "e1", code: " vip10 ", kind: "percent", value: "10", maxUses: "", expiresAt: "" });
  assert.deepEqual(ok, { ok: true, input: { eventId: "e1", code: "VIP10", percentOff: 10 } });
  const amount = lib.parseCouponForm({ eventId: "e1", code: "MENOS15", kind: "amount", value: "15,50", maxUses: "30", expiresAt: "2099-01-02T20:30" });
  assert.equal(amount.ok, true);
  assert.equal(amount.input.amountOffCents, 1550);
  assert.equal(amount.input.percentOff, undefined);
  assert.equal(amount.input.maxUses, 30);
  assert.equal(new Date(amount.input.expiresAt).toISOString(), amount.input.expiresAt, "ISO datetime for the server");
  const bad = (patch, field) => {
    const result = lib.parseCouponForm({ eventId: "e1", code: "VIP10", kind: "percent", value: "10", maxUses: "", expiresAt: "", ...patch });
    assert.equal(result.ok, false, JSON.stringify(patch));
    assert.equal(result.field, field, JSON.stringify(patch));
  };
  bad({ code: "ab" }, "code");
  bad({ code: "com espaço" }, "code");
  bad({ value: "0" }, "value");
  bad({ value: "91" }, "value");
  bad({ value: "10.5" }, "value");
  bad({ kind: "amount", value: "0,99" }, "value");
  bad({ maxUses: "0" }, "maxUses");
  bad({ maxUses: "2.5" }, "maxUses");
  bad({ expiresAt: "2000-01-01T10:00" }, "expiresAt");
}

function checkCheckout() {
  const source = read("components/MyComponents/tickets/TicketPurchase.tsx");
  assert.match(source, /previewTicketCoupon\(/, "checkout previews the coupon on the server");
  assert.match(source, /createTicketOrder\(\{ eventId, \.\.\.\(appliedCoupon \? \{ couponCode: appliedCoupon\.code \} : \{\}\) \}\)/, "couponCode only when a coupon was applied");
  assert.match(source, /Tem um cupom\?/, "discreet toggle");
  assert.match(source, /aria-live="polite"/, "coupon feedback is announced");
  assert.match(source, /aria-describedby=/, "error associated with the input");
  assert.match(source, /line-through/, "original price struck through");
  assert.match(source, /couponCodeFromSearch\(window\.location\.search\)/, "?cupom= links prefill the coupon");
  assert.match(source, /Remover/, "applied coupon can be removed");
}

function checkManagement() {
  const source = read("components/MyComponents/tickets/TicketCoupons.tsx");
  assert.ok(source.startsWith('"use client"'));
  for (const action of ["createTicketCoupon", "listTicketCoupons", "setTicketCouponActive"]) assert.match(source, new RegExp(action + "\\("), action);
  assert.match(source, /parseCouponForm\(/, "form validated before calling the server");
  assert.match(source, /couponShareUrl\(/, "copy link with coupon");
  assert.match(source, /couponExample\(/, "live example");
  assert.match(source, /TICKET_FEE_PERCENT/, "fee percent comes from the shared rule");
  assert.match(plain(source), /sobre o valor com desconto/, "explains that the fee applies over the discounted price");
  assert.match(source, /from "react-toastify"/, "toast feedback");
  assert.match(source, /<label[^>]+htmlFor=/, "labelled inputs");
  assert.match(source, /aria-invalid/, "field errors flagged");

  const lib = read("lib/ticketCoupons.ts");
  assert.match(lib, /discountedTicketCents/, "example uses the real discount rule");
  assert.match(lib, /ticketNetCents/, "example uses the real fee rule");
  assert.match(lib, /normalizeCouponCode/, "codes normalized like the server");

  const page = read("app/eventos/[id]/page.tsx");
  assert.match(page, /canManageCoupons && <TicketCoupons/, "owner entry point on the event page");
  assert.match(page, /canManageCoupons = [^;]*ticketSale[^;]*viewerId === event\.userId/, "only the owner of an event selling tickets");
  const payments = read("components/MyComponents/tickets/PaymentsPanel.tsx");
  assert.match(payments, /<TicketCoupons/, "entry point per event in the payments panel");
}

checkHelpers(load("lib/ticketCoupons.ts"));
checkCheckout();
checkManagement();
console.log("verify-ticket-coupons-ui: OK");
