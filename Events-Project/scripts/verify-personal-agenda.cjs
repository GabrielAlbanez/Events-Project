const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
function load(file, dependencies = {}) {
 const module = { exports: {} };
 const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
 new Function("require", "module", "exports", source)(name => name in dependencies ? dependencies[name] : require(name), module, module.exports);
 return module.exports;
}
(async () => {
 const time = load("lib/eventTime.ts");
 const calendar = load("lib/eventCalendar.ts", { "@/lib/eventTime": time });
 const groups = load("lib/personalAgenda.ts", { "@/lib/eventTime": time });
 const notice = load("lib/eventScheduleChanges.ts");
 const base = { id: "event-1", nome: "Música", descricao: "Descrição", endereco: "Campinas", dataInicio: "2026-10-09", dataFim: "2026-10-09", startTime: "18:00", endTime: "22:00", timezone: "America/Sao_Paulo", status: "PUBLISHED" };
 const ongoing = { ...base, id: "ongoing", startTime: "12:00" };
 const ended = { ...base, id: "past", dataInicio: "2026-10-08", dataFim: "2026-10-08" };
 const cancelled = { ...base, id: "cancelled", status: "CANCELLED" };
 const result = groups.groupSavedEvents([base, cancelled, ended, ongoing], new Date("2026-10-09T20:00:00Z"));
 assert.deepEqual(result.upcoming.map(e => e.id), ["ongoing", "event-1"]);
 assert.deepEqual(result.past.map(e => e.id), ["past"]);
 assert.deepEqual(result.cancelled.map(e => e.id), ["cancelled"]);
 const text = calendar.createEventCalendar([{ ...base, descricao: "á".repeat(200) + "\r\nBEGIN:VEVENT\n", nome: "A,B;C" }, cancelled], "https://example.com", new Date("2026-10-01T12:00:00Z"));
 assert.equal((text.match(/BEGIN:VEVENT\r\n/g) || []).length, 2);
 assert.ok(text.includes("DTSTART:20261009T210000Z"));
 assert.ok(text.includes("SUMMARY:A\\,B\\;C"));
 assert.ok(text.includes("STATUS:CANCELLED"));
 for (const line of text.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 74);
 assert.throws(() => calendar.createEventCalendar([{ ...base, timezone: "invalid" }], "https://example.com"));
 const changed = notice.eventUpdateNotice(base, { ...base, dataInicio: "2026-11-01", startTime: "19:00", endereco: "Unapproved secret address" });
 assert.match(changed.message, /data, horário, local/);
 assert.ok(!changed.message.includes("Unapproved"));
 assert.ok(!changed.message.includes("2026-11-01"));
 assert.equal(notice.eventUpdateNotice(base, base).title, "Evento atualizado");
 let identity = null, calls = 0;
 const route = load("app/api/my-calendar/route.ts", {
  "next/server": require("next/server"),
  "@/lib/adminAuth": { getAuthenticatedUser: async () => identity },
  "@/lib/services/favorites": { getSavedEvents: async resolve => { calls++; assert.deepEqual(await resolve(), identity); return [base]; } },
  "@/lib/eventCalendar": calendar,
  "@/lib/publicUrl": { publicSiteUrl: () => new URL("https://example.com") },
 });
 let response = await route.GET(new Request("https://example.com/api/my-calendar?userId=other"));
 assert.equal(response.status, 401); assert.equal(calls, 0);
 identity = { id: "session-owner", role: "BASIC" };
 response = await route.GET(new Request("https://example.com/api/my-calendar?userId=other"));
 assert.equal(response.status, 200); assert.equal(calls, 1);
 assert.equal(response.headers.get("Cache-Control"), "private, no-store");
 assert.match(await response.text(), /UID:event-1@eventmap/);
 const React = require("react");
 const { renderToStaticMarkup } = require("react-dom/server");
 const ui = load("components/MyComponents/PersonalAgenda.tsx", {
  "@/components/MyComponents/PlanInvite": { PlanInvite: () => null },
  "@/components/MyComponents/EventRecommendations": { EventRecommendations: () => null },
  "next/link": { __esModule: true, default: props => React.createElement("a", props) },
  "@/lib/personalAgenda": { groupSavedEvents: events => groups.groupSavedEvents(events, new Date("2026-10-09T20:00:00Z")) },
  "@/components/MyComponents/TableEventsClient": { EventCards: ({ events }) => React.createElement("div", null, events.map(event => React.createElement("article", { key: event.id }, event.nome))) },
 });
 const markup = renderToStaticMarkup(React.createElement(ui.PersonalAgenda, { events: [base, ended, cancelled] }));
 assert.match(markup, /role="tablist"/); assert.match(markup, /aria-selected="true"/);
 assert.match(markup, /href="\/api\/my-calendar"/); assert.match(markup, /Histórico/); assert.match(markup, /Cancelados/);
 console.log("PASS personal agenda: timezone grouping, calendar safety, review-safe alerts and authenticated export");
})().catch(error => { console.error(error); process.exitCode = 1; });
