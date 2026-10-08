const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function harness(privateMode = false) {
  const slots = [], effects = [], calls = []; let index = 0, result;
  let session = { status: 'authenticated', data: { user: { id: 'one', role: 'BASIC' } } };
  const differs = (a, b) => !a || a.some((value, i) => value !== b[i]);
  const react = {
    useState(value) { const i = index++; if (!slots[i]) slots[i] = { value: typeof value === 'function' ? value() : value }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }]; },
    useRef(value) { const i = index++; return slots[i] ?? (slots[i] = { current: value }); },
    useCallback(callback, deps) { const i = index++; if (!slots[i] || differs(slots[i].deps, deps)) slots[i] = { callback, deps }; return slots[i].callback; },
    useEffect(effect, deps) { const i = index++, old = slots[i]; if (!old || differs(old.deps, deps)) { slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = effect(); }); } },
  };
  const fetch = (url, options) => new Promise((resolve, reject) => { calls.push({ url, options, resolve: (status, body) => resolve({ status, ok: status < 400, json: async () => body }), reject }); options.signal.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError'))); });
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync('hooks/useEventChat.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const document = { visibilityState: 'visible' }; let uuidSequence = 0, clock = 0, timerId = 0;
  const timers = new Map();
  const socketHandlers = new Map(), socketEvents = [];
  const socket = { connected: true, on: (name, handler) => socketHandlers.set(name, handler), off: name => socketHandlers.delete(name), emit: (name, payload) => socketEvents.push({ name, payload }) };
  const schedule = (fn, delay) => { const id = ++timerId; timers.set(id, { fn, due: clock + delay }); return id; };
  new Function('require', 'module', 'exports', 'fetch', 'navigator', 'window', 'crypto', 'document', 'setTimeout', 'clearTimeout', source)(name => name === 'react' ? react : name === '@/lib/socketClient' ? { socket } : { useSession: () => session }, module, module.exports, fetch, { onLine: true }, { addEventListener() {}, removeEventListener() {} }, { randomUUID: () => `01234567-89ab-4def-8abc-${String(++uuidSequence).padStart(12, '0')}` }, document, schedule, id => timers.delete(id));
  const render = () => { index = 0; result = module.exports.useEventChat('event', privateMode ? '/api/party-connections/event/matches/match' : undefined); while (effects.length) effects.shift()(); return result; };
  return { calls, render, document, advance(ms) { clock += ms; for (const [id, timer] of Array.from(timers)) if (timer.due <= clock) { timers.delete(id); timer.fn(); } }, get current() { return result; }, async flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); return render(); }, account(id) { session = { status: 'authenticated', data: { user: { id, role: 'BASIC' } } }; }, close() { slots.forEach(slot => slot?.cleanup?.()); } };
}
const message = (id, own = false, clientId = 'other') => ({ id, own, clientId, text: 'Message ' + id, createdAt: '2026-10-02T07:00:00Z', author: { id: own ? 'one' : 'two', name: 'Participant', image: null } });
const page = (messages, hasMore = false) => ({ event: { id: 'event', name: 'Party' }, messages, nextBefore: null, hasMore });
(async () => {
  const h = harness();
  try {
    h.render(); h.calls[0].resolve(200, page([message(1)])); await h.flush();
    const sending = h.current.send('Hello'); const uuid = JSON.parse(h.calls.at(-1).options.body).clientId;
    h.render(); assert.equal(h.current.optimisticMessage.text, 'Hello', 'bubble appears before the request resolves');
    assert.equal(h.current.optimisticMessage.id, -1); assert.equal(h.current.messages.length, 1, 'local bubble never advances authoritative history');
    h.calls.at(-1).resolve(200, { message: message(4, true, uuid) }); assert.equal(await sending, true); await h.flush();
    assert.equal(h.current.optimisticMessage, null, 'confirmed message replaces the local bubble');
    const refresh = h.current.refresh(); assert.match(h.calls.at(-1).url, /after=1$/);
    h.calls.at(-1).resolve(200, page([message(2), message(3), message(4, true, uuid)])); await refresh; await h.flush();
    assert.deepEqual(h.current.messages.map(item => item.id), [1, 2, 3, 4]);
    const failed = h.current.send('Preserved text'); h.calls.at(-1).reject(new TypeError('Offline')); assert.equal(await failed, false); await h.flush();
    const pending = h.current.pending; const retry = h.current.send(pending.text, true); assert.equal(JSON.parse(h.calls.at(-1).options.body).clientId, pending.clientId);
    h.render(); assert.equal(h.current.optimisticMessage.clientId, pending.clientId, 'retry preserves one local bubble');
    h.calls.at(-1).resolve(200, { message: message(5, true, pending.clientId) }); assert.equal(await retry, true); await h.flush();
    const stale = h.current.refresh(); const old = h.calls.at(-1); h.account('replacement'); assert.equal(h.render().messages.length, 0); assert.equal(old.options.signal.aborted, true); await stale;
    assert.equal(h.current.optimisticMessage, null);
    h.calls.at(-1).resolve(200, page([message(6)])); await h.flush(); assert.deepEqual(h.current.messages.map(item => item.id), [6]);
    const delayed = h.current.refresh(); let releaseJSON;
    h.calls.at(-1).resolve(200, new Promise(resolve => { releaseJSON = resolve; })); await h.flush();
    h.current.revoke(); await h.flush(); releaseJSON(page([message(7)])); await delayed; await h.flush();
    assert.equal(h.current.denied, true); assert.equal(h.current.messages.length, 0); assert.equal(h.current.pending, null);
    console.log('PASS real chat hook: own POST does not skip missed messages; retry keeps UUID; account cleanup and revocation clear history');
  } finally { h.close(); }
  const dm = harness(true);
  try {
    dm.render(); dm.calls[0].resolve(200, { ...page([message(1)]), partnerReceipt: { deliveredThrough: 0, readThrough: 0, typingUntil: 0 } }); await dm.flush();
    dm.current.typing(true); const typing = dm.calls.at(-1); assert.equal(typing.options.method, 'PATCH');
    dm.current.typing(true); assert.equal(dm.calls.at(-1), typing, 'typing updates are throttled'); typing.resolve(200, { ok: true }); await dm.flush();
    dm.document.visibilityState = 'hidden'; const before = dm.calls.length;
    dm.current.acknowledge(1, true); assert.equal(dm.calls.length, before, 'background tabs do not mark messages read');
    dm.document.visibilityState = 'visible'; dm.current.acknowledge(1, true); assert.equal(JSON.parse(dm.calls.at(-1).options.body).read, true);
    dm.calls.at(-1).resolve(200, { ok: true }); await dm.flush();
    const confirmed = dm.calls.length; dm.current.acknowledge(1, true); assert.equal(dm.calls.length, confirmed, 'confirmed receipts are deduplicated');
    dm.current.typing(false); dm.calls.at(-1).resolve(403, {}); await dm.flush(); assert.equal(dm.current.denied, true);
    const revoked = dm.calls.length; dm.current.typing(true); dm.current.acknowledge(1, true); assert.equal(dm.calls.length, revoked, 'revocation blocks all private controls');
    console.log('PASS private chat controls: typing throttle, read visibility, receipt deduplication and revocation');
  } finally { dm.close(); }
  const automatic = harness(true);
  try {
    automatic.render(); automatic.calls[0].resolve(200, page([])); await automatic.flush();
    const first = automatic.current.send('Retry automatically'); const original = automatic.calls.at(-1);
    const id = JSON.parse(original.options.body).clientId; original.reject(new TypeError('Network interruption')); assert.equal(await first, false); await automatic.flush();
    automatic.advance(1000); automatic.calls.at(-1).resolve(200, page([])); await automatic.flush();
    const retryPost = automatic.calls.at(-1); assert.equal(retryPost.options.method, 'POST'); assert.equal(JSON.parse(retryPost.options.body).clientId, id);
    retryPost.resolve(200, { message: message(1, true, id) }); await automatic.flush(); assert.equal(automatic.current.pending, null);
    const lost = automatic.current.send('Saved but response lost'); const lostId = JSON.parse(automatic.calls.at(-1).options.body).clientId;
    automatic.calls.at(-1).reject(new TypeError('Response lost')); await lost; await automatic.flush();
    const postsBefore = automatic.calls.filter(call => call.options.method === 'POST').length;
    automatic.advance(1000); automatic.calls.at(-1).resolve(200, page([message(2, true, lostId)])); await automatic.flush();
    assert.equal(automatic.current.pending, null); assert.equal(automatic.calls.filter(call => call.options.method === 'POST').length, postsBefore, 'persisted messages reconcile without resending');
    console.log('PASS automatic send: bounded timer retry preserves UUID; lost response reconciles from history without duplicate POST');
  } finally { automatic.close(); }
  const exhausted = harness(true);
  try {
    exhausted.render(); exhausted.calls[0].resolve(200, page([])); await exhausted.flush();
    const first = exhausted.current.send('Photo pending', false, 'image-identifier');
    const original = JSON.parse(exhausted.calls.at(-1).options.body);
    exhausted.render(); assert.ok(exhausted.current.optimisticMessage.image.url.endsWith('/images/image-identifier'));
    exhausted.calls.at(-1).reject(new TypeError('Offline')); await first; await exhausted.flush();
    for (const delay of [1000, 2500, 5000, 10000]) {
      exhausted.advance(delay); exhausted.calls.at(-1).resolve(200, page([])); await exhausted.flush();
      assert.deepEqual(JSON.parse(exhausted.calls.at(-1).options.body), original, 'automatic retry preserves image and UUID');
      exhausted.calls.at(-1).resolve(503, { message: 'Unavailable' }); await exhausted.flush();
    }
    await exhausted.flush(); assert.equal(exhausted.current.retryStopped, true);
    const count = exhausted.calls.length; exhausted.advance(60000); await exhausted.flush(); assert.equal(exhausted.calls.length, count);
    const manual = exhausted.current.send('Photo pending', true);
    exhausted.calls.at(-1).resolve(400, { message: 'Invalid attachment' }); await manual; await exhausted.flush();
    assert.equal(exhausted.current.pending, null, 'permanent errors do not retry indefinitely');
    console.log('PASS retry limits: four automatic attempts, stable attachment, no retry loop and permanent error handling');
  } finally { exhausted.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
