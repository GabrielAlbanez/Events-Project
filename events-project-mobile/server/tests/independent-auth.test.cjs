const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { build } = require('esbuild');

const sourceRoot = path.resolve(__dirname, '../independent/src');
async function loadTypeScript(entry) {
  const filename = path.join(sourceRoot, entry);
  const result = await build({
    entryPoints: [filename],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    packages: 'external',
    write: false,
  });
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(result.outputFiles[0].text, filename);
  return compiled.exports;
}

let authModule;
let tokenModule;
let httpModule;
let repositoryModule;
let eventModule;
let interactionModule;
let accountModule;
let promoterModule;
before(async () => {
  [authModule, tokenModule, httpModule, repositoryModule, eventModule, interactionModule, accountModule, promoterModule] = await Promise.all([
    loadTypeScript('auth-service.ts'),
    loadTypeScript('access-token.ts'),
    loadTypeScript('http-server.ts'),
    loadTypeScript('postgres-auth-repository.ts'),
    loadTypeScript('event-repository.ts'),
    loadTypeScript('interaction-service.ts'),
    loadTypeScript('account-service.ts'),
    loadTypeScript('promoter-service.ts'),
  ]);
});

const validProfile = {
  subject: 'google-subject-1',
  email: 'Person@Example.com',
  emailVerified: true,
  name: 'Person Example',
  image: 'https://example.com/person.jpg',
};

function user(overrides = {}) {
  return {
    id: 'user-1',
    name: 'Person Example',
    email: 'person@example.com',
    image: 'https://example.com/person.jpg',
    role: 'BASIC',
    emailVerified: true,
    suspendedAt: null,
    suspendedUntil: null,
    sessionVersion: 0,
    ...overrides,
  };
}

function repository(overrides = {}) {
  const users = new Map();
  const accounts = new Map();
  return {
    users,
    accounts,
    async findGoogleAccount(subject) {
      const id = accounts.get(subject);
      return id ? users.get(id) ?? null : null;
    },
    async findUserByEmail(email) {
      return [...users.values()].find(item => item.email?.toLowerCase() === email.toLowerCase()) ?? null;
    },
    async createGoogleAccount(profile) {
      const record = user({ id: `user-${users.size + 1}`, email: profile.email, name: profile.name, image: profile.image });
      users.set(record.id, record);
      accounts.set(profile.subject, record.id);
      return record;
    },
    async findUserById(id) {
      return users.get(id) ?? null;
    },
    ...overrides,
  };
}

test('Google login creates one DB account and returns the mobile session contract', async () => {
  const repo = repository();
  const accessToken = tokenModule.createAccessToken('m'.repeat(48), () => 1_800_000_000_000);
  const auth = authModule.createMobileAuthService({ repository: repo, accessToken, now: () => new Date(1_800_000_000_000) });
  const result = await auth.googleLogin(validProfile);

  assert.equal(result.user.email, 'person@example.com');
  assert.equal(result.user.provider, 'google');
  assert.equal(repo.accounts.get(validProfile.subject), result.user.id);
  assert.deepEqual(accessToken.verify(result.token), { subject: result.user.id, sessionVersion: 0, provider: 'google' });
  assert.equal(Date.parse(result.expiresAt), 1_800_604_800_000);
});

test('Google login reuses a linked account and rejects email-based account linking', async () => {
  const linked = user();
  const repo = repository({
    async findGoogleAccount(subject) {
      return subject === validProfile.subject ? linked : null;
    },
    async findUserByEmail() {
      return linked;
    },
    async createGoogleAccount() {
      assert.fail('An existing Google account must not be recreated.');
    },
  });
  const auth = authModule.createMobileAuthService({
    repository: repo,
    accessToken: tokenModule.createAccessToken('m'.repeat(48)),
  });
  assert.equal((await auth.googleLogin(validProfile)).user.id, linked.id);

  const duplicateEmail = repository({
    async findUserByEmail() {
      return user();
    },
  });
  const blocked = authModule.createMobileAuthService({
    repository: duplicateEmail,
    accessToken: tokenModule.createAccessToken('m'.repeat(48)),
  });
  await assert.rejects(blocked.googleLogin(validProfile), error => error.status === 409);
});

