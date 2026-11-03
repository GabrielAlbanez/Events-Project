// Explicitly opt in only against an isolated test database with migrations applied.
// Optional HTTP mode: also set PARTY_GLOBAL_PROFILE_HTTP_URL=http://localhost:3100
// and start the built application against this SAME isolated migrated database.
// Runs real production services/Prisma; every fixture is new and cleanup is ID-scoped.
const assert = require('node:assert/strict');
if (process.env.PARTY_GLOBAL_PROFILE_DB_TEST !== 'isolated-fixtures') {
  console.log('SKIP: set PARTY_GLOBAL_PROFILE_DB_TEST=isolated-fixtures to authorize isolated DB fixtures');
  process.exit(0);
}
require('dotenv').config();
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient(), cache = new Map();
let phase = 'initialization';
function load(file) {
  file = path.resolve(file); if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const dependency = name => name === '@/lib/prisma' ? { __esModule: true, default: db } : name.startsWith('@/') ? load(name.slice(2) + '.ts') : name.startsWith('.') ? load(path.resolve(path.dirname(file), name) + '.ts') : require(name);
  new Function('require', 'module', 'exports', code)(dependency, module, module.exports);
  return module.exports;
}
const users = [randomUUID(), randomUUID(), randomUUID()], events = [randomUUID(), randomUUID()];
const [a,b,c] = users, [one,two] = events;
const actor = id => ({ id, role: 'BASIC' });
const profile = { displayName: 'Isolated party test', photoUrl: '', bio: 'Fixture', interests: ['Music'], intent: 'FRIENDSHIP', adultDeclared: false };
async function run() {
  const { updatePartyProfile, partyProfileSnapshot } = load('lib/partyConnections/profile.ts');
  const { connectionsAction } = load('lib/partyConnections/actions.ts');
  const { connectionsSnapshot } = load('lib/partyConnections/snapshot.ts');
  const { privateHistory, privateSend } = load('lib/partyConnections/messages.ts');
  phase = 'db.create-fixtures';
  await db.user.createMany({ data: users.map(id => ({ id, name: 'Isolated party fixture' })) });
  await db.events.createMany({ data: events.map(id => ({ id, nome: 'Isolated party fixture', banner: '', carrossel: [], descricao: '', dataInicio: '2099-01-01', dataFim: '2099-01-02', linkParaCompra: '', endereco: '', status: 'PUBLISHED' })) });
  phase = 'db.save-global';
  await updatePartyProfile(actor(a), profile);
  phase = 'db.reject-foreign-photo';
  await assert.rejects(updatePartyProfile(actor(a), { ...profile, photoUrl: '/api/party-profile-media/' + randomUUID() }), e => e.status === 403);
  assert.equal((await partyProfileSnapshot(actor(a))).profile.photoUrl, '');
  assert.equal(await db.eventRegistration.count({ where: { userId: a } }), 0);
  assert.equal(await db.partyProfile.count({ where: { userId: a } }), 0, 'Save cannot opt in');
  await assert.rejects(connectionsAction(one, actor(a), { action: 'profile.join' }), e => e.status === 403);
  phase = 'db.create-registrations';
  await db.eventRegistration.createMany({ data: events.flatMap(eventId => [a,b,c].map(userId => ({ eventId, userId }))) });
  await assert.rejects(connectionsAction(one, actor(c), { action: 'profile.join' }), e => e.status === 409);
  // A legacy imported draft must be explicitly reviewed; no legacy participation is changed.
  phase = 'db.create-legacy-profiles';
  await db.partyProfile.create({ data: { eventId: one, userId: c, ...profile, bio: 'Older legacy', updatedAt: new Date('2020-01-01'), active: true } });
  await db.partyProfile.create({ data: { eventId: two, userId: c, ...profile, bio: 'Latest legacy', updatedAt: new Date('2021-01-01'), active: false } });
  const allLegacy = await db.partyProfile.findMany({ where: { userId: c }, orderBy: { eventId: 'asc' } });
  const legacy = await db.partyProfile.findUnique({ where: { eventId_userId: { eventId: two, userId: c } } });
  // Execute the actual backfill statement scoped to our new user, never existing users.
  const migration = fs.readFileSync('prisma/migrations/20261031150000_party_user_profile/migration.sql', 'utf8');
  const backfill = migration.slice(migration.indexOf('INSERT INTO')).replace('FROM \"PartyProfile\"', 'FROM \"PartyProfile\" WHERE \"userId\" = $1');
  phase = 'db.execute-scoped-backfill';
  await db.$executeRawUnsafe(backfill, c);
  assert.deepEqual(await db.partyProfile.findMany({ where: { userId: c }, orderBy: { eventId: 'asc' } }), allLegacy, 'Backfill cannot change any legacy opt-in or field');
  assert.equal((await partyProfileSnapshot(actor(c))).needsReview, true);
  assert.equal((await partyProfileSnapshot(actor(c))).profile.bio, 'Latest legacy', 'Actual backfill selects most recent event profile');
  await assert.rejects(connectionsAction(one, actor(c), { action: 'profile.join' }), e => e.status === 409);
  assert.deepEqual(await db.partyProfile.findUnique({ where: { eventId_userId: { eventId: two, userId: c } } }), legacy);
  phase = 'db.review-import';
  await updatePartyProfile(actor(c), profile);
  assert.equal((await partyProfileSnapshot(actor(c))).needsReview, false);
  phase = 'db.join-two-events';
  for (const id of [a,b]) { await updatePartyProfile(actor(id), profile); for (const event of events) await connectionsAction(event, actor(id), { action: 'profile.join' }); }
  await connectionsAction(two, actor(a), { action: 'profile.leave' });
  phase = 'db.materialize-profile';
  await updatePartyProfile(actor(a), { ...profile, bio: 'Updated globally' });
  const participations = await db.partyProfile.findMany({ where: { userId: a } });
  assert.ok(participations.every(p => p.bio === 'Updated globally'));
  assert.equal(participations.find(p => p.eventId === one).active, true);
  assert.equal(participations.find(p => p.eventId === two).active, false);
  await connectionsAction(two, actor(a), { action: 'profile.join' });
  phase = 'db.mutual-matches';
  for (const event of events) { await connectionsAction(event, actor(a), { action: 'like', userId: b }); await connectionsAction(event, actor(b), { action: 'like', userId: a }); }
  const matches = await db.partyMatch.findMany({ where: { eventId: { in: events } } });
  const first = matches.find(m => m.eventId === one), second = matches.find(m => m.eventId === two);
  await assert.rejects(privateHistory(two, first.id, actor(a), {}), e => e.status === 403);
  phase = 'db.private-message';
  await privateSend(one, first.id, actor(a), { clientId: randomUUID(), text: 'Isolated message' });
  phase = 'db.incompatible-edit';
  await updatePartyProfile(actor(a), { ...profile, intent: 'DATING', adultDeclared: true });
  assert.equal((await connectionsSnapshot(one, actor(a))).matches.length, 0, 'Incompatible global edits immediately hide matches');
  await assert.rejects(privateHistory(one, first.id, actor(a), {}), e => e.status === 403);
  assert.ok(await db.communitySignal.count({ where: { room: 'match:' + first.id } }), 'Edit invalidates live match access');
  await updatePartyProfile(actor(a), profile);
  await connectionsAction(one, actor(a), { action: 'profile.leave' });
  await privateHistory(two, second.id, actor(a), {});
  assert.equal((await partyProfileSnapshot(actor(a))).profile.displayName, profile.displayName);
  assert.equal((await db.partyProfile.findUnique({ where: { eventId_userId: { eventId: two, userId: a } } })).active, true);
  phase = 'db.concurrent-join-save';
  await Promise.all([connectionsAction(one, actor(a), { action: 'profile.join' }), updatePartyProfile(actor(a), { ...profile, bio: 'Concurrent save' })]);
  assert.equal((await db.partyProfile.findUnique({ where: { eventId_userId: { eventId: one, userId: a } } })).bio, 'Concurrent save');
  assert.equal((await partyProfileSnapshot(actor(a))).profile.bio, 'Concurrent save');
  if (process.env.PARTY_GLOBAL_PROFILE_HTTP_URL) await verifyHttp();
  console.log('PASS real DB: private global save, reviewed participant join, materialization/opt-in isolation, event-private chat, incompatible edits, signals and concurrent join/save');
}
async function verifyHttp() {
  phase = 'http.initialize';
  const base = new URL(process.env.PARTY_GLOBAL_PROFILE_HTTP_URL);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'HTTP tests require a local app');
  assert.ok(!base.username && !base.password && base.protocol === 'http:', 'HTTP tests require local HTTP');
  const owner = randomUUID(), other = randomUUID(); users.push(owner, other);
  const password = randomUUID() + randomUUID();
  const email = owner + '@party-fixture.invalid';
  const hash = await require('bcrypt').hash(password, 10);
  const initialImage = '/isolated-account-avatar.png';
  phase = 'http.create-fixtures';
  await db.user.create({ data: { id: owner, email, password: hash, emailVerified: true, image: initialImage } });
  await db.user.create({ data: { id: other, name: 'Isolated HTTP other' } });
  await db.partyUserProfile.create({ data: { userId: other, ...profile, bio: 'Other isolated profile' } });
  const otherBefore = await db.partyUserProfile.findUnique({ where: { userId: other } });
  const jar = new Map();
  async function request(route, init = {}, authenticated = true) {
    const headers = new Headers(init.headers);
    if (authenticated && jar.size) headers.set('cookie', [...jar].map(([key,value]) => key + '=' + value).join('; '));
    const response = await fetch(new URL(route, base), { ...init, headers, redirect: 'manual' });
    if (authenticated) for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0], separator = pair.indexOf('=');
      jar.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    return response;
  }
  phase = 'http.unauthenticated-get';
  assert.equal((await request('/api/party-profile', {}, false)).status, 401);
  phase = 'http.protected-page-redirect';
  const protectedPage = await request('/perfil-conexoes', {}, false);
  assert.equal(protectedPage.status, 307);
  const loginLocation = new URL(protectedPage.headers.get('location'), base);
  assert.equal(loginLocation.pathname, '/login');
  // Return-to-login support is optional in the host middleware; when provided it must stay local.
  const returnPath = loginLocation.searchParams.get('callbackUrl');
  if (returnPath !== null) assert.equal(returnPath, '/perfil-conexoes');
  phase = 'http.csrf';
  const csrfResponse = await request('/api/auth/csrf');
  assert.equal(csrfResponse.status, 200);
  const csrf = (await csrfResponse.json()).csrfToken;
  assert.equal(typeof csrf, 'string');
  phase = 'http.credentials-login';
  const login = await request('/api/auth/callback/credentials', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base.origin, 'x-auth-return-redirect': '1' }, body: new URLSearchParams({ csrfToken: csrf, email, password, callbackUrl: base.origin, json: 'true' }) });
  assert.ok([200,302].includes(login.status), 'Fixture credentials login must succeed');
  phase = 'http.fixture-session';
  const session = await request('/api/auth/session');
  assert.equal((await session.json()).user?.id, owner, 'Session must belong to fixture');
  const send = (route, body, origin = base.origin, method = 'PUT') => request(route, { method, headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) });
  const endpoint = '/api/party-connections/' + one;
  phase = 'http.invalid-method';
  assert.equal((await request('/api/party-profile', { method: 'PATCH' })).status, 405);
  phase = 'http.cross-origin-denial';
  assert.equal((await send('/api/party-profile', profile, 'https://cross-origin.invalid')).status, 403);
  phase = 'http.strict-profile-input';
  assert.equal((await send('/api/party-profile', { ...profile, userId: other })).status, 400);
  assert.equal((await send(endpoint, { action: 'profile.join' }, base.origin, 'POST')).status, 403, 'Join needs confirmed registration');
  phase = 'http.save-global';
  const saved = await send('/api/party-profile', profile);
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).profile.displayName, profile.displayName);
  phase = 'http.private-cache';
  const get = await request('/api/party-profile');
  assert.equal(get.status, 200);
  assert.equal(get.headers.get('cache-control'), 'private, no-store');
  assert.match(get.headers.get('vary'), /Cookie/i);
  assert.equal(await db.eventRegistration.count({ where: { userId: owner } }), 0);
  assert.equal(await db.partyProfile.count({ where: { userId: owner } }), 0);
  assert.equal((await db.user.findUnique({ where: { id: owner } })).image, initialImage);
  assert.deepEqual(await db.partyUserProfile.findUnique({ where: { userId: other } }), otherBefore);
  phase = 'http.event-snapshot';
  const snapshot = await request(endpoint);
  assert.equal(snapshot.status, 200);
  const snapshotBody = await snapshot.json();
  assert.equal(snapshotBody.savedProfile.displayName, profile.displayName);
  assert.equal(snapshotBody.mine, null);
  assert.equal(snapshotBody.eligible, false);
  phase = 'http.register-fixture';
  await db.eventRegistration.create({ data: { eventId: one, userId: owner } });
  await db.partyUserProfile.update({ where: { userId: owner }, data: { needsReview: true } });
  assert.equal((await send(endpoint, { action: 'profile.join' }, base.origin, 'POST')).status, 409);
  assert.equal((await send(endpoint, { action: 'profile.join', userId: other }, base.origin, 'POST')).status, 400);
  phase = 'http.review-profile';
  assert.equal((await send('/api/party-profile', { ...profile, bio: 'HTTP review' })).status, 200);
  phase = 'http.join-event';
  assert.equal((await send(endpoint, { action: 'profile.join' }, base.origin, 'POST')).status, 200);
  // The same fixture session must receive the real outbox invalidation over Socket.IO.
  phase = 'socket.initialize';
  const socket = require('socket.io-client').io(base.origin, {
    autoConnect: false, reconnection: false, timeout: 12000,
    extraHeaders: { Cookie: [...jar].map(([key,value]) => key + '=' + value).join('; '), Origin: base.origin },
  });
  let updateTimer, updateListener;
  try {
  phase = 'socket.connect';
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error('Fixture socket connection timeout')); }, 12000);
      const cleanup = () => { clearTimeout(timer); socket.off('connect', connected); socket.off('connect_error', failed); };
      const connected = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error('Fixture socket connection failed')); };
      socket.once('connect', connected); socket.once('connect_error', failed); socket.connect();
    });
  phase = 'socket.subscribe-party';
    const subscribed = await new Promise((resolve, reject) => {
      socket.timeout(12000).emit('community-subscribe', { partyEventId: one }, (error, ack) => {
        if (error) reject(new Error('Fixture party subscription timeout')); else resolve(ack);
      });
    });
    assert.equal(subscribed?.ok, true, 'Fixture session must be authorized in its party room');
    const updated = new Promise((resolve, reject) => {
      updateListener = message => { if (message?.room === 'party:' + one) resolve(); };
      socket.on('community-updated', updateListener);
      updateTimer = setTimeout(() => reject(new Error('Global profile update did not reach fixture party socket')), 12000);
    });
    updated.catch(() => {}); // Keep a PUT failure from leaving an unhandled pending timeout.
  phase = 'socket.http-global-save';
    assert.equal((await send('/api/party-profile', { ...profile, bio: 'HTTP realtime global edit' })).status, 200);
  phase = 'socket.await-outbox-update';
    await updated;
  phase = 'socket.updated-snapshot';
    const realtimeSnapshot = await request(endpoint);
    assert.equal(realtimeSnapshot.status, 200);
    assert.equal((await realtimeSnapshot.json()).mine.bio, 'HTTP realtime global edit');
  } finally {
    clearTimeout(updateTimer);
    if (updateListener) socket.off('community-updated', updateListener);
    socket.disconnect();
  }
  phase = 'http.leave-event';
  assert.equal((await send(endpoint, { action: 'profile.leave' }, base.origin, 'POST')).status, 200);
  phase = 'http.save-inactive';
  assert.equal((await send('/api/party-profile', { ...profile, bio: 'HTTP saved inactive' })).status, 200);
  assert.equal((await db.partyProfile.findUnique({ where: { eventId_userId: { eventId: one, userId: owner } } })).active, false, 'HTTP save preserves inactive participation');
  assert.equal((await db.user.findUnique({ where: { id: owner } })).image, initialImage);
  assert.deepEqual(await db.partyUserProfile.findUnique({ where: { userId: other } }), otherBefore);
  console.log('PASS real HTTP: credentials fixture, authentication, origin, strict input, private caching, global isolation, explicit reviewed event opt-in and real Socket.IO outbox invalidation');
}
run().catch(error => { console.error('FAIL real party global profile:', JSON.stringify({ phase, code: error.code || error.name, transactionExpired: /expired|transaction.*closed|timeout/i.test(String(error.meta?.error ?? '')), ...(typeof error.actual === 'number' && typeof error.expected === 'number' ? { actual: error.actual, expected: error.expected } : {}) })); process.exitCode = 1; }).finally(async () => {
  try {
    const fixtureMatches = await db.partyMatch.findMany({ where: { eventId: { in: events } }, select: { id: true } });
    await db.communitySignal.deleteMany({ where: { room: { in: fixtureMatches.map(m => 'match:' + m.id) } } });
    await db.events.deleteMany({ where: { id: { in: events } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.communitySignal.deleteMany({ where: { OR: [{ room: { in: [...events.map(id => 'party:' + id), ...users.map(id => 'user:' + id)] } }] } });
  } catch { console.error('Fixture cleanup failed; fixture IDs:', JSON.stringify({ users, events })); process.exitCode = 1; }
  await db.$disconnect();
});
