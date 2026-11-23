#!/usr/bin/env node
// Offline: connecting Mercado Pago never navigates the event form, buyers only need Pix, and the panel shows real totals only.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const card = read("components/MyComponents/tickets/MercadoPagoConnectCard.tsx");
const form = read("components/MyComponents/EventoForm.tsx");
const panel = read("components/MyComponents/tickets/PaymentsPanel.tsx");
const purchase = read("components/MyComponents/tickets/TicketPurchase.tsx");

// The form keeps its tab.
assert.match(form, /<MercadoPagoConnectCard connection=\{mercadoPago\} \/>/);
assert.doesNotMatch(form, /href="\/myEvents\/pagamentos"/, "no same-tab link to payments in the form");
assert.doesNotMatch(form, /from "next\/link"/);
assert.doesNotMatch(card, /location\.assign|router\.push|window\.location/, "the form tab never navigates");
assert.ok(card.indexOf('window.open("", "_blank")') > -1, "tab opened");
assert.ok(card.indexOf('window.open("", "_blank")') < card.indexOf("await withTimeout(startMercadoPagoConnect())"), "tab opens before any await");
assert.match(card, /popup\.opener = null/);
assert.match(card, /popup\.location\.href = result\.data\.url/);
assert.match(card, /popup\.close\(\)/, "failed request closes the blank tab");
assert.match(card, /href=\{paymentsHref\} target="_blank" rel="noopener"/, "blocked popup has a real link");

// Waiting, re-check and cleanup.
for (const text of ["Conectar Mercado Pago", "Aguardando conexão...", "Já conectei", "Mercado Pago conectado", "Abre em uma nova aba", "O que você preencheu continua aqui"]) assert.ok(card.includes(text), text);
assert.match(card, /addEventListener\("focus", recheck\)/);
assert.match(card, /removeEventListener\("focus", recheck\)/);
assert.match(card, /addEventListener\("visibilitychange", recheck\)/);
assert.match(card, /removeEventListener\("visibilitychange", recheck\)/);
assert.match(card, /typeof BroadcastChannel === "undefined"/);
assert.match(card, /channel\.close\(\)/);
assert.match(card, /REQUEST_TIMEOUT_MS/, "no infinite waiting");
assert.match(card, /eventmap-mercadopago/);

// Only a connect started here turns the sale on, and external sale stays available.
assert.match(card, /if \(!requestedHere\.current\) return;/);
assert.match(form, /if \(form\.getValues\("isFree"\)\) return;/);
assert.match(form, /form\.setValue\("ticketsEnabled", true/);
assert.match(card, /Vende em outro site\?/);
assert.match(card, /Não precisa conectar/);
assert.match(card, /Quem compra paga só com Pix/);

// Return tab.
assert.match(panel, /connectStatus === "connected" && typeof BroadcastChannel/);
assert.match(panel, /pode fechar esta aba e voltar: seus dados continuam lá/);
for (const status of ["denied", "invalid", "error", "unavailable", "account_mismatch"]) assert.match(panel, new RegExp(`${status}: \\{ text:`), status);

// Buyer only needs Pix.
const buyerLine = "Basta escanear o QR Code ou copiar o código Pix no app do seu banco. Você não precisa de conta no Mercado Pago.";
assert.equal(purchase.split(buyerLine).length - 1, 2, "before buying and next to the QR Code");

// Dashboard: real fields only.
for (const field of ["netCents", "grossCents", "feeCents", "refundedCents", "sold"]) assert.ok(panel.includes(`overview.totals.${field}`), field);
for (const label of ["Faturamento bruto", "Comissão EventMap", "Ingressos vendidos", "Estornos", "Por evento", "Pedidos recentes", "Nenhum ingresso vendido ainda", "Reconectar Mercado Pago", "antes da tarifa do Mercado Pago", "não é saldo disponível"]) assert.ok(panel.includes(label), label);
assert.doesNotMatch(panel, /Recebido|A receber|Saldo dispon|Previsão|repasse|já caiu|cai direto|Math\.random|recharts/, "no invented financial data");
assert.match(panel, /setRefundTarget\(order\)/, "refund available from recent orders");
assert.match(panel, /disconnectMercadoPago/);

console.log("verify-mercadopago-connect-ui: OK");