test('Google creation race only succeeds after the matching provider account appears', async () => {
  const linked = user();
  let ready = false;
  const repo = repository({
    async findGoogleAccount(subject) {
      return ready && subject === validProfile.subject ? linked : null;
    },
    async createGoogleAccount() {
      ready = true;
      throw new authModule.GoogleAccountConflictError();
    },
  });
  const auth = authModule.createMobileAuthService({
    repository: repo,
    accessToken: tokenModule.createAccessToken('m'.repeat(48)),
  });
  assert.equal((await auth.googleLogin(validProfile)).user.id, linked.id);
});

test('credential login uses existing bcrypt hashes and issues a revocable mobile session', async () => {
  const bcrypt = require('bcryptjs');
  const password = 'secure-password-123';
  const hash = await bcrypt.hash(password, 4);
  const record = user({ password: hash });
  const pool = {
    async query(sql, values) {
      assert.match(sql, /lower\(email\) = \$1/);
      assert.deepEqual(values, ['person@example.com']);
      return { rows: [record], rowCount: 1 };
    },
  };
  const tokenService = tokenModule.createAccessToken('m'.repeat(48));
  const service = new accountModule.PostgresAccountService(pool, tokenService, async () => {}, 'eventmap:///');
  const login = await service.login({ email: ' Person@Example.com ', password });
  assert.equal(login.user.provider, 'credentials');
  assert.equal(tokenService.verify(login.token).provider, 'credentials');
  await assert.rejects(service.login({ email: 'person@example.com', password: 'wrong-password' }), error => error.status === 401);
});

