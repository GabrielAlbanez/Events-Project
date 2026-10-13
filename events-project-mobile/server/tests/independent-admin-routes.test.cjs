const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { build } = require('esbuild');

const filename = path.resolve(__dirname, '../independent/src/admin-routes.ts');
let createAdminRouteHandler;
let resolveMobileIdentity;

test('load isolated admin route adapter', async () => {
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
  createAdminRouteHandler = compiled.exports.createAdminRouteHandler;
  resolveMobileIdentity = compiled.exports.resolveMobileIdentity;
  assert.equal(typeof createAdminRouteHandler, 'function');
});

function dependencies(overrides = {}) {
  const calls = [];
  const admin = {
    async assertOrdinarySessionAllowed() {},
    async listUsers(...args) { calls.push(['listUsers', ...args]); return { status: 'success', data: [] }; },
    async updateUserRole(...args) { calls.push(['updateUserRole', ...args]); return { id: args[1], role: args[2].role }; },
    async deleteUser(...args) { calls.push(['deleteUser', ...args]); return { ok: true }; },
    async startImpersonation(...args) { calls.push(['startImpersonation', ...args]); return { token: 'imp-token' }; },
    async endImpersonationWithToken(...args) { calls.push(['endImpersonationWithToken', ...args]); return { token: 'restored-admin' }; },
    async impersonationTokenStatus(...args) { calls.push(['impersonationTokenStatus', ...args]); return { restoreRequired: true }; },
    async validateImpersonationToken(...args) { calls.push(['validateImpersonationToken', ...args]); return {}; },
  };
  return {
    calls,
    dependencies: {
      service: admin,
      accessToken: {
        verify(token) {
          if (token !== 'admin-token') throw new Error('Invalid ordinary mobile token.');
          return { subject: 'admin-1', sessionVersion: 4, provider: 'google' };
        },
      },
      auth: {
        async currentUser(token) {
          if (token !== 'admin-token') throw new Error('Invalid ordinary mobile token.');
          return {
            id: 'admin-1', name: 'Admin', email: 'admin@example.com', image: null,
            role: 'ADMIN', emailVerified: true, provider: 'google',
          };
        },
      },
      impersonationTokens: {
        verify(token, allowExpiredForRestore) {
          if (token !== 'imp-token') throw new Error('Invalid support token.');
          calls.push(['verifyImpersonation', token, allowExpiredForRestore]);
          return {
            subject: 'user-1', sessionVersion: 2, provider: 'credentials',
            sessionId: 'imp-1', adminId: 'admin-1', adminSessionVersion: 5,
            adminProvider: 'google', expiresAt: new Date('2026-10-07T12:15:00.000Z'),
          };
        },
      },
      ...overrides,
    },
  };
}

test('user list, role change, and delete routes require ordinary administrator sessions', async () => {
  const setup = dependencies();
  const handle = createAdminRouteHandler(setup.dependencies);

  const listed = await handle({
    method: 'GET',
    path: '/admin/users?page=2&q=Ada&role=BASIC',
    authorization: 'Bearer admin-token',
  });
  const changed = await handle({
    method: 'PATCH',
    path: '/admin/users/user-2/role',
    authorization: 'Bearer admin-token',
    body: { role: 'PROMOTER' },
  });
  const deleted = await handle({
    method: 'DELETE',
    path: '/admin/users/user-2',
    authorization: 'Bearer admin-token',
  });

  assert.equal(listed.status, 200);
  assert.deepEqual(setup.calls[0], ['listUsers', 'admin-1', { page: 2, q: 'Ada', role: 'BASIC' }]);
  assert.equal(changed.status, 200);
  assert.deepEqual(setup.calls[1], ['updateUserRole', 'admin-1', 'user-2', { role: 'PROMOTER' }]);
  assert.deepEqual(deleted.body, { data: { ok: true } });
  assert.deepEqual(setup.calls[2], ['deleteUser', 'admin-1', 'user-2']);
});

test('support tokens can end/restore only through their audited session and are not ordinary admin tokens', async () => {
  const setup = dependencies();
  const handle = createAdminRouteHandler(setup.dependencies);
  const end = await handle({
    method: 'POST',
    path: '/admin/impersonation/end',
    authorization: 'Bearer imp-token',
  });
  const forbiddenAdminUse = await handle({
    method: 'GET',
    path: '/admin/users',
    authorization: 'Bearer imp-token',
  });

  assert.deepEqual(end.body, { data: { token: 'restored-admin' } });
  assert.deepEqual(setup.calls.slice(0, 2), [
    ['verifyImpersonation', 'imp-token', true],
    ['endImpersonationWithToken', {
      subject: 'user-1',
      sessionVersion: 2,
      provider: 'credentials',
      sessionId: 'imp-1',
      adminId: 'admin-1',
      adminSessionVersion: 5,
      adminProvider: 'google',
      expiresAt: new Date('2026-10-07T12:15:00.000Z'),
    }],
  ]);
  assert.equal(forbiddenAdminUse.status, 403);
  assert.equal(setup.calls.some(call => call[0] === 'listUsers'), false);
  assert.ok(setup.calls.some(call => call[0] === 'validateImpersonationToken'));
});

test('start impersonation preserves standard auth provider and records request address', async () => {
  const setup = dependencies();
  const handle = createAdminRouteHandler(setup.dependencies);
  const started = await handle({
    method: 'POST',
    path: '/admin/impersonation/start',
    authorization: 'Bearer admin-token',
    body: { userId: 'user-2', reason: 'Help diagnose account issue' },
    ip: '127.0.0.1',
  });
  assert.equal(started.status, 200);
  assert.deepEqual(setup.calls[0], [
    'startImpersonation',
    'admin-1',
    'user-2',
    { reason: 'Help diagnose account issue' },
    { ip: '127.0.0.1' },
    'google',
  ]);
});


test('ordinary identity is denied during support and resumes after release without deleting its bearer', async () => {
  const setup = dependencies();
  let active = true;
  setup.dependencies.service.assertOrdinarySessionAllowed = async id => {
    assert.equal(id, 'admin-1');
    if (active) throw Object.assign(new Error('Support active'), { status: 403, code: 'ACCOUNT_IMPERSONATED' });
  };
  await assert.rejects(resolveMobileIdentity('admin-token', setup.dependencies), error => error.status === 403 && error.code === 'ACCOUNT_IMPERSONATED');
  active = false;
  const identity = await resolveMobileIdentity('admin-token', setup.dependencies);
  assert.equal(identity.user.id, 'admin-1');
  assert.equal(identity.impersonation, null);
});
