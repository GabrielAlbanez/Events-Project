// Offline checks for package B-organizer-insights: Resultados 2.0, promoter storefront, ICS feed and embed widget.
// Pure functions are executed; services run against an in-memory Prisma double; routes/pages are checked statically.
const assert = require("node:assert/strict"), fs = require("node:fs"), ts = require("typescript");
function load(file, dependencies = {}) { const m = { exports: {} }; new Function("require", "module", "exports", ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText)(name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name), m, m.exports); return m.exports; }
const read = file => fs.readFileSync(file, "utf8");

(async () => {
  const time = load("lib/eventTime.ts");
  const insights = load("lib/organizerInsights.ts", { "@/lib/eventTime": time });
  const calendar = load("lib/eventCalendar.ts", { "@/lib/eventTime": time });
  const now = new Date("2026-11-18T15:00:00Z");

  // Periods
  assert.equal(insights.parseInsightsPeriod("7"), "7");
  assert.equal(insights.parseInsightsPeriod("all"), "all");
  assert.equal(insights.parseInsightsPeriod("365"), "30");
  assert.equal(insights.parseInsightsPeriod(undefined), "30");
  assert.equal(insights.insightsPeriodStart("all", now), null);
  assert.equal(insights.insightsPeriodStart("7", now).toISOString(), "2026-11-12T00:00:00.000Z");
  const days = insights.periodDays("7", now);
  assert.equal(days.length, 7); assert.equal(days[0], "2026-11-12"); assert.equal(days[6], "2026-11-18");
  assert.equal(insights.periodDays("all", now).length, 30);
  assert.equal(insights.periodDays("90", now).length, 90);

  // Rates never estimate: incomparable steps (consent-based base smaller than complete stage) return null.
  assert.equal(insights.stepRate(5, 10), 0.5);
  assert.equal(insights.stepRate(1, 0), null);
  assert.equal(insights.stepRate(12, 10), null);
  assert.equal(insights.formatRate(null), "—");
  assert.match(insights.formatRate(0.5), /50\s?%/);
  const funnel = insights.buildFunnel({ views: 100, ticketClicks: 20, favorites: 10, registrations: 30, checkIns: 15 });
  assert.deepEqual(funnel.map(stage => stage.key), ["views", "ticketClicks", "favorites", "registrations", "checkIns"]);
  assert.equal(funnel[0].rate, null); assert.equal(funnel[1].rate, 0.2); assert.equal(funnel[3].rate, null); assert.equal(funnel[4].rate, 0.5);
  assert.deepEqual(funnel.filter(stage => stage.consentBased).map(stage => stage.key), ["views", "ticketClicks"]);

  // Registrations
  const breakdown = insights.emptyRegistrations();
  insights.addRegistrationCount(breakdown, "CONFIRMED", 6); insights.addRegistrationCount(breakdown, "CHECKED_IN", 4);
  insights.addRegistrationCount(breakdown, "WAITLISTED", 3); insights.addRegistrationCount(breakdown, "CANCELLED", 2); insights.addRegistrationCount(breakdown, "UNKNOWN", 9);
  assert.deepEqual(breakdown, { confirmed: 6, waitlisted: 3, cancelled: 2, checkedIn: 4 });
  assert.equal(insights.activeRegistrations(breakdown), 10);
  assert.equal(insights.attendanceRate(breakdown), 0.4);
  assert.equal(insights.occupancyRate(breakdown, 20), 0.5);
  assert.equal(insights.occupancyRate(breakdown, 5), 1);
  assert.equal(insights.occupancyRate(breakdown, null), null);

  // Ranking: drops events with no activity, stable ordering.
  const ranked = insights.rankEvents([
    { id: "b", registrations: 5, checkIns: 1, views: 0, favorites: 0 },
    { id: "a", registrations: 5, checkIns: 1, views: 0, favorites: 0 },
    { id: "c", registrations: 9, checkIns: 0, views: 0, favorites: 0 },
    { id: "zero", registrations: 0, checkIns: 0, views: 0, favorites: 0 },
  ], 5);
  assert.deepEqual(ranked.map(event => event.id), ["c", "a", "b"]);

  // Upcoming vs past split
  const base = { id: "e", nome: "Show", descricao: "Desc", endereco: "Rua 1", dataInicio: "2026-12-01", dataFim: "2026-12-01", startTime: "20:00", endTime: "23:00", timezone: "America/Sao_Paulo", status: "PUBLISHED" };
  const split = insights.splitPromoterEvents([
    { ...base, id: "later", dataInicio: "2026-12-10", dataFim: "2026-12-10" },
    { ...base, id: "soon" },
    { ...base, id: "today", dataInicio: "2026-11-18", dataFim: "2026-11-18", startTime: "10:00", endTime: "23:00" },
    { ...base, id: "ended", status: "ENDED", dataInicio: "2026-10-01", dataFim: "2026-10-01" },
    { ...base, id: "stale", dataInicio: "2026-11-01", dataFim: "2026-11-01" },
    { ...base, id: "invalid", dataInicio: "amanhã", dataFim: "amanhã" },
    { ...base, id: "pending", status: "PENDING" },
  ], now);
  assert.deepEqual(split.upcoming.map(event => event.id), ["today", "soon", "later"]);
  assert.deepEqual(split.past.map(event => event.id), ["stale", "ended"]);

  // Embed snippet and ICS URL are safe
  const snippet = insights.buildEmbedSnippet("https://eventmap.example/qualquer?x=1", "abc_123");
  assert.match(snippet, /^<iframe src="https:\/\/eventmap\.example\/embed\/promotores\/abc_123" title="[^"]+"/);
  assert.ok(!snippet.includes("qualquer"));
  assert.ok(insights.buildEmbedSnippet("https://eventmap.example", "a\"><script>").includes("a%22%3E%3Cscript%3E"));
  assert.throws(() => insights.buildEmbedSnippet("javascript:alert(1)", "x"));
  assert.equal(insights.promoterCalendarUrl("https://eventmap.example/x", "p1"), "https://eventmap.example/api/promotores/p1/calendar.ics");

  // Calendar: invalid items filtered, name/refresh headers emitted
  const safe = calendar.calendarSafeEvents([base, { ...base, id: "bad", dataInicio: "x" }, { ...base, id: "reversed", endTime: "19:00" }]);
  assert.deepEqual(safe.map(event => event.id), ["e"]);
  const ics = calendar.createEventCalendar(safe, "https://eventmap.example", now, { name: "Casa; Show", refreshHours: 6 });
  assert.match(ics, /X-WR-CALNAME:Casa\\; Show\r\n/);
  assert.match(ics, /REFRESH-INTERVAL;VALUE=DURATION:PT6H/);
  assert.match(ics, /URL:https:\/\/eventmap\.example\/eventos\/e/);
  assert.ok(!calendar.createEventCalendar(safe, "https://eventmap.example", now).includes("X-WR-CALNAME"));

  // Service: authorization and scoping
  const calls = [];
  const record = (model, method, result) => async query => { calls.push({ model, method, query }); return typeof result === "function" ? result(query) : result; };
  const users = { promo: { id: "promo", name: "Casa", image: null, bio: null, _count: { followers: 7 }, Events: [] }, other: { id: "other", name: "Outra", _count: { followers: 1 } } };
  const db = {
    user: { findFirst: record("user", "findFirst", query => users[query.where.id] ?? null) },
    follow: { count: record("follow", "count", 2), findUnique: record("follow", "findUnique", null) },
    events: { findMany: record("events", "findMany", [{ id: "e1", nome: "Show", status: "PUBLISHED", dataInicio: "2026-12-01", capacity: 10, views: 999, ticketClicks: 99 }]) },
    eventMetric: { groupBy: record("eventMetric", "groupBy", query => query.by[0] === "eventId" ? [{ eventId: "e1", _sum: { views: 40, ticketClicks: 8 } }] : [{ day: "2026-11-18", _sum: { views: 5, ticketClicks: 1 } }]) },
    favorite: { groupBy: record("favorite", "groupBy", [{ eventId: "e1", _count: { _all: 4 } }]) },
    eventRegistration: { groupBy: record("eventRegistration", "groupBy", [{ eventId: "e1", status: "CONFIRMED", _count: { _all: 3 } }, { eventId: "e1", status: "CHECKED_IN", _count: { _all: 3 } }, { eventId: "e1", status: "WAITLISTED", _count: { _all: 2 } }]) },
    communityFeedback: { groupBy: record("communityFeedback", "groupBy", [{ eventId: "e1", _avg: { rating: 4.26 }, _count: { _all: 3 } }]), aggregate: record("communityFeedback", "aggregate", { _avg: { rating: 4.5 }, _count: { _all: 2 } }) },
  };
  const service = load("lib/services/promoters.ts", { "@/lib/prisma": { __esModule: true, default: db }, "@/lib/eventQueries": { publicEventSelect: { id: true, nome: true } }, "@/lib/organizerInsights": insights, zod: require("zod") });
  const as = user => async () => user;

  assert.equal((await service.getPromoterInsights({}, as(null), now)).reason, "UNAUTHENTICATED");
  assert.equal((await service.getPromoterInsights({}, as({ id: "u", role: "BASIC" }), now)).reason, "FORBIDDEN");
  assert.equal((await service.getPromoterInsights({ promoterId: "other" }, as({ id: "promo", role: "PROMOTER" }), now)).reason, "FORBIDDEN");
  assert.equal((await service.getPromoterInsights({ period: "365" }, as({ id: "promo", role: "PROMOTER" }), now)).reason, "INVALID");
  assert.equal((await service.getPromoterInsights({ promoterId: "<x>" }, as({ id: "promo", role: "ADMIN" }), now)).reason, "INVALID");
  assert.equal((await service.getPromoterInsights({ extra: 1 }, as({ id: "promo", role: "PROMOTER" }), now)).reason, "INVALID");
  assert.equal(calls.length, 0, "rejected requests must not touch the database");

  const own = await service.getPromoterInsights({ period: "7" }, as({ id: "promo", role: "PROMOTER" }), now);
  assert.equal(own.ok, true);
  for (const call of calls.filter(c => c.model !== "user")) {
    const where = call.query.where;
    const scoped = where.userId === "promo" || where.promoterId === "promo" || where.event?.userId === "promo";
    assert.ok(scoped, `${call.model}.${call.method} must be scoped to the owner`);
  }
  const data = own.data;
  assert.equal(data.viewer.viewingOther, false);
  assert.equal(data.followers.total, 7); assert.equal(data.followers.gained, 2);
  assert.equal(data.totals.views, 40, "period uses EventMetric, not lifetime counters");
  assert.equal(data.totals.registrations, 6); assert.equal(data.totals.checkIns, 3); assert.equal(data.totals.breakdown.waitlisted, 2);
  assert.equal(data.attendanceRate, 0.5); assert.equal(data.rating.average, 4.3);
  assert.equal(data.daily.length, 7); assert.equal(data.daily[6].views, 5);
  assert.equal(data.events[0].occupancyRate, 0.6);
  assert.deepEqual(data.top.map(event => event.id), ["e1"]);

  calls.length = 0;
  const all = await service.getPromoterInsights({ period: "all" }, as({ id: "promo", role: "PROMOTER" }), now);
  assert.equal(all.data.totals.views, 999, "all-time uses lifetime counters");
  assert.equal(all.data.followers.gained, null);
  assert.ok(!calls.some(c => c.model === "follow" && c.method === "count"));

  const admin = await service.getPromoterInsights({ promoterId: "other" }, as({ id: "promo", role: "ADMIN" }), now);
  assert.equal(admin.ok, true); assert.equal(admin.data.viewer.viewingOther, true); assert.equal(admin.data.promoter.id, "other");
  assert.equal((await service.getPromoterInsights({ promoterId: "ghost" }, as({ id: "promo", role: "ADMIN" }), now)).reason, "NOT_FOUND");

  const failing = load("lib/services/promoters.ts", { "@/lib/prisma": { __esModule: true, default: { user: { findFirst: async () => { throw new Error("connection string leaked"); } } } }, "@/lib/eventQueries": { publicEventSelect: {} }, "@/lib/organizerInsights": insights, zod: require("zod") });
  const failure = await failing.getPromoterInsights({}, as({ id: "promo", role: "PROMOTER" }), now);
  assert.equal(failure.reason, "UNAVAILABLE"); assert.ok(!failure.message.includes("connection"));

  // Public agenda: only PUBLISHED, no private fields, invalid id short-circuits
  calls.length = 0;
  assert.equal(await service.getPromoterPublicAgenda("../etc", { now }), null);
  assert.equal(calls.length, 0);
  await service.getPromoterPublicAgenda("promo", { now, limit: 5000 });
  const agendaQuery = calls.find(c => c.model === "user").query;
  assert.deepEqual(agendaQuery.where.role, { in: ["ADMIN", "PROMOTER"] });
  assert.equal(agendaQuery.select.email, undefined); assert.equal(agendaQuery.select.password, undefined);
  assert.equal(agendaQuery.select.Events.where.status, "PUBLISHED");
  assert.equal(agendaQuery.select.Events.select.userId, undefined);

  // Public profile rating stays hidden below the minimum volume
  db.user.findFirst = async () => ({ id: "promo", name: "Casa", image: null, bio: null, contactUrl: null, _count: { followers: 7 }, Events: [] });
  const profile = await service.getPromoterProfile("promo", as(null));
  assert.equal(profile.rating, null); assert.equal(profile.isOwner, false);
  assert.ok(insights.PUBLIC_RATING_MIN_COUNT >= 3);

  // Static contracts
  const icsRoute = read("app/api/promotores/[id]/calendar.ics/route.ts");
  assert.match(icsRoute, /getPromoterPublicAgenda/); assert.match(icsRoute, /calendarSafeEvents/); assert.match(icsRoute, /text\/calendar/);
  assert.ok(!/export async function (POST|PUT|PATCH|DELETE)/.test(icsRoute));
  const embed = read("app/embed/promotores/[id]/page.tsx");
  const anchors = embed.match(/<a [^>]*>/g) ?? [];
  assert.ok(anchors.length >= 2);
  for (const anchor of anchors) { assert.match(anchor, /target="_blank"/); assert.match(anchor, /rel="noopener noreferrer"/); }
  assert.match(read("app/embed/embed.module.css"), /prefers-color-scheme: dark/);
  assert.match(read("app/embed/embed.module.css"), /prefers-reduced-motion/);
  const results = read("app/(private)/resultados/page.tsx");
  assert.match(results, /aceitaram o cookie de métricas/); assert.match(results, /EmbedShareBox/); assert.ok(!/<main\b/.test(results));
  const storefront = read("app/promotores/[id]/page.tsx");
  assert.match(storefront, /generateMetadata/); assert.match(storefront, /openGraph/); assert.match(storefront, /Próximos eventos/); assert.match(storefront, /Eventos realizados/);
  // Item 2 decision: consent gate for view/click counting stays unchanged.
  assert.match(read("app/api/event-engagement/[id]/route.ts"), /METRIC_CONSENT_COOKIE\)\?\.value!=="yes"/);

  console.log("PASS: organizer insights periods/funnel/ranking, owner/admin authZ and scoping, public agenda privacy, ICS options, embed/storefront contracts and unchanged metric consent gate");
})().catch(error => { console.error(error); process.exitCode = 1; });
