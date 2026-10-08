const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const source = ts.transpileModule(fs.readFileSync("lib/recurrence.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleObject = { exports: {} };
new Function("require", "module", "exports", source)(require, moduleObject, moduleObject.exports);
const { planOccurrences } = moduleObject.exports;

assert.deepEqual(planOccurrences("2028-01-31", "2028-02-02", { frequency: "MONTHLY", interval: 1, count: 3 }), [
  { dataInicio: "2028-01-31", dataFim: "2028-02-02" },
  { dataInicio: "2028-02-29", dataFim: "2028-03-02" },
  { dataInicio: "2028-03-31", dataFim: "2028-04-02" },
]);
assert.deepEqual(planOccurrences("2028-12-30", "2029-01-01", { frequency: "WEEKLY", interval: 2, count: 2 })[1], {
  dataInicio: "2029-01-13", dataFim: "2029-01-15",
});
for (const [start, end, input] of [
  ["2028-02-30", "2028-03-01", { frequency: "WEEKLY", interval: 1, count: 2 }],
  ["2028-04-02", "2028-04-01", { frequency: "WEEKLY", interval: 1, count: 2 }],
  ["2028-01-01", "2028-01-01", { frequency: "WEEKLY", interval: 1, count: 1 }],
  ["2028-01-01", "2028-01-01", { frequency: "MONTHLY", interval: 4, count: 52 }],
]) assert.throws(() => planOccurrences(start, end, input));
console.log("PASS: recurrence calendar dates, month-end, year rollover and limits");

const sourceEvent = {
  id: "event-1", nome: "Evento de teste", descricao: "Descrição", endereco: "Rua de teste",
  banner: "/uploads/test.png", carrossel: [], linkParaCompra: "", dataInicio: "2028-01-31",
  dataFim: "2028-02-02", category: "Cultura", isFree: true, priceCents: 0, capacity: 25,
  lat: null, lng: null, startTime: "10:00", endTime: "12:00", timezone: "America/Sao_Paulo",
  userId: "promoter-1", status: "PENDING", recurrenceSeriesId: null, updatedAt: new Date(),
};
let created = [], history = [], notices = 0, lookups = 0;
const transaction = {
  events: {
    findFirst: async query => { lookups++; return query.where.userId === sourceEvent.userId ? sourceEvent : null; },
    updateMany: async () => ({ count: 1 }),
    createMany: async query => { created = query.data; return { count: created.length }; },
  },
  eventSeries: { create: async () => ({ id: "series-1" }) },
  eventHistory: { createMany: async query => { history = query.data; return { count: history.length }; } },
  user: { findUnique: async () => ({ name: "Promoter" }) },
};
const prisma = { $transaction: async callback => callback(transaction) };
const serviceSource = ts.transpileModule(fs.readFileSync("lib/services/recurrence.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
const serviceModule = { exports: {} };
new Function("require", "module", "exports", serviceSource)(name => {
  if (name === "@/lib/prisma") return { __esModule: true, default: prisma };
  if (name === "@/lib/eventNotifications") return { notifyEventAudience: async () => { notices++; } };
  if (name === "@/lib/recurrence") return moduleObject.exports;
  return require(name);
}, serviceModule, serviceModule.exports);

(async () => {
  const create = serviceModule.exports.criarSerieRecorrente;
  assert.equal((await create("event-1", { frequency: "MONTHLY", interval: 1, count: 3 }, async () => null)).success, false);
  assert.equal(lookups, 0);
  const result = await create("event-1", { frequency: "MONTHLY", interval: 1, count: 3 }, async () => ({ id: "promoter-1", role: "PROMOTER" }));
  assert.equal(result.success, true);
  assert.equal(result.eventIds.length, 3);
  assert.equal(created.length, 2);
  assert.equal(created[0].capacity, 25);
  assert.equal(created[0].dataInicio, "2028-02-29");
  assert.equal(created[0].status, "PENDING");
  assert.equal(history.length, 2);
  assert.equal(notices, 1);
  assert.equal((await create("event-1", { frequency: "MONTHLY", interval: 1, count: 3 }, async () => ({ id: "other", role: "PROMOTER" }))).success, false);
  console.log("PASS: recurrence ownership, instances, capacity, history and review notice");
})().catch(error => { console.error(error); process.exitCode = 1; });