test('registration stores a pending credential account transactionally and verifies its single-use email token', async () => {
  const queries = [];
  const now = new Date('2026-10-07T12:00:00.000Z');
  let emailSent = '';
  const pool = {
    async query(sql, values) {
      queries.push({ sql, values });
      if (sql.startsWith('SELECT id FROM "User"')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    },
    async connect() {
      return {
        async query(sql, values) {
          queries.push({ sql, values });
          if (sql.includes('FROM "VerificationTokenEmail"')) {
            return { rows: [{ id: 4, email: 'new@example.com', createdAt: now }], rowCount: 1 };
          }
          if (sql.startsWith('DELETE FROM "VerificationTokenEmail"')) return { rows: [], rowCount: 1 };
          if (sql.startsWith('UPDATE "User" SET "emailVerified"')) return { rows: [], rowCount: 1 };
          return { rows: [], rowCount: 1 };
        },
        release() {},
      };
    },
  };
  const service = new accountModule.PostgresAccountService(
    pool,
    tokenModule.createAccessToken('m'.repeat(48)),
    async (to, subject, text) => { emailSent = `${to}|${subject}|${text}`; },
    'eventmap:///',
    () => now,
  );
  const registered = await service.register({ name: ' New User ', email: 'New@Example.com', password: 'secure-password' });
  assert.equal(registered.status, 'success');
  assert.match(emailSent, /^new@example\.com\|Confirme seu e-mail no EventMap\|Confirme seu e-mail em até 24 horas: eventmap:\/\/\/verify\?token=[a-f0-9]{64}$/);
  assert.ok(queries.some(query => query.sql.startsWith('INSERT INTO "User"')));
  assert.ok(queries.some(query => query.sql.startsWith('INSERT INTO "VerificationTokenEmail"')));
  assert.equal((await service.verifyEmail(queries.find(query => query.sql.startsWith('INSERT INTO "VerificationTokenEmail"')).values[1])).status, 'success');
  assert.ok(queries.some(query => query.sql.startsWith('DELETE FROM "VerificationTokenEmail"')));
});

test('suspension and session-version changes revoke independent mobile sessions', async () => {
  const suspended = user({ suspendedAt: new Date(), suspendedUntil: null });
  const suspendedAuth = authModule.createMobileAuthService({
    repository: repository({
      async findGoogleAccount() {
        return suspended;
      },
    }),
    accessToken: tokenModule.createAccessToken('m'.repeat(48)),
  });
  await assert.rejects(suspendedAuth.googleLogin(validProfile), error => error.status === 403);

  const accessToken = tokenModule.createAccessToken('m'.repeat(48));
  const changedUser = user({ sessionVersion: 1 });
  const auth = authModule.createMobileAuthService({
    repository: repository({
      async findUserById() {
        return changedUser;
      },
    }),
    accessToken,
  });
  await assert.rejects(auth.currentUser(accessToken.issue(changedUser.id, 0)), error => error.status === 401);
});

test('mobile access tokens are signed, bounded, and expire', () => {
  let time = 1_800_000_000_000;
  const accessToken = tokenModule.createAccessToken('m'.repeat(48), () => time);
  const token = accessToken.issue('user-1', 3);
  assert.deepEqual(accessToken.verify(token), { subject: 'user-1', sessionVersion: 3, provider: 'google' });
  assert.throws(() => accessToken.verify(token.replace(/\.[^.]+$/, '.invalid')));
  time += 7 * 24 * 60 * 60 * 1000;
  assert.throws(() => accessToken.verify(token));
  assert.throws(() => tokenModule.createAccessToken('short'));
});

test('PostgreSQL auth repository uses parameterized reads and atomic Google account creation', async () => {
  const queries = [];
  let released = false;
  const row = {
    id: 'user-1',
    name: 'Person Example',
    email: 'person@example.com',
    image: null,
    role: 'BASIC',
    emailVerified: true,
    suspendedAt: null,
    suspendedUntil: null,
    sessionVersion: 0,
  };
  const pool = {
    async query(sql, values) {
      queries.push({ sql, values });
      return { rows: [row] };
    },
    async connect() {
      return {
        async query(sql, values) {
          queries.push({ sql, values });
          return { rows: sql.includes('INSERT INTO "User"') ? [row] : [] };
        },
        release() { released = true; },
      };
    },
  };
  const repo = new repositoryModule.PostgresAuthRepository(pool);
  await repo.findGoogleAccount("subject' OR 1=1");
  assert.deepEqual(queries[0].values, ["subject' OR 1=1"]);
  assert.match(queries[0].sql, /JOIN "User"/);

  const created = await repo.createGoogleAccount(validProfile);
  assert.equal(created.id, row.id);
  assert.deepEqual(
    queries.slice(1).map(item => item.sql.split('\n')[0].trim()),
    ['BEGIN', 'INSERT INTO "User"', 'INSERT INTO "Account" (id, "userId", type, provider, "providerAccountId")', 'COMMIT'],
  );
  assert.match(queries[2].sql, /INSERT INTO "User"/);
  assert.match(queries[3].sql, /INSERT INTO "Account"/);
  assert.equal(queries[2].values[1], validProfile.email);
  assert.equal(queries[3].values[2], validProfile.subject);
  assert.equal(released, true);
});

test('PostgreSQL uniqueness races roll back and become explicit account conflicts', async () => {
  const statements = [];
  let released = false;
  const pool = {
    async connect() {
      return {
        async query(sql) {
          statements.push(sql);
          if (sql.startsWith('INSERT INTO "Account"')) {
            throw Object.assign(new Error('duplicate key'), { code: '23505' });
          }
          return { rows: [{
            id: 'user-1',
            name: null,
            email: 'person@example.com',
            image: null,
            role: 'BASIC',
            emailVerified: true,
            suspendedAt: null,
            suspendedUntil: null,
            sessionVersion: 0,
          }] };
        },
        release() { released = true; },
      };
    },
  };
  const repo = new repositoryModule.PostgresAuthRepository(pool);
  await assert.rejects(repo.createGoogleAccount(validProfile), error => error.name === 'GoogleAccountConflictError');
  assert.deepEqual(statements.map(sql => sql.split('\n')[0].trim()), [
    'BEGIN',
    'INSERT INTO "User"',
    'INSERT INTO "Account" (id, "userId", type, provider, "providerAccountId")',
    'ROLLBACK',
  ]);
  assert.equal(released, true);
});

test('favorite and reminder operations validate events and use scoped SQL', async () => {
  const calls = [];
  const pool = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT "reminderMinutes"')) return { rows: [{ reminderMinutes: 60 }], rowCount: 1 };
      return { rows: [{ id: 'event-1' }], rowCount: 1 };
    },
  };
  const service = new interactionModule.PostgresInteractionService(pool, {}, 'm'.repeat(48));
  assert.deepEqual(await service.favoriteState('event-1', null), { saved: false, reminderMinutes: null });
  assert.deepEqual(await service.favoriteState('event-1', 'user-1'), { saved: true, reminderMinutes: 60 });
  await assert.rejects(service.setReminder('event-1', 'user-1', 30), error => error.status === 400);
  await service.setReminder('event-1', 'user-1', null);
  assert.match(calls.at(-1).sql, /ON CONFLICT \("userId", "eventId"\) DO UPDATE/);
  assert.deepEqual(calls.at(-1).values, ['user-1', 'event-1', null]);
});

