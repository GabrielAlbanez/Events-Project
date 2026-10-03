const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const base = process.env.FEATURE_HTTP_URL || 'http://localhost:3000';
async function post(path, body, origin = base) {
  return fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
}
(async () => {
  assert.equal((await (await fetch(base + '/api/auth/session')).json()).user, undefined);
  assert.equal((await fetch(base + '/api/dataAllUser')).status, 403);
  assert.equal((await fetch(base + '/admin', { redirect: 'manual' })).status, 307);
  for (const route of ['/login', '/register', '/recuperar-senha', '/redefinir-senha', '/confirmar-email']) {
    assert.equal((await fetch(base + route, { signal: AbortSignal.timeout(30000) })).status, 200);
  }
  assert.equal((await post('/api/account/recovery', { email: 'invalid' })).status, 400);
  assert.equal((await post('/api/account/recovery', { email: 'visual-test@example.invalid' }, 'https://untrusted.example')).status, 403);
  assert.equal((await post('/api/account/reset-password', {})).status, 400);
  // Without mail credentials, the endpoint must report unavailability, not pretend delivery.
  require('@next/env').loadEnvConfig(process.cwd());
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    for (const path of ['/api/account/recovery', '/api/account/resend-verification']) {
      const response = await post(path, { email: 'visual-test@example.invalid' });
      assert.equal(response.status, 503);
      assert.ok((await response.json()).message);
    }
    console.log('PASS HTTP: SMTP unavailable reports 503; no email sent.');
  }
  const socket = io(base, { transports: ['websocket'], reconnection: false });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Socket connection timeout')), 10000);
      socket.once('connect', () => { clearTimeout(timer); resolve(); });
      socket.once('connect_error', () => { clearTimeout(timer); reject(Error('Socket connection failed')); });
    });
    console.log('PASS HTTP/browser routes, unauthenticated admin denial, input/origin validation and real anonymous WebSocket connection.');
  } finally { socket.disconnect(); }
})().catch(() => { console.error('FAIL recovery HTTP checks; inspect assertions locally.'); process.exitCode = 1; });
