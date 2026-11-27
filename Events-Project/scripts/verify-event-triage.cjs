// Offline checks for the automatic event triage: fixed rules, organizer trust, the optional
// free Gemini review (mocked fetch) and the GREEN / YELLOW / RED outcome applied to an event.
// In-memory fake Prisma; never touches the database or the network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
function resolveFile(spec) {
  const base = path.join(root, spec.replace(/^@\//, ''));
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  throw new Error(`Cannot resolve ${spec}`);
}
function load(file, deps = {}, cache = new Map()) {
  const full = path.isAbsolute(file) ? file : path.join(root, file);
  if (cache.has(full)) return cache.get(full).exports;
  const m = { exports: {} };
  cache.set(full, m);
  const output = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const localRequire = name => {
    if (name in deps) return deps[name];
    if (name.startsWith('@/')) return load(resolveFile(name), deps, cache);
    if (name.startsWith('./') || name.startsWith('../')) return load(resolveFile(path.relative(root, path.resolve(path.dirname(full), name))), deps, cache);
    return require(name);
  };
  new Function('require', 'module', 'exports', output)(localRequire, m, m.exports);
  return m.exports;
}

// Minimal valid images: a PNG header (IHDR) and a baseline JPEG with an SOF0 marker.
function png(width, height) {
  const b = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(width, 16); b.writeUInt32BE(height, 20);
  return b;
}
function jpeg(width, height) {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xd9]);
}

const rules = load('lib/moderation/rules.ts');
const now = new Date('2026-11-27T15:00:00Z');
const good = {
  nome: 'Sarau de Primavera', descricao: 'Noite de poesia, música acústica e microfone aberto para artistas locais. Traga seus textos e venha participar com a gente.',
  category: 'Cultura', dataInicio: '2026-12-10', dataFim: '2026-12-10', endereco: 'Rua das Flores, 120 - Campinas', lat: -22.9, lng: -47.06,
  isFree: true, priceCents: 0, ticketsEnabled: false, linkParaCompra: '',
};
const okImage = { width: 1200, height: 630 };

// ---------- image header parsing (no image library needed) ----------
assert.deepEqual(rules.imageDimensions(png(1200, 630)), { width: 1200, height: 630 });
assert.deepEqual(rules.imageDimensions(jpeg(800, 450)), { width: 800, height: 450 });
assert.equal(rules.imageDimensions(Buffer.from('not an image')), null);

// ---------- fixed rules ----------
const codes = (event, ctx = {}) => rules.eventRuleFindings(event, { now, image: okImage, duplicateImage: false, ...ctx }).map(f => `${f.severity}:${f.code}`);
assert.deepEqual(codes(good), [], 'a complete event has no findings');
assert.ok(codes({ ...good, dataInicio: '2026-11-01', dataFim: '2026-11-02' }).includes('fix:past-date'), 'an event that already ended goes back for correction');
assert.ok(codes({ ...good, lat: null, lng: null }).includes('fix:no-location'));
assert.ok(codes({ ...good, descricao: 'Festa top' }).includes('fix:short-description'));
assert.ok(codes(good, { image: { width: 300, height: 200 } }).includes('fix:small-image'));
assert.ok(codes(good, { image: { width: 3000, height: 400 } }).includes('fix:stretched-image'));
assert.ok(codes(good, { image: null }).includes('serious:image-unreadable'), 'an unreadable cover cannot be auto-published');
assert.ok(codes(good, { duplicateImage: true }).includes('serious:duplicate-image'), 'a cover already used by another organizer');
assert.ok(codes({ ...good, isFree: false, priceCents: 350000 }).includes('serious:high-price'));
assert.ok(codes({ ...good, descricao: good.descricao + ' Pagamento só por Pix direto na minha chave.' }).includes('serious:off-platform-payment'));
assert.ok(codes({ ...good, descricao: good.descricao + ' Chama no WhatsApp para pagar.' }).includes('serious:off-platform-payment'));
assert.ok(codes({ ...good, nome: 'Festa nudes +18' }).includes('serious:adult-content'));
assert.ok(rules.eventRuleFindings({ ...good, descricao: 'curta' }, { now, image: okImage, duplicateImage: false }).every(f => f.message.length > 10 && !/undefined/.test(f.message)), 'every finding explains itself in Portuguese');

