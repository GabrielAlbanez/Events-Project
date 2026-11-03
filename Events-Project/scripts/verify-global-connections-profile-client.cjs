const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Execute the production hook. Only React scheduling, the shared GET resource,
// fetch and time are deterministic boundaries; no real profile is modified.
function harness() {
  const slots = [], effects = [], requests = [], resourceUrls = [], toasts = [], timers = new Map();
  let index = 0, mounted = true, lateUpdates = 0, timerId = 0, refreshes = 0, current;
  const resource = { identity: 'user-a', authenticated: true, online: true, busy: false, data: { profile: null, needsReview: false }, async refresh() { refreshes++; } };
  const react = {
    useState(initial) { const i = index++; slots[i] ??= { value: initial }; return [slots[i].value, value => { if (!mounted) lateUpdates++; slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }]; },
    useRef(initial) { const i = index++; return slots[i] ??= { current: initial }; },
    useEffect(effect, deps) { const i = index++, old = slots[i]; if (!old || deps.some((value, n) => value !== old.deps[n])) { slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = effect(); }); } },
  };
  const fetch = (url, options) => new Promise((resolve, reject) => {
    const request = { url, options, resolve, reject }; requests.push(request);
    options.signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
  });
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync('hooks/useGlobalConnectionsProfile.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const requireHook = name => {
    if (name === 'react') return react;
    if (name === 'react-toastify') return { toast: { success: (message, options) => toasts.push({ message, options }) } };
    if (name.endsWith('CommunityResource')) return { useCommunityResource(url) { resourceUrls.push(url); return { ...resource }; } };
    throw new Error('Unexpected dependency: ' + name);
  };
  new Function('require', 'module', 'exports', 'fetch', 'setTimeout', 'clearTimeout', source)(requireHook, module, module.exports, fetch, fn => { const id = ++timerId; timers.set(id, fn); return id; }, id => timers.delete(id));
  const render = () => { index = 0; current = module.exports.useGlobalConnectionsProfile(); while (effects.length) effects.shift()(); return current; };
  const unmount = () => { mounted = false; slots.forEach(slot => slot?.cleanup?.()); };
  render(); render();
  return { resource, requests, resourceUrls, toasts, render, unmount, get current() { return current; }, get lateUpdates() { return lateUpdates; }, get refreshes() { return refreshes; }, get timerCount() { return timers.size; }, timeout() { for (const fn of [...timers.values()]) fn(); }, async flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); if (mounted) render(); } };
}
const draft = { action: 'profile.save', displayName: 'Ana', photoUrl: '', bio: 'Música e encontros', interests: ['Música'], intent: 'FRIENDSHIP', adultDeclared: false };
const fields = { ...draft }; delete fields.action;
const ok = request => request.resolve({ ok: true, async json() { return { profile: fields, needsReview: false }; } });
(async () => {
  const h = harness();
  assert.equal(h.requests.length, 0, 'Mount and GET resource must not PUT or join');
  assert.equal(h.toasts.length, 0, 'Mount must not announce a save');
  assert.deepEqual([...new Set(h.resourceUrls)], ['/api/party-profile']);
  const first = h.current.save(draft), duplicate = h.current.save(draft);
  assert.equal(h.requests.length, 1, 'Immediate double click must share one pending request');
  assert.equal(await duplicate, false);
  h.render(); assert.equal(h.current.busy, true);
  const request = h.requests[0];
  assert.equal(request.url, '/api/party-profile'); assert.equal(request.options.method, 'PUT');
  assert.deepEqual(JSON.parse(request.options.body), fields, 'PUT strips event action');
  request.resolve({ ok: false, async json() { return { message: 'Não foi possível salvar.' }; } });
  assert.equal(await first, false); await h.flush();
  assert.equal(h.toasts.length, 0, 'Failed saves must not show success');
  assert.equal(h.current.busy, false); assert.match(h.current.saveError, /Não foi possível salvar/);
  assert.deepEqual(draft, { action: 'profile.save', ...fields }, 'Failure must not mutate caller draft');
  const retry = h.current.save(draft); assert.deepEqual(JSON.parse(h.requests[1].options.body), fields);
  ok(h.requests[1]); assert.equal(await retry, true); await h.flush();
  assert.equal(h.refreshes, 1, 'Save refreshes only global resource');
  assert.equal(h.current.saveError, ''); assert.deepEqual(h.toasts, [{ message: 'Perfil atualizado.', options: { role: 'status' } }]); assert.equal(h.timerCount, 0);
  assert.ok(h.requests.every(item => item.options.method === 'PUT' && item.url === '/api/party-profile'), 'No event participation request');
  h.unmount(); const oldCount = h.requests.length;
  assert.equal(await h.current.save(draft), false, 'Stale handler after unmount cannot send'); assert.equal(h.requests.length, oldCount);
  assert.equal(h.lateUpdates, 0);

  const timed = harness(); const pending = timed.current.save(draft); timed.timeout();
  assert.equal(timed.requests[0].options.signal.aborted, true); assert.equal(await pending, false); await timed.flush();
  assert.equal(timed.current.busy, false); assert.match(timed.current.saveError, /interrompido/); timed.unmount();
  assert.equal(timed.toasts.length, 0);
  assert.equal(timed.lateUpdates, 0);

  const closed = harness(); const closing = closed.current.save(draft); closed.unmount();
  assert.equal(closed.requests[0].options.signal.aborted, true); assert.equal(await closing, false); await closed.flush();
  assert.equal(closed.lateUpdates, 0, 'Abort finally must never update an unmounted hook'); assert.equal(closed.refreshes, 0);
  assert.equal(closed.toasts.length, 0, 'Unmounted requests must not announce success');

  // Response arrived before unmount, but JSON resolution is late.
  const late = harness(); let finishJson;
  const lateSave = late.current.save(draft);
  late.requests[0].resolve({ ok: true, json: () => new Promise(resolve => { finishJson = resolve; }) });
  await late.flush(); late.unmount(); finishJson({ profile: fields });
  assert.equal(await lateSave, false); assert.equal(late.lateUpdates, 0); assert.equal(late.refreshes, 0);
  assert.equal(late.toasts.length, 0, 'Late JSON must not announce success after unmount');

  const refreshing = harness(); let finishRefresh;
  refreshing.resource.refresh = () => new Promise(resolve => { finishRefresh = resolve; }); refreshing.render();
  const refreshSave = refreshing.current.save(draft); ok(refreshing.requests[0]); await refreshing.flush();
  refreshing.unmount(); finishRefresh();
  assert.equal(await refreshSave, false); assert.equal(refreshing.toasts.length, 0, 'Unmount during refresh must not announce success');

  const switched = harness(); const staleSave = switched.current.save;
  const previous = staleSave(draft); switched.resource.identity = 'user-b'; switched.resource.data = { profile: null, needsReview: false }; switched.render();
  assert.equal(switched.requests[0].options.signal.aborted, true, 'Identity change aborts previous request');
  assert.equal(await previous, false); await switched.flush();
  assert.equal(switched.current.saveError, ''); assert.equal(switched.current.data.profile, null); assert.equal(switched.refreshes, 0);
  assert.equal(switched.toasts.length, 0, 'A previous identity must not announce success');
  assert.equal(await staleSave(draft), false, 'Previous identity handler cannot send for a new account');
  assert.equal(switched.requests.length, 1);
  const newSave = switched.current.save({ ...draft, displayName: 'Bia' }); ok(switched.requests[1]); assert.equal(await newSave, true); await switched.flush();
  assert.equal(switched.refreshes, 1); assert.equal(switched.lateUpdates, 0); switched.unmount();
  console.log('PASS production global profile hook: read-only mount, pure PUT, duplicate lock, preserved retry draft, global refresh without opt-in, timeout, unmount, late response and identity isolation');
})().catch(error => { console.error(error); process.exitCode = 1; });
