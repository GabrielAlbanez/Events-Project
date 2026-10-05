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
  const document = { visibilityState: 'visible' };
  new Function('require', 'module', 'exports', 'fetch', 'navigator', 'window', 'crypto', 'document', source)(name => name === 'react' ? react : { useSession: () => session }, module, module.exports, fetch, { onLine: true }, { addEventListener() {}, removeEventListener() {} }, { randomUUID: () => '01234567-89ab-4def-8abc-0123456789ab' }, document);
  const render = () => { index = 0; result = module.exports.useEventChat('event', privateMode ? '/api/party-connections/event/matches/match' : undefined); while (effects.length) effects.shift()(); return result; };
  return { calls, render, document, get current() { return result; }, async flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); return render(); }, account(id) { session = { status: 'authenticated', data: { user: { id, role: 'BASIC' } } }; }, close() { slots.forEach(slot => slot?.cleanup?.()); } };
}
const message = (id, own = false, clientId = 'other') => ({ id, own, clientId, text: 'Message ' + id, createdAt: '2026-10-02T07:00:00Z', author: { id: own ? 'one' : 'two', name: 'Participant', image: null } });
const page = (messages, hasMore = false) => ({ event: { id: 'event', name: 'Party' }, messages, nextBefore: null, hasMore });
(async () => {
  const h = harness();
  try {
    h.render(); h.calls[0].resolve(200, page([message(1)])); await h.flush();
    const sending = h.current.send('Hello'); const uuid = JSON.parse(h.calls.at(-1).options.body).clientId;
    h.calls.at(-1).resolve(200, { message: message(4, true, uuid) }); assert.equal(await sending, true); await h.flush();
    const refresh = h.current.refresh(); assert.match(h.calls.at(-1).url, /after=1$/);
    h.calls.at(-1).resolve(200, page([message(2), message(3), message(4, true, uuid)])); await refresh; await h.flush();
    assert.deepEqual(h.current.messages.map(item => item.id), [1, 2, 3, 4]);
    const failed = h.current.send('Preserved text'); h.calls.at(-1).reject(new TypeError('Offline')); assert.equal(await failed, false); await h.flush();
    const pending = h.current.pending; const retry = h.current.send(pending.text, true); assert.equal(JSON.parse(h.calls.at(-1).options.body).clientId, pending.clientId);
    h.calls.at(-1).resolve(200, { message: message(5, true, pending.clientId) }); assert.equal(await retry, true); await h.flush();
    const stale = h.current.refresh(); const old = h.calls.at(-1); h.account('replacement'); assert.equal(h.render().messages.length, 0); assert.equal(old.options.signal.aborted, true); await stale;
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
})().catch(error => { console.error(error); process.exitCode = 1; });
