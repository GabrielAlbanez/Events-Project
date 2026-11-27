// Offline checks for package D-commercial-growth: organizer access requests, event claims,
// admin ownership transfer, public pages (/termos, /para-organizadores), footer and route policy.
// Uses an in-memory fake Prisma client; never touches the database or the network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function resolveFile(spec) {
  const base = path.join(root, spec.replace(/^@\//, ''));
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  throw new Error(`Cannot resolve ${spec}`);
}

function load(file, deps = {}, cache = new Map()) {
  const full = path.isAbsolute(file) ? file : path.join(root, file);
  const key = full;
  if (cache.has(key)) return cache.get(key).exports;
  const m = { exports: {} };
  cache.set(key, m);
  const output = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const localRequire = name => {
    if (name in deps) return deps[name];
    if (name.startsWith('@/')) return load(resolveFile(name), deps, cache);
    if (name.startsWith('./') || name.startsWith('../')) return load(resolveFile(path.relative(root, path.resolve(path.dirname(full), name))), deps);
    return require(name);
  };
  new Function('require', 'module', 'exports', output)(localRequire, m, m.exports);
  return m.exports;
}

// ---------- schema ----------
const schema = load('lib/organizer/schema.ts');
assert.equal(schema.normalizeOrganizerLink('@produtora.sp'), 'https://www.instagram.com/produtora.sp');
assert.equal(schema.normalizeOrganizerLink('produtora'), 'https://www.instagram.com/produtora');
assert.equal(schema.normalizeOrganizerLink('exemplo.com.br/agenda'), 'https://exemplo.com.br/agenda');
assert.equal(schema.normalizeOrganizerLink(''), '');
assert.equal(schema.normalizeOrganizerLink('javascript:alert(1)'), null, 'non-http schemes are rejected');
assert.equal(schema.normalizeOrganizerLink('https://user:pass@exemplo.com'), null, 'credentials in URL are rejected');
const okRequest = schema.organizerRequestSchema.safeParse({ brandName: '  Coletivo\nNoite  ', city: 'São Paulo', eventType: 'Música', link: '@coletivo', message: 'Oi' });
assert.ok(okRequest.success);
assert.equal(okRequest.data.brandName, 'Coletivo Noite', 'control characters and extra spaces are collapsed');
assert.equal(okRequest.data.interest, 'access');
assert.equal(schema.organizerRequestSchema.safeParse({ brandName: 'A', city: 'SP', eventType: 'Música' }).success, false, 'brand name minimum');
assert.equal(schema.organizerRequestSchema.safeParse({ brandName: 'Marca', city: 'SP', eventType: 'Festa' }).success, false, 'event type must be an existing category');
assert.equal(schema.organizerRequestSchema.safeParse({ brandName: 'Marca', city: 'SP', eventType: 'Música', message: 'x'.repeat(501) }).success, false, 'message limit');
assert.equal(schema.organizerRequestSchema.safeParse({ brandName: 'Marca', city: 'SP', eventType: 'Música', interest: 'vip' }).success, false, 'interest is an enum');
const id = '0b6b7b5e-3f0a-4c8e-9d7e-2a1b3c4d5e6f';
assert.equal(schema.extractEventId(`https://eventmap.app/eventos/${id}?x=1`), id);
assert.equal(schema.extractEventId(` ${id} `), id);
assert.equal(schema.transferOwnershipSchema.safeParse({ eventId: id, newOwnerEmail: ' Org@Ex.com ' }).data.newOwnerEmail, 'org@ex.com');
assert.equal(schema.eventClaimSchema.safeParse({ eventId: 'not-a-uuid', contact: '@org' }).success, false);

// ---------- service with fake prisma ----------
const now = new Date('2026-11-18T12:00:00Z');
function fakeDb(state) {
  const db = {
    created: [], history: [], updates: [], locks: 0, mails: [], roleChanges: [], audits: [],
    user: {
      findMany: async ({ where }) => state.users.filter(u => u.role === where.role && !u.suspendedAt).map(u => ({ id: u.id, email: u.email })),
      findUnique: async ({ where }) => { const u = state.users.find(u => u.id === where.id); return u ? { ...u, accounts: u.accounts ?? [] } : null; },
      updateMany: async ({ where, data }) => { const u = state.users.find(u => u.id === where.id && u.role === where.role); if (!u) return { count: 0 }; Object.assign(u, data); db.roleChanges.push({ id: u.id, ...data }); return { count: 1 }; },
      findFirst: async ({ where }) => state.users.find(u => u.email.toLowerCase() === where.email.equals.toLowerCase()) ?? null,
    },
    notification: {
      findFirst: async ({ where }) => (state.notifications.find(n => n.groupKey === where.groupKey && n.createdAt >= where.createdAt.gte) ? { id: 'n' } : null),
      findMany: async ({ where }) => [...new Set(state.notifications.filter(n => n.groupKey.startsWith(where.groupKey.startsWith) && n.createdAt >= where.createdAt.gte).map(n => n.groupKey))].map(groupKey => ({ groupKey })),
      createMany: async ({ data }) => { db.created.push(...data); return { count: data.length }; },
    },
    events: {
      findFirst: async ({ where }) => { const e = state.events.find(ev => ev.id === where.id && where.status.in.includes(ev.status)); return e ? { ...e, user: { role: state.users.find(u => u.id === e.userId)?.role } } : null; },
      findUnique: async ({ where }) => { const e = state.events.find(ev => ev.id === where.id); return e ? { ...e } : null; },
      updateMany: async ({ where, data }) => { const e = state.events.find(ev => ev.id === where.id && ev.userId === where.userId); if (!e) return { count: 0 }; e.userId = data.userId; db.updates.push(data); return { count: 1 }; },
    },
    userSuspensionAudit: { create: async ({ data }) => { db.audits.push(data); return data; } },
    eventHistory: { create: async ({ data }) => { db.history.push(data); return data; } },
    $queryRaw: async () => { db.locks++; return []; },
    $transaction: async fn => fn(db),
  };
  return db;
}

function loadService(db) {
  return load('lib/organizer/service.ts', {
    '@/lib/prisma': { __esModule: true, default: db },
    './mail': { sendOrganizerMail: async (to, subject) => { db.mails.push({ to, subject }); return true; } },
    '@/lib/services/userSuspension': { suspensionActive: user => Boolean(user.suspendedAt) },
  });
}

const baseState = () => ({
  users: [
    { id: 'admin-1', role: 'ADMIN', email: 'a1@ex.com', name: 'Admin 1' },
    { id: 'admin-2', role: 'ADMIN', email: 'a2@ex.com', name: 'Admin 2' },
    { id: 'admin-off', role: 'ADMIN', email: 'off@ex.com', name: 'Off', suspendedAt: new Date() },
    { id: 'basic', role: 'BASIC', email: 'basic+org@ex.com', name: 'Maria', emailVerified: true },
    { id: 'google', role: 'BASIC', email: 'g@ex.com', name: 'Gi', emailVerified: null, accounts: [{ id: 'acc' }] },
    { id: 'unverified', role: 'BASIC', email: 'u@ex.com', name: 'Uli', emailVerified: false },
    { id: 'promoter', role: 'PROMOTER', email: 'promo@ex.com', name: 'Pro' },
  ],
  notifications: [],
  events: [
    { id, nome: 'Festival Importado', status: 'PUBLISHED', userId: 'admin-1' },
    { id: '1b6b7b5e-3f0a-4c8e-9d7e-2a1b3c4d5e6f', nome: 'Evento do Promotor', status: 'PUBLISHED', userId: 'promoter' },
  ],
});
const as = user => async () => user;
const validRequest = { brandName: 'Coletivo', city: 'Campinas', eventType: 'Cultura', link: '', message: 'Fazemos saraus' };

(async () => {
  // Organizer access request
  {
    const state = baseState(); const db = fakeDb(state); const svc = loadService(db);
    assert.equal((await svc.submitOrganizerRequest(validRequest, as(null))).success, false, 'requires login');
    assert.match((await svc.submitOrganizerRequest(validRequest, as({ id: 'admin-1', role: 'ADMIN' }))).message, /administrador/);
    assert.equal((await svc.submitOrganizerRequest(validRequest, as({ id: 'promoter', role: 'PROMOTER' }))).success, false, 'promoter does not need access');
    const invalid = await svc.submitOrganizerRequest({ ...validRequest, city: '' }, as({ id: 'basic', role: 'BASIC' }));
    assert.equal(invalid.success, false); assert.ok(invalid.fieldErrors.city);
    assert.equal(db.created.length, 0, 'nothing created before a valid request');
    const sent = await svc.submitOrganizerRequest(validRequest, as({ id: 'basic', role: 'BASIC' }), () => now);
    assert.equal(sent.success, true);
    assert.equal(db.created.length, 2, 'one notification per active admin (suspended admins skipped)');
    for (const n of db.created) {
      assert.equal(n.type, 'ADMIN'); assert.equal(n.priority, 'high');
      assert.equal(n.href, '/admin?q=basic%2Borg%40ex.com', 'links to admin filtered by the requester email');
      assert.equal(n.groupKey, 'organizer-request:basic');
      assert.ok(n.message.length <= 160 && n.title.length <= 80);
    }
    assert.ok(db.locks >= 1, 'advisory lock serializes double submits');
    assert.equal(db.mails.length, 1);
    state.notifications.push({ groupKey: 'organizer-request:basic', createdAt: new Date(now.getTime() - 60 * 60 * 1000) });
    const limited = await svc.submitOrganizerRequest(validRequest, as({ id: 'basic', role: 'BASIC' }), () => now);
    assert.equal(limited.success, false); assert.match(limited.message, /24 horas/);
    assert.equal(db.created.length, 2, 'rate-limited request creates nothing');
    const later = await svc.submitOrganizerRequest(validRequest, as({ id: 'basic', role: 'BASIC' }), () => new Date(now.getTime() + 24 * 60 * 60 * 1000));
    assert.equal(later.success, true, 'window reopens after 24h');
    const basicPlans = await svc.submitOrganizerRequest({ ...validRequest, interest: 'plans' }, as({ id: 'basic', role: 'BASIC' }), () => now);
    assert.equal(basicPlans.success, true, 'joining the plans list is not blocked by a recent access request');
    assert.equal(db.created.at(-1).groupKey, 'organizer-plans:basic', 'plan interest uses its own 24h window');
    const plans = await svc.submitOrganizerRequest({ ...validRequest, interest: 'plans' }, as({ id: 'promoter', role: 'PROMOTER' }), () => now);
    assert.equal(plans.success, true, 'promoters can join the plans interest list');
    assert.match(db.created.at(-1).title, /Pro\/Enterprise/);
  }
  // No admins: explicit failure, no silent success
  {
    const state = baseState(); state.users = state.users.filter(u => u.role !== 'ADMIN'); const svc = loadService(fakeDb(state));
    assert.equal((await svc.submitOrganizerRequest(validRequest, as({ id: 'basic', role: 'BASIC' }))).success, false);
  }
  // DB failure: generic message, no internals
  {
    const state = baseState(); const db = fakeDb(state); db.$transaction = async () => { throw new Error('connection string postgres://secret'); }; const svc = loadService(db);
    const failed = await svc.submitOrganizerRequest(validRequest, as({ id: 'basic', role: 'BASIC' }));
    assert.equal(failed.success, false); assert.ok(!/postgres|secret/.test(failed.message));
  }
  // Self-service organizer activation (events still go through admin review)
  {
    const state = baseState(); const db = fakeDb(state); const svc = loadService(db);
    const activation = { acceptTerms: true, brandName: '  Coletivo  Sarau ', city: 'Campinas' };
    assert.match((await svc.activateOrganizer(activation, as(null))).message, /Entre/);
    const invalid = await svc.activateOrganizer({ ...activation, acceptTerms: false }, as({ id: 'basic', role: 'BASIC' }));
    assert.equal(invalid.success, false); assert.ok(invalid.fieldErrors.acceptTerms, 'terms must be accepted');
    assert.equal((await svc.activateOrganizer(activation, as({ id: 'admin-1', role: 'ADMIN' }))).success, false);
    assert.equal((await svc.activateOrganizer(activation, as({ id: 'promoter', role: 'PROMOTER' }))).success, false);
    const unverified = await svc.activateOrganizer(activation, as({ id: 'unverified', role: 'BASIC' }));
    assert.equal(unverified.success, false); assert.match(unverified.message, /confirm/i, 'unverified e-mail cannot self-activate');
    assert.equal(db.roleChanges.length, 0, 'nothing changes before the checks pass');
    const done = await svc.activateOrganizer(activation, as({ id: 'basic', role: 'BASIC' }));
    assert.equal(done.success, true);
    assert.deepEqual(db.roleChanges, [{ id: 'basic', role: 'PROMOTER' }]);
    assert.equal(db.audits.length, 1); assert.equal(db.audits[0].actorId, 'basic'); assert.equal(db.audits[0].action, 'ROLE_CHANGE'); assert.match(db.audits[0].reason, /BASIC -> PROMOTER/); assert.match(db.audits[0].reason, /autoatendimento/);
    const own = db.created.find(n => n.userId === 'basic');
    assert.ok(own && own.href === '/CriarEvento' && own.groupKey === 'organizer-promoted:basic', 'the new organizer gets the welcome notice');
    const adminNotes = db.created.filter(n => n.userId !== 'basic');
    assert.equal(adminNotes.length, 2, 'active admins are told about the new organizer');
    for (const n of adminNotes) { assert.equal(n.type, 'ADMIN'); assert.equal(n.groupKey, 'organizer-self:basic'); assert.equal(n.href, '/admin?q=basic%2Borg%40ex.com'); assert.ok(n.message.length <= 160); assert.match(n.message, /Coletivo Sarau/); }
    const again = await svc.activateOrganizer(activation, as({ id: 'basic', role: 'BASIC' }));
    assert.equal(again.success, false, 'a stale BASIC session cannot activate twice'); assert.equal(db.roleChanges.length, 1);
    const google = await svc.activateOrganizer(activation, as({ id: 'google', role: 'BASIC' }));
    assert.equal(google.success, true, 'Google accounts count as verified');
  }
  {
    const state = baseState(); const db = fakeDb(state); db.$transaction = async () => { throw new Error('postgres://secret'); }; const svc = loadService(db);
    const failed = await svc.activateOrganizer({ acceptTerms: true, brandName: 'Marca', city: 'SP' }, as({ id: 'basic', role: 'BASIC' }));
    assert.equal(failed.success, false); assert.ok(!/postgres|secret/.test(failed.message));
  }
  // Event claim
  {
    const state = baseState(); const db = fakeDb(state); const svc = loadService(db);
    const claim = { eventId: id, contact: '@org_oficial', message: 'Sou o produtor' };
    assert.equal((await svc.submitEventClaim(claim, as(null))).success, false);
    assert.equal((await svc.submitEventClaim(claim, as({ id: 'admin-2', role: 'ADMIN' }))).success, false, 'admins transfer directly');
    const owned = await svc.submitEventClaim({ ...claim, eventId: '1b6b7b5e-3f0a-4c8e-9d7e-2a1b3c4d5e6f' }, as({ id: 'basic', role: 'BASIC' }));
    assert.equal(owned.success, false, 'only platform-held (admin-owned) events can be claimed');
    const ok = await svc.submitEventClaim(claim, as({ id: 'basic', role: 'BASIC' }), () => now);
    assert.equal(ok.success, true);
    assert.equal(db.created.length, 2);
    assert.ok(db.created.every(n => n.href === `/eventos/${id}` && n.type === 'ADMIN' && n.groupKey === `event-claim:basic:${id}`));
    state.notifications.push({ groupKey: `event-claim:basic:${id}`, createdAt: now });
    assert.match((await svc.submitEventClaim(claim, as({ id: 'basic', role: 'BASIC' }), () => now)).message, /últimas 24 horas/);
    state.notifications.push({ groupKey: 'event-claim:promoter:x', createdAt: now }, { groupKey: 'event-claim:promoter:y', createdAt: now }, { groupKey: 'event-claim:promoter:z', createdAt: now });
    assert.match((await svc.submitEventClaim(claim, as({ id: 'promoter', role: 'PROMOTER' }), () => now)).message, /até 3 eventos/);
  }
  // Ownership transfer
  {
    const state = baseState(); const db = fakeDb(state); const svc = loadService(db);
    assert.equal((await svc.transferEventOwnership({ eventId: id, newOwnerEmail: 'promo@ex.com' }, as({ id: 'basic', role: 'BASIC' }))).success, false, 'admin only');
    assert.equal(db.updates.length, 0);
    const notPromoter = await svc.transferEventOwnership({ eventId: id, newOwnerEmail: 'basic+org@ex.com' }, as({ id: 'admin-2', role: 'ADMIN' }));
    assert.equal(notPromoter.success, false); assert.ok(notPromoter.fieldErrors.newOwnerEmail);
    assert.equal((await svc.transferEventOwnership({ eventId: id, newOwnerEmail: 'nobody@ex.com' }, as({ id: 'admin-2', role: 'ADMIN' }))).success, false);
    assert.equal((await svc.transferEventOwnership({ eventId: 'x', newOwnerEmail: 'promo@ex.com' }, as({ id: 'admin-2', role: 'ADMIN' }))).success, false, 'zod validation');
    const done = await svc.transferEventOwnership({ eventId: id, newOwnerEmail: 'PROMO@ex.com' }, as({ id: 'admin-2', role: 'ADMIN' }));
    assert.equal(done.success, true);
    assert.equal(state.events[0].userId, 'promoter');
    assert.equal(db.history.length, 1); assert.equal(db.history[0].action, 'UPDATED'); assert.equal(db.history[0].actorId, 'admin-2'); assert.equal(db.history[0].promoterId, 'promoter');
    assert.deepEqual(db.created.map(n => n.userId).sort(), ['admin-1', 'promoter'], 'new and previous owners are notified');
    assert.ok(db.created.every(n => n.type === 'EVENT_CHANGE'));
    assert.equal((await svc.transferEventOwnership({ eventId: id, newOwnerEmail: 'promo@ex.com' }, as({ id: 'admin-2', role: 'ADMIN' }))).success, false, 'same owner');
  }
  // Promotion notice helper (for the role-change hook) passes notification validation
  {
    const svc = loadService(fakeDb(baseState()));
    const { validateNotification } = load('lib/notifications/create.ts');
    const notice = validateNotification(svc.organizerPromotionNotice('user-1'));
    assert.equal(notice.type, 'ADMIN'); assert.equal(notice.href, '/CriarEvento'); assert.equal(notice.userId, 'user-1');
  }

  // ---------- server actions: impersonation cannot speak for the account ----------
  const action = read('app/(actions)/organizer/action.ts');
  assert.match(action, /^"use server";/);
  assert.match(action, /allowImpersonation:\s*false/);
  for (const name of ['requestOrganizerAccess', 'activateOrganizerAccess', 'claimEventOwnership', 'transferEventOwnership']) assert.match(action, new RegExp(`export async function ${name}\\(`));

  // ---------- routes ----------
  const roles = load('roles.ts');
  for (const route of ['/termos', '/para-organizadores']) assert.ok(roles.publicRoutes.includes(route), `${route} is public`);
  const policy = load('lib/authPolicy.ts', { '@/roles': roles });
  assert.ok(policy.isPublicPath('/termos') && policy.isPublicPath('/para-organizadores'));
  const matcher = /matcher:\s*\[([^\]]*)\]/.exec(read('middleware.ts'))[1];
  assert.ok(!/termos|para-organizadores/.test(matcher), 'middleware does not gate the new public pages');

  // ---------- UI contracts ----------
  const footer = read('components/MyComponents/SiteFooter.tsx');
  for (const [href, label] of [['/para-organizadores', 'Para organizadores'], ['/termos', 'Termos de Uso'], ['/privacidade', 'Privacidade']]) assert.ok(footer.includes(`href: "${href}", label: "${label}"`), `footer link ${label}`);
  const terms = read('app/(publicRoutes)/termos/page.tsx');
  assert.match(terms, /validação jurídica/); assert.match(terms, /ainda não foi revisado por advogado/);
  assert.match(terms, /href="\/privacidade"/); assert.match(terms, /LGPD|13\.709/);
  for (const topic of ['participantes', 'organizadores', 'conteudo', 'moderacao', 'responsabilidade']) assert.match(terms, new RegExp(`id: "${topic}"`));
  const register = read('components/register-form.tsx');
  assert.match(register, /Ao criar sua conta, você concorda com os/);
  assert.match(register, /href="\/termos"/);
  const landing = read('app/(publicRoutes)/para-organizadores/page.tsx');
  assert.ok(!/R\$\s?\d|depoimento|testemunh/i.test(landing), 'no prices or testimonials');
  assert.match(landing, /Piloto gratuito para os primeiros organizadores/); assert.ok(!/organizadores selecionados/.test(landing));
  assert.match(landing, /10% por ingresso vendido/); assert.ok(!/20%/.test(landing), 'ticket fee is 10% everywhere on the landing');
  assert.match(landing, /triagem automática/);
  const eventForm = read('components/MyComponents/EventoForm.tsx');
  assert.match(eventForm, /: \"Enviar evento\"\}<\/Button>/); assert.ok(!/Enviar para análise|passa por validação antes de aparecer/.test(eventForm), 'form explains the automatic triage');
  assert.match(eventForm, /Ao enviar, o evento passa por uma triagem automática\./);
  assert.match(eventForm, /result\.triage\?\.applied === \"published\"/); assert.match(eventForm, /result\.triage\?\.applied === \"changes\"/);
  assert.match(eventForm, /router\.push\(`\/eventos\/\$\{encodeURIComponent\(result\.evento\.id\)\}\/editar`\)/, 'changes go back to the edit page');
  assert.match(eventForm, /initialEvent\?\.status === \"CHANGES_REQUESTED\" && initialEvent\.reviewNote/, 'the edit form shows the review note');
  assert.match(landing, /Pro e Enterprise/);
  assert.match(landing, /interest="plans"/); assert.match(landing, /interest="access"/);
  assert.ok(!/analisa cada pedido|análise do pedido|aguarde aprovação/i.test(landing), 'landing reflects instant organizer activation');
  assert.match(landing, /id="pedir-acesso"/); assert.match(landing, /id="planos"/);
  const panel = read('components/MyComponents/organizer/OrganizerRequestPanel.tsx');
  assert.match(panel, /import \{ OrganizerActivationForm \} from "\.\/OrganizerActivationForm";/);
  assert.match(panel, /interest === "access" && role === "BASIC"\) return <OrganizerActivationForm \/>/, 'BASIC accounts activate instead of requesting');
  assert.match(panel, /<OrganizerRequestForm interest=\{interest\} \/>/, 'plans interest keeps the request form');
  const activationForm = read('components/MyComponents/organizer/OrganizerActivationForm.tsx');
  assert.match(activationForm, /^"use client";/); assert.match(activationForm, /activateOrganizerAccess\(/); assert.match(activationForm, /await update\(/);
  assert.match(activationForm, /router\.push\("\/CriarEvento\?boasvindas=1"\)/); assert.match(activationForm, /href="\/termos"/); assert.match(activationForm, /role="alert"/);
  assert.match(read('components/MyComponents/organizer/OrganizerAccessCard.tsx'), /<OrganizerActivationForm \/>/);
  const createPage = read('app/(private)/CriarEvento/page.tsx');
  assert.ok(!/^"use client"/.test(createPage), 'create page stays a server component');
  assert.match(createPage, /searchParams\?\.boasvindas === "1"/); assert.match(createPage, /Sua conta de organizador está ativa/); assert.match(createPage, /href="\/myEvents\/pagamentos"/);
  const profile = read('app/(private)/Profile/page.tsx');
  assert.match(profile, /maxLength=\{1000\}/); assert.ok(!/maxLength=\{600\}|\/600 caracteres/.test(profile), 'bio limit aligned to the service (1000)');
  assert.match(read('lib/services/promoters.ts'), /bio\.length > 1000/);
  assert.match(profile, /account\.role === "BASIC" && <OrganizerAccessCard \/>/);
  assert.match(read('app/(adminRoutes)/admin/page.tsx'), /<TransferEventOwnership \/>/);
  const claim = read('components/MyComponents/organizer/ClaimEventCta.tsx');
  assert.match(claim, /^"use client";/); assert.match(claim, /export default function ClaimEventCta\(\{ eventId, eventName \}: ClaimEventCtaProps\)/);
  assert.match(read('components/MyComponents/organizer/TransferEventOwnership.tsx'), /<ConfirmAction /, 'transfer requires confirmation');

  console.log('PASS: commercial growth (organizer requests, claims, ownership transfer, terms, landing, footer, routes)');
})().catch(error => { console.error(error); process.exitCode = 1; });
