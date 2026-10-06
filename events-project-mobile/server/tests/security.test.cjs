const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'tsconfig.generated.json'), 'utf8'));
const webRequire = createRequire(path.join(config.compilerOptions.baseUrl, 'package.json'));
const { encode, getToken } = webRequire('next-auth/jwt');
const { NextRequest } = webRequire('next/server');
const secret = randomBytes(32).toString('hex');
const port = 4052;
let processHandle;
const base = `http://127.0.0.1:${port}`;
before(async () => {
  processHandle = spawn(process.execPath, ['dist/server.cjs'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    // Deliberately unreachable test database: these checks cannot modify real data.
    env: { ...process.env, NATIVE_API_PORT: String(port), NATIVE_API_HOST: '127.0.0.1', NEXTAUTH_SECRET: secret,
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test?connect_timeout=1', GOOGLE_NATIVE_CLIENT_IDS: '', NATIVE_BROWSER_ORIGINS: '' },
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('API did not start')), 15000);
    processHandle.stdout.on('data', chunk => { if (String(chunk).includes('API nativa disponível')) { clearTimeout(timeout); resolve(); } });
    processHandle.once('exit', code => { clearTimeout(timeout); reject(new Error(`API exited ${code}`)); });
  });
});
after(() => processHandle?.kill());
async function request(endpoint, options = {}) { return fetch(base + endpoint, options); }
test('health reports process, not a database success', async () => {
  const response = await request('/health'); assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: { status: 'ok', service: 'eventmap-native-api' } });
});
test('private/admin domains reject anonymous requests before database access', async () => {
  for (const endpoint of ['/v1/me', '/v1/profile', '/v1/events/mine', '/v1/favorites', '/v1/notifications', '/v1/community/activity', '/v1/community/rooms', '/v1/admin/users', '/v1/admin/events']) {
    const response = await request(endpoint); assert.equal(response.status, 401, endpoint);
  }
});
test('malformed and expired bearer sessions fail closed', async () => {
  assert.equal((await request('/v1/me', { headers: { Authorization: 'Bearer invalid' } })).status, 401);
  const expired = await encode({ secret, token: { id: 'test', provider: 'credentials' }, maxAge: -120 });
  assert.equal((await request('/v1/me', { headers: { Authorization: `Bearer ${expired}` } })).status, 401);
});
test('NextAuth bearer encryption is interoperable with existing socket cookie decoding', async () => {
  const token = await encode({ secret, token: { id: 'test', provider: 'credentials', sessionVersion: 4 }, maxAge: 60 });
  const decoded = await getToken({ req: new NextRequest('http://localhost', { headers: { cookie: `next-auth.session-token=${token}; __Secure-next-auth.session-token=${token}` } }), secret });
  assert.equal(decoded.id, 'test'); assert.equal(decoded.sessionVersion, 4);
});
test('unconfigured Google login is explicit, never simulated', async () => {
  const response = await request('/v1/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: 'x'.repeat(40) }) });
  assert.equal(response.status, 503);
});
test('malformed and oversized inputs are rejected', async () => {
  const malformed = await request('/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  const oversized = await request('/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(16001) });
  assert.equal(oversized.status, 413);
});
test('browser origin and arbitrary service/module paths are blocked', async () => {
  assert.equal((await request('/health', { headers: { Origin: 'https://untrusted.invalid' } })).status, 403);
  assert.equal((await request('/v1/lib/prisma')).status, 404);
  assert.equal((await request('/v1/auth/impersonation')).status, 404);
  assert.equal((await request('/v1/community/events/event', { method: 'DELETE' })).status, 401);
});
test('public media never accepts arbitrary file names', async () => {
  assert.equal((await request('/uploads/secrets.txt')).status, 404);
  assert.equal((await request('/v1/media/%5C.env')).status, 404);
});

// Compile the production token transformation for a behavior test without DB access.
test('impersonation preserves admin credential and expiry, then restores it', async () => {
  const { transform } = require('esbuild');
  const vm = require('node:vm');
  const source = fs.readFileSync(path.join(root, 'src/session-token.ts'), 'utf8');
  const compiled = await transform(source, { loader: 'ts', format: 'cjs', target: 'node22' });
  const module = { exports: {} };
  vm.runInNewContext(compiled.code, { module, exports: module.exports });
  const { impersonationToken } = module.exports;
  const original = { id: 'admin', provider: 'credentials', credentialStamp: 'opaque-stamp', sessionVersion: 7, role: 'ADMIN', exp: 9999999999 };
  const viewing = impersonationToken(original, 'audit-record');
  assert.equal(viewing.id, 'admin'); assert.equal(viewing.credentialStamp, original.credentialStamp);
  assert.equal(viewing.sessionVersion, 7); assert.equal(viewing.exp, original.exp);
  assert.equal(viewing.impersonationId, 'audit-record'); assert.equal(original.impersonationId, undefined);
  viewing.effectiveUserId = 'target'; viewing.effectiveRole = 'BASIC'; viewing.effectiveName = 'Target';
  const restored = impersonationToken(viewing, null);
  assert.equal(restored.id, 'admin'); assert.equal(restored.effectiveUserId, 'admin');
  assert.equal(restored.effectiveRole, 'ADMIN'); assert.equal(restored.exp, original.exp);
  assert.equal(restored.impersonationId, undefined); assert.equal(restored.effectiveName, undefined);
  assert.equal(viewing.impersonationId, 'audit-record');
});

