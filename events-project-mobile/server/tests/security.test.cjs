const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const net = require('node:net');
const path = require('node:path');

const serverRoot = path.resolve(__dirname, '..');
const secret = randomBytes(32).toString('base64url');
let processHandle;
let base;

async function freePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.listen(0, '127.0.0.1', resolve).once('error', reject));
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return port;
}

before(async () => {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  processHandle = spawn(process.execPath, ['dist/independent-api.cjs'], {
    cwd: serverRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: {
      ...process.env,
      MOBILE_API_PORT: String(port),
      MOBILE_API_HOST: '127.0.0.1',
      MOBILE_AUTH_SECRET: secret,
      DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused?connect_timeout=1',
      GOOGLE_NATIVE_CLIENT_IDS: '',
      MOBILE_API_BROWSER_ORIGINS: '',
    },
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Independent API did not start')), 15000);
    processHandle.stdout.on('data', chunk => {
      if (String(chunk).includes('Independent mobile auth API available')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    processHandle.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Independent API exited with code ${code}`));
    });
  });
});

after(() => processHandle?.kill());

async function request(endpoint, options = {}) {
  return fetch(base + endpoint, options);
}

test('health reports the independent API process without claiming database health', async () => {
  const response = await request('/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    data: { status: 'ok', service: 'eventmap-mobile-api' },
  });
});

test('private API routes reject anonymous and malformed bearer sessions before database access', async () => {
  for (const endpoint of [
    '/v1/me',
    '/v1/profile',
    '/v1/events/mine',
    '/v1/favorites',
    '/v1/notifications',
    '/v1/community/activity',
    '/v1/community/rooms',
    '/v1/admin/users',
    '/v1/admin/events',
  ]) {
    assert.equal((await request(endpoint)).status, 401, endpoint);
  }
  assert.equal((await request('/v1/me', { headers: { Authorization: 'Bearer malformed' } })).status, 401);
});

test('unconfigured Google login and malformed/oversized JSON fail explicitly', async () => {
  const google = await request('/v1/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: 'x'.repeat(40) }),
  });
  assert.equal(google.status, 503);

  const malformed = await request('/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  });
  assert.equal(malformed.status, 400);

  const oversized = await request('/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'x'.repeat(16_001),
  });
  assert.equal(oversized.status, 413);
});

test('browser origins and arbitrary module or file paths are blocked', async () => {
  assert.equal((await request('/health', { headers: { Origin: 'https://untrusted.invalid' } })).status, 403);
  assert.equal((await request('/v1/lib/prisma')).status, 404);
  assert.equal((await request('/v1/auth/impersonation')).status, 404);
  assert.equal((await request('/uploads/secrets.txt')).status, 404);
  assert.equal((await request('/v1/media/%5C.env')).status, 404);
});