// ---------- verdict ----------
const triage = load('lib/moderation/triage.ts', { '@/lib/prisma': { __esModule: true, default: {} } });
const fix = { code: 'short-description', severity: 'fix', message: 'x' };
const serious = { code: 'duplicate-image', severity: 'serious', message: 'y' };
const aiOk = { matches: true, serious: false, category: 'ok', reason: 'ok' };
assert.equal(triage.decideVerdict({ findings: [], trust: 'TRUSTED', ai: null, aiEnabled: false }).verdict, 'GREEN', 'trusted + clean rules publishes without AI');
assert.equal(triage.decideVerdict({ findings: [], trust: 'TESTING', ai: aiOk, aiEnabled: true }).verdict, 'GREEN');
assert.equal(triage.decideVerdict({ findings: [], trust: 'TESTING', ai: null, aiEnabled: true }).verdict, 'RED', 'AI down: an organizer in testing goes to the admin');
assert.equal(triage.decideVerdict({ findings: [], trust: 'TESTING', ai: null, aiEnabled: false }).verdict, 'RED', 'no AI key: testing organizers still need a human');
assert.equal(triage.decideVerdict({ findings: [], trust: 'NEW', ai: aiOk, aiEnabled: true }).verdict, 'RED', 'first event of a new organizer always goes to the admin');
assert.equal(triage.decideVerdict({ findings: [fix], trust: 'NEW', ai: aiOk, aiEnabled: true }).verdict, 'YELLOW', 'fixable problems go back even for new organizers');
assert.equal(triage.decideVerdict({ findings: [fix, serious], trust: 'TRUSTED', ai: aiOk, aiEnabled: true }).verdict, 'RED', 'serious beats fixable');
assert.equal(triage.decideVerdict({ findings: [], trust: 'TRUSTED', ai: { matches: false, serious: false, category: 'mismatch', reason: 'A imagem mostra um carro.' }, aiEnabled: true }).verdict, 'YELLOW', 'image that does not match goes back for correction');
const adult = triage.decideVerdict({ findings: [], trust: 'TRUSTED', ai: { matches: true, serious: true, category: 'adult', reason: 'Conteúdo adulto.' }, aiEnabled: true });
assert.equal(adult.verdict, 'RED'); assert.ok(adult.reasons.some(r => /adulto/i.test(r)));