test('login checks active impersonation before issuing credentials or Google tokens', async () => {
  const { transform } = require('esbuild');
  const vm = require('node:vm');
  // Exercise the actual production function with isolated auth/database boundaries.
  const source = fs.readFileSync(path.join(root, 'src/server.ts'), 'utf8');
  const start = source.indexOf('async function issueSession(');
  const end = source.indexOf('function requireIdentity(', start);
  assert.ok(start >= 0 && end > start);
  const compiled = await transform(source.slice(start, end), { loader: 'ts', target: 'node22' });
  for (const provider of ['credentials', 'google']) {
    let issued = 0, checked = 0;
    const user = { id: 'original-user', name: 'Test User', email: 'test@example.invalid', image: null, role: 'BASIC', emailVerified: true, password: 'test-hash', sessionVersion: 3 };
    const context = {
      prisma: { user: { findUniqueOrThrow: async () => user } },
      isAccountSuspended: () => false, credentialStamp: () => 'opaque-session-stamp', secret: 'isolated-test-secret', sessionSeconds: 60,
      resolveImpersonationIdentity: async (_db, claims) => {
        checked++; assert.equal(claims.id, user.id); assert.equal(claims.provider, provider); assert.equal(claims.sessionVersion, 3);
        if (provider === 'credentials') assert.equal(claims.credentialStamp, 'opaque-session-stamp');
        return { user: null, blocked: true, impersonation: null };
      },
      encode: async () => { issued++; return 'must-not-be-issued'; },
      ApiError: class extends Error { constructor(status, message) { super(message); this.status = status; } },
    };
    vm.runInNewContext(compiled.code + '\nthis.issueSession = issueSession;', context);
    await assert.rejects(context.issueSession(user.id, provider), error => error.status === 403 && /administrador/.test(error.message));
    assert.equal(checked, 1); assert.equal(issued, 0);
  }
});


test('every protected mutation rejects anonymous callers before domain data is touched', async () => {
  const endpoints = [
    ['PATCH', '/v1/profile'], ['POST', '/v1/events'], ['PUT', '/v1/events/event'],
    ['POST', '/v1/events/event/duplicate'], ['POST', '/v1/events/event/cancel'],
    ['POST', '/v1/events/event/recurrence'], ['POST', '/v1/events/event/favorite'],
    ['PUT', '/v1/events/event/reminder'], ['POST', '/v1/events/event/registration'],
    ['DELETE', '/v1/events/event/registration'], ['POST', '/v1/events/event/check-in'],
    ['POST', '/v1/events/event/reports'], ['POST', '/v1/community/rooms'],
    ['POST', '/v1/community/rooms/room'], ['POST', '/v1/event-chat/event'],
    ['POST', '/v1/party-connections/event'], ['POST', '/v1/party-connections/event/matches/match'],
    ['POST', '/v1/party-connections/event/matches/match/images'],
    ['POST', '/v1/promoters/promoter/follow'], ['PUT', '/v1/promoter/profile'],
    ['PATCH', '/v1/notifications/read-all'], ['PATCH', '/v1/notifications/notification/read'],
    ['POST', '/v1/admin/impersonation/start'], ['POST', '/v1/admin/impersonation/end'],
    ['PATCH', '/v1/admin/users/user/role'], ['DELETE', '/v1/admin/users/user'],
    ['PATCH', '/v1/admin/users/user/suspension'], ['POST', '/v1/admin/events/validate'],
    ['DELETE', '/v1/admin/events'], ['POST', '/v1/admin/events/event/correction'],
    ['PATCH', '/v1/admin/reports/report'], ['POST', '/v1/admin/party-reports'],
  ];
  for (const [method, endpoint] of endpoints) {
    const response = await request(endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 401, `${method} ${endpoint}`);
  }
});

test('attendance counts remain public while registration writes still require a session', async () => {
  // An unreachable test DB produces 503 only if the public handler was reached.
  const response = await request('/v1/events/event/registration');
  assert.equal(response.status, 503);
});