test('notification pagination is scoped by user and produces a stable cursor', async () => {
  const date = new Date('2026-10-07T12:00:00.000Z');
  const rows = Array.from({ length: 51 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    title: `Notice ${index}`,
    message: 'Message',
    href: '/activity',
    readAt: null,
    createdAt: new Date(date.getTime() - index * 1000),
  }));
  let query;
  const pool = { async query(sql, values) { query = { sql, values }; return { rows }; } };
  const service = new interactionModule.PostgresInteractionService(pool, {}, 'm'.repeat(48));
  const page = await service.notificationPage('user-1', null, true);
  assert.equal(page.items.length, 50);
  assert.equal(page.nextBefore, Buffer.from(JSON.stringify({ id: rows[49].id, date: rows[49].createdAt.toISOString() })).toString('base64url'));
  assert.match(query.sql, /"userId" = \$1/);
  assert.deepEqual(query.values.slice(0, 2), ['user-1', true]);
  assert.equal(page.items[0].readAt, null);
});

test('event registrations use an atomic capacity decision under row lock', async () => {
  const statements = [];
  const pool = {
    async connect() {
      return {
        async query(sql, values) {
          statements.push({ sql, values });
          if (sql.startsWith('SELECT id, status, "dataInicio"')) {
            return { rows: [{
              id: 'event-1',
              status: 'PUBLISHED',
              dataInicio: '2099-05-10',
              startTime: '12:00',
              timezone: 'America/Sao_Paulo',
              capacity: 1,
              userId: 'organizer',
            }] };
          }
          if (sql.includes('FROM "EventRegistration"') && sql.includes('"userId" = $2')) return { rows: [], rowCount: 0 };
          if (sql.includes('COUNT(*)::int')) return { rows: [{ count: 0 }], rowCount: 1 };
          if (sql.includes("status = 'WAITLISTED'")) return { rows: [], rowCount: 0 };
          if (sql.startsWith('INSERT INTO "EventRegistration"')) return { rows: [{ id: 'registration-1', status: values[2] }], rowCount: 1 };
          return { rows: [], rowCount: 1 };
        },
        release() {},
      };
    },
  };
  const service = new interactionModule.PostgresInteractionService(
    pool,
    {},
    'm'.repeat(48),
    () => new Date('2026-10-07T12:00:00.000Z'),
  );
  assert.deepEqual(await service.registerForEvent('event-1', 'user-1'), { id: 'registration-1', status: 'CONFIRMED' });
  assert.match(statements[1].sql, /FOR UPDATE/);
  assert.equal(statements.at(-1).sql, 'COMMIT');
  assert.deepEqual(statements.at(-2).values, ['event-1', 'user-1', 'CONFIRMED']);
});