// ---------- trust ----------
(async () => {
  const trustDb = (validated, resetAt = null, openReports = 0) => ({
    user: { findUnique: async () => ({ role: 'PROMOTER', organizerTrustResetAt: resetAt }) },
    eventHistory: { count: async ({ where }) => validated.filter(d => !where.createdAt || d >= where.createdAt.gt).length },
    eventReport: { count: async () => openReports },
  });
  const d = days => new Date(now.getTime() - days * 86400000);
  assert.equal(await triage.organizerTrust(trustDb([]), 'u'), 'NEW');
  assert.equal(await triage.organizerTrust(trustDb([d(5)]), 'u'), 'TESTING');
  assert.equal(await triage.organizerTrust(trustDb([d(9), d(5)]), 'u'), 'TRUSTED');
  assert.equal(await triage.organizerTrust(trustDb([d(9), d(5)], d(3)), 'u'), 'NEW', 'an admin takedown resets trust');
  assert.equal(await triage.organizerTrust(trustDb([d(9), d(5)], null, 1), 'u'), 'TESTING', 'open reports cap trust at testing');
  assert.equal(await triage.organizerTrust({ user: { findUnique: async () => ({ role: 'ADMIN', organizerTrustResetAt: null }) } }, 'a'), 'TRUSTED');

  // ---------- Gemini (free tier, optional) ----------
  const gemini = load('lib/moderation/gemini.ts');
  let sent;
  const reply = obj => async (url, init) => { sent = { url, init }; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) }; };
  const input = { name: good.nome, description: good.descricao, category: good.category, image: { bytes: png(1200, 630), mime: 'image/png' } };
  assert.equal(await gemini.reviewWithGemini(input, { env: {}, fetch: reply(aiOk) }), null, 'without GEMINI_API_KEY nothing is sent');
  assert.equal(sent, undefined);
  const verdict = await gemini.reviewWithGemini(input, { env: { GEMINI_API_KEY: 'k-test' }, fetch: reply({ matches: false, serious: false, category: 'mismatch', reason: 'A imagem mostra um carro.' }) });
  assert.deepEqual(verdict, { matches: false, serious: false, category: 'mismatch', reason: 'A imagem mostra um carro.' });
  assert.match(sent.url, /generativelanguage\.googleapis\.com\/v1beta\/models\/[\w.-]+:generateContent$/);
  assert.equal(sent.init.headers['x-goog-api-key'], 'k-test', 'key goes in a header, never in the URL');
  assert.ok(!sent.url.includes('k-test'));
  const body = JSON.parse(sent.init.body);
  const sentText = JSON.stringify(body);
  assert.ok(sentText.includes('Sarau de Primavera') && sentText.includes('inline_data'), 'sends only public event text and the cover');
  assert.ok(!/@|email|organizer/i.test(body.contents[0].parts.map(p => p.text || '').join(' ')), 'no personal data in the prompt');
  assert.equal(await gemini.reviewWithGemini(input, { env: { GEMINI_API_KEY: 'k' }, fetch: async () => ({ ok: false, status: 429, json: async () => ({}) }) }), null, 'quota exceeded → null (falls back to rules)');
  assert.equal(await gemini.reviewWithGemini(input, { env: { GEMINI_API_KEY: 'k' }, fetch: async () => { throw new Error('network'); } }), null);
  assert.equal(await gemini.reviewWithGemini(input, { env: { GEMINI_API_KEY: 'k' }, fetch: reply({ matches: 'yes' }) }), null, 'malformed answers are ignored');
  const longReason = await gemini.reviewWithGemini(input, { env: { GEMINI_API_KEY: 'k' }, fetch: reply({ ...aiOk, reason: 'x'.repeat(900) }) });
  assert.ok(longReason.reason.length <= 300, 'reason is truncated');

  // ---------- applying the outcome ----------
  function fakeDb(state) {
    const db = {
      updates: [], history: [], moderations: [], notices: [],
      events: {
        findUnique: async () => state.event,
        findFirst: async ({ where }) => state.others.find(o => o.bannerHash === where.bannerHash && o.userId !== where.userId.not) ?? null,
        updateMany: async ({ where, data }) => { if (state.event.status !== where.status) return { count: 0 }; Object.assign(state.event, data); db.updates.push(data); return { count: 1 }; },
      },
      user: { findUnique: async () => ({ role: 'PROMOTER', organizerTrustResetAt: null, name: 'Maria' }), findMany: async () => [{ id: 'admin-1' }] },
      eventHistory: { count: async () => state.validated, create: async ({ data }) => { db.history.push(data); return data; } },
      eventReport: { count: async () => 0 },
      eventModeration: { create: async ({ data }) => { db.moderations.push(data); return data; } },
      notification: { createMany: async ({ data }) => { db.notices.push(...data); return { count: data.length }; } },
      favorite: { findMany: async () => [] }, follow: { findMany: async () => [] }, eventRegistration: { findMany: async () => [] },
      $transaction: async fn => fn(db),
    };
    return db;
  }
  const run = async (state, env = {}, ai = aiOk) => {
    const db = fakeDb(state);
    const t = load('lib/moderation/triage.ts', { '@/lib/prisma': { __esModule: true, default: db } });
    const outcome = await t.runEventTriage(state.event.id, { now: () => now, env, readImage: async () => state.image, review: async () => ai });
    return { db, outcome };
  };
  const event = () => ({ id: 'e1', userId: 'org', status: 'PENDING', bannerHash: 'h1', banner: '/uploads/x.png', ...good });

  // Trusted organizer, clean event → published automatically, organizer + admins told.
  {
    const state = { event: event(), others: [], validated: 2, image: png(1200, 630) };
    const { db, outcome } = await run(state);
    assert.equal(outcome.verdict, 'GREEN'); assert.equal(state.event.status, 'PUBLISHED');
    assert.equal(db.updates[0].validatedBy, null, 'no admin signed this approval'); assert.ok(db.updates[0].validatedAt);
    assert.equal(db.history[0].action, 'VALIDATED'); assert.match(db.history[0].note, /automática/i);
    assert.equal(db.moderations[0].verdict, 'GREEN');
    assert.ok(db.notices.some(n => n.userId === 'org' && /publicado/i.test(n.title)));
  }
  // New organizer → stays PENDING, admin gets the reasons.
  {
    const state = { event: event(), others: [], validated: 0, image: png(1200, 630) };
    const { db, outcome } = await run(state);
    assert.equal(outcome.verdict, 'RED'); assert.equal(state.event.status, 'PENDING');
    assert.ok(db.notices.some(n => n.userId === 'admin-1' && /revis/i.test(n.title)));
    assert.equal(db.updates.length, 0);
  }
  // Fixable problem → back to the organizer with the reasons.
  {
    const state = { event: { ...event(), descricao: 'Festa top' }, others: [], validated: 2, image: png(1200, 630) };
    const { db, outcome } = await run(state);
    assert.equal(outcome.verdict, 'YELLOW'); assert.equal(state.event.status, 'CHANGES_REQUESTED');
    assert.match(state.event.reviewNote, /descrição/i);
    assert.equal(db.history[0].action, 'CHANGES_REQUESTED');
    assert.ok(db.notices.some(n => n.userId === 'org' && /corre/i.test(n.title)));
  }
  // Cover copied from another organizer → admin.
  {
    const state = { event: event(), others: [{ id: 'e9', userId: 'other', bannerHash: 'h1' }], validated: 2, image: png(1200, 630) };
    const { outcome } = await run(state);
    assert.equal(outcome.verdict, 'RED'); assert.ok(outcome.reasons.some(r => /outro evento/i.test(r)));
  }
  // Kill switch: MODERATION_AUTOPUBLISH=off keeps GREEN events for the admin.
  {
    const state = { event: event(), others: [], validated: 2, image: png(1200, 630) };
    const { outcome } = await run(state, { MODERATION_AUTOPUBLISH: 'off' });
    assert.equal(outcome.verdict, 'GREEN'); assert.equal(state.event.status, 'PENDING', 'classified but not published');
  }
  // Event no longer pending (edited meanwhile) → nothing applied.
  {
    const state = { event: { ...event(), status: 'DRAFT' }, others: [], validated: 2, image: png(1200, 630) };
    const { db, outcome } = await run(state);
    assert.equal(outcome, null); assert.equal(db.updates.length, 0);
  }
  // ---------- community reports: 3 different people take the event offline ----------
  {
    const state = { event: { id: 'e5', nome: 'Show', userId: 'org', status: 'PUBLISHED' }, reports: [{ reporterId: 'r1' }, { reporterId: 'r2' }], resetAt: null };
    const db = {
      notices: [], updates: [], history: [],
      events: { findUnique: async () => state.event, updateMany: async ({ where, data }) => { if (state.event.status !== where.status) return { count: 0 }; Object.assign(state.event, data); db.updates.push(data); return { count: 1 }; } },
      eventReport: {
        create: async ({ data }) => { state.reports.push({ reporterId: data.reporterId }); return { id: 'rep', status: 'PENDING' }; },
        findMany: async () => [...new Set(state.reports.map(r => r.reporterId))].map(reporterId => ({ reporterId })),
        updateMany: async () => ({ count: 1 }),
        findUniqueOrThrow: async () => ({ id: 'rep', reason: 'SPAM', details: 'x', status: 'RESOLVED', createdAt: now, reviewedAt: now, resolutionNote: null, event: { id: 'e5', nome: 'Show', status: 'PENDING', userId: 'org' } }),
      },
      eventHistory: { create: async ({ data }) => { db.history.push(data); return data; } },
      user: { findMany: async () => [{ id: 'admin-1' }], updateMany: async ({ where, data }) => { db.trustReset = { where, data }; return { count: 1 }; } },
      notification: { createMany: async ({ data }) => { db.notices.push(...data); return { count: data.length }; } },
      favorite: { findMany: async () => [] }, follow: { findMany: async () => [] }, eventRegistration: { findMany: async () => [] },
      $transaction: async fn => fn(db),
    };
    const reports = load('lib/services/eventReports.ts', { '@/lib/prisma': { __esModule: true, default: db } });
    await reports.reportEvent('e5', 'r3', { reason: 'SPAM', details: 'Parece golpe' });
    assert.equal(state.event.status, 'PENDING', 'third distinct reporter takes the event offline for review');
    assert.ok(db.history.some(h => h.action === 'UPDATED' && /denúncias/i.test(h.note)));
    assert.ok(db.notices.some(n => n.userId === 'org' && /revis/i.test(n.title)), 'organizer is told why');
    assert.ok(db.notices.some(n => n.userId === 'admin-1' && /fora do ar/i.test(n.title)));
    const updatesBefore = db.updates.length;
    state.event.status = 'PUBLISHED'; state.reports = [{ reporterId: 'r1' }];
    await reports.reportEvent('e5', 'r2', { reason: 'SPAM', details: 'Parece golpe' });
    assert.equal(db.updates.length, updatesBefore, 'two reporters are not enough');
    await reports.reviewEventReport('rep', 'admin-1', { status: 'RESOLVED', resolutionNote: 'Golpe confirmado' });
    assert.equal(db.trustReset.where.id, 'org', 'a confirmed report resets the organizer trust'); assert.ok(db.trustReset.data.organizerTrustResetAt instanceof Date);
  }
  // ---------- wiring in the event flow ----------
  {
    const read = f => fs.readFileSync(path.join(root, f), 'utf8');
    const events = read('lib/services/events.ts');
    assert.match(events, /runEventTriage\(/, 'submitted events go through the triage');
    assert.match(events, /bannerHash/, 'the cover hash is stored on upload');
    assert.match(events, /organizerTrust\(/, 'paid ticket sales need a first approved event');
    const storage = read('lib/storage/eventImages.ts');
    assert.match(storage, /export async function readEventImage/);
    assert.ok(read('scripts/run-offline-tests.cjs').includes('verify-event-triage.cjs'));
  }
  console.log('PASS: event triage (rules, trust, Gemini fallback, GREEN/YELLOW/RED outcomes)');
})().catch(error => { console.error(error); process.exit(1); });
