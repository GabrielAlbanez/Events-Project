#!/usr/bin/env node
// Executa em sequência todas as suítes offline (sem banco, sem servidor HTTP externo).
// Uso: node scripts/run-offline-tests.cjs [--list] [filtro...]
//   --list   apenas mostra o que seria executado.
//   filtro   executa somente entradas cujo nome contenha algum dos termos.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

// Suítes verify-*.cjs adicionais que ainda não estão em nenhum script test:* do package.json.
const OFFLINE_EXTRA = [
  "verify-organizer-ops.cjs",
  "verify-multi-ticket-ui.cjs",
  "verify-registration-approval.cjs",
  "verify-my-events-requests.cjs",
  "verify-event-reminders.cjs",
  "verify-event-form-mobile.cjs",
  "verify-organizer-insights.cjs",
  "verify-security-platform.cjs",
  "verify-commercial-growth.cjs",
  "verify-frontend-foundation.cjs",
  "verify-discovery-performance.cjs",
  "verify-geolocation-help.cjs",
  "verify-promo-kit.cjs",
  "verify-ticket-coupons-ui.cjs",
  "verify-registration-approval-ui.cjs",
  "verify-conheca-landing.cjs",
  "verify-admin-review-ui.cjs",
  "verify-mercadopago-connect-ui.cjs",
  "verify-profile-photo-viewer.cjs",
];

// Scripts test:* que exigem banco, servidor HTTP em execução ou serviços externos.
const ONLINE_SUFFIX = /:(db|http)$/;
const ONLINE_MARKERS = [/_TEST_DATABASE=true/, /--database\b/, /\bsmoke-/, /-live\.cjs\b/, /-http\.cjs\b/];
const NODE_FILE_COMMAND = /^node\s+(scripts\/[\w.-]+\.cjs)$/;
// Garante que nenhuma suíte entre no modo de banco por variável herdada do shell.
const DATABASE_MODE_FLAGS = ["FEATURE_TEST_DATABASE", "AI_EVENTS_TEST_DATABASE"];
const childEnv = { ...process.env };
for (const flag of DATABASE_MODE_FLAGS) delete childEnv[flag];

function classify(scripts) {
  const entries = [];
  const skipped = [];
  const seenFiles = new Set();
  for (const [name, command] of Object.entries(scripts)) {
    if (name === "test:offline" || !name.startsWith("test:")) continue;
    if (ONLINE_SUFFIX.test(name) || ONLINE_MARKERS.some(marker => marker.test(command))) {
      skipped.push(name);
      continue;
    }
    const parts = command.split("&&").map(part => part.trim());
    if (parts.every(part => NODE_FILE_COMMAND.test(part))) {
      for (const part of parts) {
        const file = part.match(NODE_FILE_COMMAND)[1];
        if (seenFiles.has(file)) continue;
        seenFiles.add(file);
        entries.push({ label: `${name} > ${path.basename(file)}`, file });
      }
    } else {
      entries.push({ label: name, npmScript: name });
    }
  }
  for (const extra of OFFLINE_EXTRA) {
    const file = `scripts/${extra}`;
    if (seenFiles.has(file)) continue;
    seenFiles.add(file);
    entries.push({ label: `extra > ${extra}`, file, optional: true });
  }
  return { entries, skipped };
}

function run(entry) {
  const started = Date.now();
  if (entry.file && !fs.existsSync(path.join(root, entry.file))) {
    return { status: entry.optional ? "WARN" : "FAIL", ms: 0, note: "arquivo não encontrado" };
  }
  const result = entry.file
    ? spawnSync(process.execPath, [entry.file], { cwd: root, stdio: "inherit", env: childEnv })
    : spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "-s", entry.npmScript], {
      cwd: root, stdio: "inherit", env: childEnv, shell: process.platform === "win32",
    });
  const ms = Date.now() - started;
  if (result.error) return { status: "FAIL", ms, note: result.error.message };
  if (result.status !== 0) return { status: "FAIL", ms, note: result.signal ? `sinal ${result.signal}` : `código ${result.status}` };
  return { status: "PASS", ms, note: "" };
}

function main() {
  const args = process.argv.slice(2);
  const listOnly = args.includes("--list");
  const filters = args.filter(arg => !arg.startsWith("--"));
  const scripts = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts || {};
  const { entries, skipped } = classify(scripts);
  const selected = filters.length ? entries.filter(entry => filters.some(term => entry.label.includes(term))) : entries;

  console.log(`Suítes offline: ${selected.length}. Ignoradas (banco/HTTP): ${skipped.join(", ") || "nenhuma"}.`);
  if (listOnly) {
    for (const entry of selected) console.log(`  ${entry.label}`);
    return 0;
  }
  if (!selected.length) {
    console.error("Nenhuma suíte corresponde ao filtro informado.");
    return 1;
  }

  const results = [];
  const total = Date.now();
  for (const entry of selected) {
    console.log(`\n=== ${entry.label}`);
    const outcome = run(entry);
    if (outcome.status === "WARN") console.warn(`WARN ${entry.label}: ${outcome.note}; ignorado.`);
    results.push({ ...entry, ...outcome });
  }

  const width = Math.max(5, ...results.map(item => item.label.length));
  console.log(`\n${"Suíte".padEnd(width)}  Status  Duração   Observação`);
  console.log(`${"-".repeat(width)}  ------  --------  ----------`);
  for (const item of results) {
    console.log(`${item.label.padEnd(width)}  ${item.status.padEnd(6)}  ${`${(item.ms / 1000).toFixed(2)}s`.padStart(8)}  ${item.note}`);
  }
  const count = status => results.filter(item => item.status === status).length;
  const failed = count("FAIL");
  console.log(`\nPASS ${count("PASS")} | FAIL ${failed} | WARN ${count("WARN")} | total ${((Date.now() - total) / 1000).toFixed(2)}s`);
  return failed ? 1 : 0;
}

process.exitCode = main();