test('event read queries preserve the public fields and private organizer review note', async () => {
  const queries = [];
  const row = {
    id: 'event-1',
    nome: 'Event',
    banner: '/banner.jpg',
    carrossel: [],
    descricao: 'Description',
    dataInicio: '2026-11-01T10:00:00.000Z',
    dataFim: '2026-11-01T12:00:00.000Z',
    linkParaCompra: '',
    endereco: 'Place',
    userId: 'user-1',
    validate: null,
    status: 'PUBLISHED',
    category: 'Music',
    priceCents: 0,
    isFree: true,
    lat: null,
    lng: null,
    startTime: '10:00',
    endTime: '12:00',
    timezone: 'America/Sao_Paulo',
    capacity: null,
    validatedAt: null,
    organizerId: 'user-1',
    organizerName: 'Organizer',
    organizerImage: null,
    validatorId: null,
    validatorName: null,
    validatorImage: null,
    reviewNote: 'Only the owner should see this.',
  };
  const pool = {
    async query(sql, values) {
      queries.push({ sql, values });
      return { rows: [row] };
    },
  };
  const events = new eventModule.PostgresEventReader(pool);
  const [publicEvent] = await events.listPublicEvents();
  assert.equal(publicEvent.validate, false);
  assert.equal(publicEvent.user.name, 'Organizer');
  assert.equal(Object.hasOwn(publicEvent, 'reviewNote'), false);
  assert.match(queries[0].sql, /WHERE e\.status = 'PUBLISHED'/);
  assert.match(queries[0].sql, /LIMIT 1000/);

  await events.getPublicEvent('event-1');
  assert.deepEqual(queries[1].values, ['event-1', ['PUBLISHED', 'CANCELLED', 'ENDED']]);
  assert.match(queries[1].sql, /e\.status = ANY\(\$2::"EventStatus"\[\]\)/);

  const [ownedEvent] = await events.listOwnedEvents('user-1');
  assert.equal(ownedEvent.reviewNote, 'Only the owner should see this.');
  assert.deepEqual(queries[2].values, ['user-1']);
});

test('event engagement updates daily metrics once per actor and cooldown window', async () => {
  const statements = [];
  let now = new Date('2026-10-07T12:00:00.000Z');
  const pool = {
    async connect() {
      return {
        async query(sql, values) {
          statements.push({ sql, values });
          if (sql.startsWith('SELECT id FROM events')) return { rows: [{ id: 'event-1' }], rowCount: 1 };
          return { rows: [], rowCount: 1 };
        },
        release() {},
      };
    },
  };
  const service = new interactionModule.PostgresInteractionService(pool, {}, 'm'.repeat(48), () => now);

  assert.deepEqual(await service.trackEngagement('user:user-1', 'event-1', 'view'), { success: true });
  assert.deepEqual(await service.trackEngagement('user:user-1', 'event-1', 'view'), { success: true });
  assert.equal(statements.filter(item => item.sql.startsWith('UPDATE events')).length, 1);
  assert.equal(statements.filter(item => item.sql.startsWith('INSERT INTO "EventMetric"')).length, 1);
  assert.deepEqual(statements.find(item => item.sql.startsWith('INSERT INTO "EventMetric"')).values, [
    'event-1', '2026-10-07', 1, 0,
  ]);

  now = new Date(now.getTime() + 60 * 60 * 1000);
  await service.trackEngagement('user:user-1', 'event-1', 'view');
  assert.equal(statements.filter(item => item.sql.startsWith('UPDATE events')).length, 2);
});

test('promoter profiles expose only public data and batch event metrics', async () => {
  const queries = [];
  const pool = {
    async query(sql, values) {
      queries.push({ sql, values });
      if (sql.includes('followerCount')) {
        return { rows: [{ id: 'promoter-1', name: 'Promoter', bio: '', contactUrl: '', followerCount: 3, isFollowing: true }], rowCount: 1 };
      }
      if (sql.includes('FROM events e')) {
        return { rows: [{ id: 'event-1', views: 5, ticketClicks: 2, favorites: 1 }], rowCount: 1 };
      }
      return { rows: [{ eventId: 'event-1', day: '2026-10-07', views: 5, ticketClicks: 2 }], rowCount: 1 };
    },
  };
  const events = { async getPromoterEvents(id) { return [{ id: `${id}-event` }]; } };
  const service = new promoterModule.PostgresPromoterService(pool, events);
  const profile = await service.profile('promoter-1', 'user-1');
  assert.equal(profile.followerCount, 3);
  assert.equal(profile.isFollowing, true);
  assert.deepEqual(profile.events, [{ id: 'promoter-1-event' }]);
  assert.match(queries[0].sql, /role = ANY\(\$3::"Role"\[\]\)/);
  const stats = await service.stats({ id: 'promoter-1', role: 'PROMOTER' });
  assert.deepEqual(stats.totals, { views: 5, ticketClicks: 2, favorites: 1 });
  assert.equal(stats.events[0].daily.length, 1);
  assert.match(queries.at(-1).sql, /ROW_NUMBER\(\) OVER/);
});

