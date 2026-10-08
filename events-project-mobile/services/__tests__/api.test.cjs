const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function client(fetch, platform = 'ios') {
  const source = fs.readFileSync(path.join(__dirname, '..', 'api.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require(name) { if (name === 'react-native') return { Platform: { OS: platform } }; if (name === './config') return { requireApiUrl: () => 'https://gateway.example' }; throw new Error('Unexpected import'); }, fetch, AbortController, FormData, Blob, setTimeout, clearTimeout, encodeURIComponent, console });
  return exports;
}
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => ({ data }) });
test('sends bearer only to configured gateway and unwraps response', async () => {
  let captured;
  const c = client(async (url, options) => { captured = { url, options }; return response({ id: 'event-1' }); });
  c.setApiToken('test-session');
  assert.deepEqual(JSON.parse(JSON.stringify(await c.request('/events/1'))), { id: 'event-1' });
  assert.equal(captured.url, 'https://gateway.example/v1/events/1');
  assert.equal(captured.options.headers.Authorization, 'Bearer test-session');
  assert.equal(captured.options.headers['Content-Type'], undefined);
  assert.throws(() => c.privateImageSource('https://external.example/image'), /indisponível/);
});
test('late response from previous account is discarded without revoking new account', async () => {
  let release;
  const c = client(() => new Promise(resolve => { release = resolve; }));
  let revoked = 0;
  c.onUnauthorized(() => revoked++);
  c.setApiToken('first-session');
  const pending = c.request('/profile');
  c.setApiToken('second-session');
  release({ ok: false, status: 401, json: async () => ({ message: 'Expired' }) });
  await assert.rejects(pending, error => error.status === 409);
  assert.equal(revoked, 0);
});
test('current unauthorized account triggers one session invalidation', async () => {
  const c = client(async () => ({ ok: false, status: 401, json: async () => ({ message: 'Entre novamente.' }) }));
  let revoked = 0;
  const stop = c.onUnauthorized(() => revoked++);
  c.setApiToken('test-session');
  await assert.rejects(c.request('/profile'), error => error.status === 401 && error.message === 'Entre novamente.');
  assert.equal(revoked, 1);
  stop();
});
test('rejects incompatible success envelope rather than returning undefined', async () => {
  const c = client(async () => ({ ok: true, status: 200, json: async () => ({ items: [] }) }));
  await assert.rejects(c.request('/events'), error => error.status === 502);
});
test('cancellation aborts fetch and becomes a bounded user-facing error', async () => {
  const c = client(async (_url, options) => new Promise((_resolve, reject) => { options.signal.addEventListener('abort', () => reject(new Error('aborted'))); }));
  const cancel = new AbortController();
  const pending = c.request('/events', { signal: cancel.signal });
  cancel.abort();
  await assert.rejects(pending, error => error.status === 408);
});
test('event publishing carries real multipart files without forcing boundary header', async () => {
  let captured;
  const c = client(async (url, options) => { if (url === 'blob:test-banner') return { blob: async () => new Blob(['image-bytes'], { type: 'image/jpeg' }) }; captured = { url, options }; return response({ success: true, message: 'Saved', evento: { id: 'event-2' } }); }, 'web');
  const result = await c.saveEvent({ nome: 'Test', descricao: 'Test event details', endereco: 'Test address', dataInicio: '2026-10-10', dataFim: '2026-10-11', linkParaCompra: '', category: 'Outros', isFree: true, priceCents: 0 }, { banner: { uri: 'blob:test-banner', fileName: 'banner.jpg' } }, undefined, false);
  assert.equal(result.id, 'event-2');
  assert.equal(captured.url, 'https://gateway.example/v1/events?submit=false');
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers['Content-Type'], undefined);
  assert.equal(captured.options.body.get('isFree'), 'true');
  assert.equal(await captured.options.body.get('banner').text(), 'image-bytes');
});
test('profile image upload targets the independent API profile route', async () => {
  let captured;
  const c = client(async (url, options) => {
    if (url === 'blob:avatar') return { blob: async () => new Blob(['avatar-bytes'], { type: 'image/png' }) };
    captured = { url, options };
    return response({ url: 'https://api.example/v1/media/profile/asset-id' });
  }, 'web');
  const uploaded = await c.uploadImage({ uri: 'blob:avatar', fileName: 'avatar.png', mimeType: 'image/png' }, '/profile/image');
  assert.equal(uploaded.url, 'https://api.example/v1/media/profile/asset-id');
  assert.equal(captured.url, 'https://gateway.example/v1/profile/image');
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers['Content-Type'], undefined);
  assert.equal(await captured.options.body.get('file').text(), 'avatar-bytes');
});
test('legacy Web profile uploads resolve through the API media proxy', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'config.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    process: { env: { EXPO_PUBLIC_API_URL: 'https://api.example/' } },
  });
  assert.equal(
    exports.mediaUrl('/uploads/1234567890123-uploaded_image.jpg'),
    'https://api.example/v1/media/profile/legacy/1234567890123-uploaded_image.jpg',
  );
  assert.equal(exports.mediaUrl('/v1/media/events/event-image'), 'https://api.example/v1/media/events/event-image');
  assert.equal(exports.mediaUrl('https://lh3.googleusercontent.com/photo'), 'https://lh3.googleusercontent.com/photo');
});
function credentials(store, platform = 'ios') {
  const source = fs.readFileSync(path.join(__dirname, '..', 'credentials.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require(name) { if (name === 'react-native') return { Platform: { OS: platform } }; if (name === 'expo-secure-store') return store; throw new Error('Unexpected import'); }, console });
  return exports;
}
test('SecureStore writes are serialized so logout wins an in-flight login write', async () => {
  let stored = null, release;
  const calls = [];
  const c = credentials({ setItemAsync: async (_key, value) => { calls.push('save'); await new Promise(resolve => { release = resolve; }); stored = value; }, deleteItemAsync: async () => { calls.push('delete'); stored = null; }, getItemAsync: async () => stored });
  const login = c.saveCredential({ token: 'test-session', expiresAt: '2027-01-01T00:00:00.000Z' });
  await Promise.resolve(); await Promise.resolve();
  const logout = c.saveCredential(null);
  assert.deepEqual(calls, ['save']);
  release();
  await login; await logout;
  assert.deepEqual(calls, ['save', 'delete']);
  assert.equal(await c.loadCredential(), null);
});
test('web preview stores credentials only in session memory', async () => {
  const c = credentials({ setItemAsync() { throw new Error('Must not touch native secure storage on web'); }, getItemAsync() { throw new Error('Must not touch native secure storage on web'); } }, 'web');
  await c.saveCredential({ token: 'test-session', expiresAt: '2027-01-01T00:00:00.000Z' });
  assert.equal((await c.loadCredential()).token, 'test-session');
  await c.saveCredential(null);
  assert.equal(await c.loadCredential(), null);
});

test('native socket sends its bearer token and never subscribes user rooms by id', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'realtime.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}, events = new Map(), sent = [];
  let options;
  const socket = { connected: true, on(name, handler) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(handler); return this; },
    off(name, handler) { events.get(name)?.delete(handler); }, emit(...payload) { sent.push(payload); }, connect() {}, disconnect() {}, removeAllListeners() { events.clear(); } };
  vm.runInNewContext(compiled, { exports, require(name) {
    if (name === 'react-native') return { Platform: { OS: 'android' }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } };
    if (name === 'socket.io-client') return { io(_url, value) { options = value; return socket; } };
    if (name === './config') return { SOCKET_URL: 'http://192.168.1.10:3000' };
    if (name === './sessionPolicy') return sessionPolicy();
    if (name === './resourcePolicy') return resourcePolicy();
    throw new Error('Unexpected import');
  }, setTimeout, clearTimeout });
  const stop = exports.startRealtime('encrypted-session');
  assert.equal(options.auth.token, 'encrypted-session');
  assert.deepEqual(Object.keys(options.auth), ['token']);
  let updates = 0, revoked = 0;
  const stopRevocation = exports.onSocket('account-impersonated', () => revoked++);
  for (const handler of events.get('connect_error')) handler(new Error('Network unavailable'));
  assert.equal(revoked, 0);
  for (const handler of events.get('connect_error')) handler({ data: { code: 'ACCOUNT_IMPERSONATED' } });
  assert.equal(revoked, 1);
  const unsubscribe = exports.subscribeDomain({ user: true }, () => updates++);
  for (const handler of events.get('connect')) handler();
  const userSubscriptions = sent.filter(item => item[0] === 'community-subscribe' && item[1]?.user);
  assert.ok(userSubscriptions.length > 0);
  for (const entry of userSubscriptions) assert.deepEqual(JSON.parse(JSON.stringify(entry[1])), { user: true });
  for (const handler of events.get('community-updated')) handler({ room: 'event:public-event' });
  assert.equal(updates, 0);
  for (const handler of events.get('community-updated')) handler({ room: 'user:authorized-account' });
  assert.equal(updates, 1);
  unsubscribe(); stopRevocation(); stop();
});
test('revocation restores admin views and explains suspension/impersonation to ordinary users', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'sessionPolicy.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; vm.runInNewContext(compiled, { exports });
  assert.equal(exports.signalAction(true), 'restore'); assert.equal(exports.signalAction(false), 'clear');
  assert.match(exports.signalMessage('account-suspended'), /suspensa/);
  assert.match(exports.signalMessage('account-impersonated'), /administrador/);
  assert.match(exports.signalMessage('account-removed'), /não está mais disponível/);
  assert.match(exports.signalMessage('session-expired'), /Entre novamente/);
});


