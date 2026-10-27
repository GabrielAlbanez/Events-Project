// Anonymous HTTP smoke checks only: no accounts, notifications or events are mutated.
const assert = require("node:assert/strict");
const base = process.env.FEATURE_HTTP_URL || "http://localhost:3100";
async function check(route, expected) {
  const response = await fetch(base + route, { redirect: "manual", signal: AbortSignal.timeout(15000) });
  assert.ok(expected.includes(response.status), route + ": unexpected " + response.status);
  if (response.status === 307) assert.ok(response.headers.get("location")?.endsWith("/login"), "Private route must redirect to login: " + route);
  await response.arrayBuffer();
  console.log("PASS " + response.status + " " + route);
}
async function run() {
  for (const route of ["/", "/EventsCreated", "/login", "/register", "/recuperar-senha", "/redefinir-senha", "/confirmar-email", "/verifyEmail"]) await check(route, [200]);
  for (const route of ["/Profile", "/CriarEvento", "/myEvents", "/resultados", "/salvos", "/notificacoes", "/atividade", "/salas", "/salas/test-room", "/admin", "/admin/auditoria", "/admin/reports", "/admin/conexoes-denuncias", "/eventos/test-event/editar", "/eventos/test-event/chat", "/eventos/test-event/conexoes", "/eventos/test-event/conexoes/test-match", "/myEvents/test-event/checkin"]) await check(route, [307]);
  await check("/eventos/00000000-0000-4000-8000-000000000000", [404]);
  await check("/promotores/00000000-0000-4000-8000-000000000000", [404]);
  const response = await fetch(base + "/api/AllEvents"); assert.equal(response.status, 200);
  const events = await response.json(); assert.ok(Array.isArray(events));
  if (events[0]) {
    await check("/eventos/" + encodeURIComponent(events[0].id), [200]);
    await check("/eventos/" + encodeURIComponent(events[0].id) + "/comunidade", [200]);
    if (events[0].userId) await check("/promotores/" + encodeURIComponent(events[0].userId), [200]);
  }
  for (const route of ["/api/admin/events", "/api/community/activity", "/api/community/rooms", "/api/push/subscriptions", "/api/my-calendar"]) await check(route, [401, 403]);
  console.log("PASS site HTTP smoke (anonymous/public only; authenticated mutations require an isolated test database).");
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