test('independent HTTP auth exposes Google login and /me without web imports', async () => {
  const repo = repository();
  const accessToken = tokenModule.createAccessToken('m'.repeat(48));
  const server = httpModule.createIndependentAuthServer({
    accounts: {
      async login() { return { token: 'credential-token' }; },
      async register() { return { status: 'success' }; },
      async verifyEmail() { return { status: 'success' }; },
      async requestAccountLink() { return { message: 'sent' }; },
      async resetPassword() { return { message: 'reset' }; },
      async profile() { return { id: 'user-1' }; },
      async updateProfile() { return { status: 'success' }; },
    },
    promoters: {
      async profile(id) { return { id }; },
      async toggleFollow() { return { success: true, following: true }; },
      async myProfile() { return { bio: '', contactUrl: '' }; },
      async updateProfile() { return { success: true }; },
      async stats() { return { events: [], totals: { views: 0, ticketClicks: 0, favorites: 0 } }; },
    },
    repository: repo,
    events: {
      async listPublicEvents() { return [{ id: 'public-event' }]; },
      async listOwnedEvents(userId) { return [{ id: `owned-by-${userId}` }]; },
      async getPublicEvent(id) { return id === 'public-event' ? { id } : null; },
      async getOwnedEvent(id, actor) { return id === 'private-event' && actor.id === 'user-1' ? { id } : null; },
      async getPromoterEvents() { return []; },
    },
    eventAuthoring: {
      async create() { return { success: true }; },
      async update() { return { success: true }; },
      async cancel() { return { success: true }; },
      async duplicate() { return { success: true }; },
      async createRecurrence() { return { success: true }; },
      async listAdminEvents() { return []; },
      async validate() { return { success: true }; },
      async requestCorrection() { return { success: true }; },
      async delete() { return { success: true }; },
    },
    eventReadCalendar: {
      async read(id, actor) {
        if (id === 'public-event' || (id === 'private-event' && actor?.id === 'user-1')) return { id };
        return null;
      },
      async history() { return { history: [] }; },
      async eventHistory() { return { history: [] }; },
      async calendar() { return { status: 200, contentType: 'text/calendar; charset=utf-8', headers: { 'Content-Disposition': 'attachment; filename="event.ics"', 'Cache-Control': 'private, no-store' }, body: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n' }; },
    },
    eventMedia: {
      async save() { return { id: 'media-1', url: '/v1/media/events/media-1', mimeType: 'image/png', size: 1 }; },
      async read() { return { status: 200, contentType: 'image/png', contentLength: 1, cacheControl: 'private, no-store', body: Buffer.from([0]) }; },
      async saveProfileImage(actor, upload) {
        assert.equal(actor.id, 'user-1');
        assert.equal(upload.mimeType, 'image/png');
        return { id: 'profile-media-1', url: 'https://api.example.test/v1/media/profile/profile-media-1', mimeType: 'image/png', size: upload.bytes.length };
      },
      async readProfileImage(id) {
        assert.equal(id, 'profile-media-1');
        return { status: 200, contentType: 'image/png', contentLength: 8, cacheControl: 'public, max-age=31536000, immutable', body: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) };
      },
      async readLegacyProfileImage(filename) {
        assert.equal(filename, '1234567890123-uploaded_image.jpg');
        return { status: 200, contentType: 'image/jpeg', contentLength: 3, cacheControl: 'public, max-age=31536000, immutable', body: Buffer.from([255, 216, 255]) };
      },
    },
    interactions: {
      async trackEngagement(actor, eventId, action) { return { success: true, actor, eventId, action }; },
      async favorites() { return []; },
      async notificationPage() { return { items: [], nextBefore: null }; },
      async markNotificationsRead() { return { success: true }; },
      async favoriteState() { return { saved: false, reminderMinutes: null }; },
      async toggleFavorite() { return { success: true }; },
      async setReminder() { return { success: true }; },
      async registrationState() { return { capacity: null, confirmedCount: 0, waitingCount: 0, registration: null }; },
      async registerForEvent() { return { id: 'registration-1', status: 'CONFIRMED' }; },
      async cancelRegistration() { return { status: 'CANCELLED', promotedUserId: null }; },
      async issueCheckInToken() { return { token: 'ticket', expiresAt: Date.now() + 1000 }; },
      async checkIn() { return { id: 'registration-1', status: 'CHECKED_IN' }; },
      async checkInRoster() { return []; },
      async reportEvent() { return { report: { id: 'report-1', status: 'PENDING' } }; },
    },
    accessToken,
    browserOrigins: ['http://localhost:8081'],
    verifyGoogleIdToken: async idToken => {
      if (idToken !== 'valid-google-id-token-for-independent-test') throw new Error('Invalid Google token.');
      return validProfile;
    },
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const loginResponse = await fetch(`${baseUrl}/v1/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8081' },
      body: JSON.stringify({ idToken: 'valid-google-id-token-for-independent-test' }),
    });
    assert.equal(loginResponse.status, 200);
    assert.equal(loginResponse.headers.get('access-control-allow-origin'), 'http://localhost:8081');
    const login = (await loginResponse.json()).data;

    const profileForm = new FormData();
    profileForm.append('file', new Blob([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' }), 'avatar.png');
    const profileUpload = await fetch(`${baseUrl}/v1/profile/image`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + login.token },
      body: profileForm,
    });
    assert.equal(profileUpload.status, 200);
    assert.equal((await profileUpload.json()).data.url, 'https://api.example.test/v1/media/profile/profile-media-1');
    assert.equal((await fetch(`${baseUrl}/v1/profile/image`, { method: 'POST' })).status, 401);
    const profileMedia = await fetch(`${baseUrl}/v1/media/profile/profile-media-1`);
    assert.equal(profileMedia.status, 200);
    assert.equal(profileMedia.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal((await profileMedia.arrayBuffer()).byteLength, 8);
    const legacyProfileMedia = await fetch(`${baseUrl}/v1/media/profile/legacy/1234567890123-uploaded_image.jpg`);
    assert.equal(legacyProfileMedia.status, 200);
    assert.equal(legacyProfileMedia.headers.get('content-type'), 'image/jpeg');

    const meResponse = await fetch(`${baseUrl}/v1/me`, {
      headers: { Authorization: `Bearer ${login.token}` },
    });
    assert.equal(meResponse.status, 200);
    assert.equal((await meResponse.json()).data.id, login.user.id);

    const eventsResponse = await fetch(`${baseUrl}/v1/events`);
    assert.deepEqual((await eventsResponse.json()).data, [{ id: 'public-event' }]);
    const engagementResponse = await fetch(`${baseUrl}/v1/event-engagement/public-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ticket' }),
    });
    assert.deepEqual((await engagementResponse.json()).data, {
      success: true,
      actor: 'network:127.0.0.1',
      eventId: 'public-event',
      action: 'ticket',
    });
    assert.equal((await fetch(`${baseUrl}/v1/events/mine`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/v1/events/private-event`)).status, 404);
    const ownedEvents = await fetch(`${baseUrl}/v1/events/mine`, {
      headers: { Authorization: `Bearer ${login.token}` },
    });
    assert.deepEqual((await ownedEvents.json()).data, [{ id: 'owned-by-user-1' }]);
    const privateEvent = await fetch(`${baseUrl}/v1/events/private-event`, {
      headers: { Authorization: `Bearer ${login.token}` },
    });
    assert.deepEqual((await privateEvent.json()).data, { id: 'private-event' });
    const registration = await fetch(`${baseUrl}/v1/events/public-event/registration`);
    assert.equal((await registration.json()).data.capacity, null);
    assert.equal((await fetch(`${baseUrl}/v1/events/public-event/registration`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${login.token}` },
    })).status, 200);
    assert.equal((await fetch(`${baseUrl}/v1/events/public-event/favorite`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${login.token}` },
    })).status, 200);
    assert.equal((await fetch(`${baseUrl}/v1/notifications/read-all`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${login.token}` },
    })).status, 200);

    const invalidOrigin = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'https://untrusted.example' },
    });
    assert.equal(invalidOrigin.status, 403);

    const invalidBody = await fetch(`${baseUrl}/v1/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'too-short', extra: true }),
    });
    assert.equal(invalidBody.status, 400);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