function sessionPolicy() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'sessionPolicy.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; vm.runInNewContext(compiled, { exports }); return exports;
}
test('socket rejects only explicit auth failures, not database/network connection errors', () => {
  const policy = sessionPolicy();
  assert.equal(policy.socketFailureSignal('ACCOUNT_SUSPENDED'), 'account-suspended');
  assert.equal(policy.socketFailureSignal('ACCOUNT_REMOVED'), 'account-removed');
  assert.equal(policy.socketFailureSignal('ACCOUNT_IMPERSONATED'), 'account-impersonated');
  assert.equal(policy.socketFailureSignal('IMPERSONATION_CHANGED'), 'session-expired');
  assert.equal(policy.socketFailureSignal('SESSION_REVOKED'), 'session-expired');
  assert.equal(policy.socketFailureSignal('NETWORK_UNAVAILABLE'), null);
  assert.equal(policy.socketFailureSignal(undefined), null);
});
function resourcePolicy() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'resourcePolicy.ts'), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports });
  return exports;
}
test('revoked access discards private snapshots but temporary network failures retain them', () => {
  const policy = resourcePolicy();
  for (const status of [401, 403, 404, 409]) assert.equal(policy.isAccessFailure({ status }), true);
  for (const status of [0, 408, 429, 500, 503]) assert.equal(policy.isAccessFailure({ status }), false);
  assert.equal(policy.isAccessFailure(new Error('offline')), false);
});
test('malformed realtime invalidations cannot break or trigger a room refresh', () => {
  const policy = resourcePolicy();
  for (const value of [null, undefined, true, 4, {}, { room: 3 }]) assert.equal(policy.isDomainUpdate(value), false);
  assert.equal(policy.isDomainUpdate({ room: 'match:valid' }), true);
});
test('connection discovery forwards an encoded pagination cursor to the same gateway', async () => {
  let captured;
  const c = client(async url => { captured = url; return response({ profiles: [], nextAfter: null }); });
  await c.api.party('event/a', 'cursor+b/?');
  assert.equal(captured, 'https://gateway.example/v1/party-connections/event%2Fa?after=cursor%2Bb%2F%3F');
});
