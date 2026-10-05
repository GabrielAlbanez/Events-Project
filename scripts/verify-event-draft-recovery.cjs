const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const mod = { exports: {} };
new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync('lib/eventDraftStorage.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(require, mod, mod.exports);
const { parseStoredEventDraft, EVENT_DRAFT_TTL } = mod.exports;
const now = Date.now();
const draft = { values: { nome: 'Teste', descricao: '', LinkParaCompraIngresso: '', endereco: '', category: '', price: '', capacity: '', isFree: true, startTime: '', endTime: '' }, dates: ['2026-10-05', '2026-10-05'], coordinates: null, recurrence: 'none', repeatEvery: 1, occurrences: 4 };
const envelope = { version: 1, savedAt: now, base: 'initial', draft };
assert.deepEqual(parseStoredEventDraft(JSON.stringify(envelope), now)?.draft, draft);
assert.equal(parseStoredEventDraft('{broken', now), null);
assert.equal(parseStoredEventDraft(JSON.stringify({ ...envelope, savedAt: now - EVENT_DRAFT_TTL - 1 }), now), null);
assert.equal(parseStoredEventDraft(JSON.stringify({ ...envelope, savedAt: now + 1 }), now), null);
assert.equal(parseStoredEventDraft(JSON.stringify({ ...envelope, draft: { ...draft, token: 'forbidden' } }), now), null);
assert.equal(parseStoredEventDraft(JSON.stringify({ ...envelope, draft: { ...draft, coordinates: { lat: 95, lng: 0 } } }), now), null);
assert.equal(parseStoredEventDraft(JSON.stringify({ ...envelope, draft: { ...draft, values: { ...draft.values, nome: 'a'.repeat(4001) } } }), now), null);
assert.equal(parseStoredEventDraft('x'.repeat(40001), now), null);
console.log('PASS: local draft schema, expiry, future timestamp, private extra fields, coordinates and storage bounds');
// Exercise the actual hook with a small deterministic React effect/timer harness.
const source = ts.transpileModule(fs.readFileSync('hooks/useEventDraftRecovery.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
let slots = [], cursor = 0, effects = [], timers = new Map(), tick = 0;
const react = {
  useRef(value) { const i = cursor++; if (!slots[i]) slots[i] = { current: value }; return slots[i]; },
  useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
  useEffect(effect, deps) { const i = cursor++; const old = slots[i]; if (!old || deps.some((v, n) => !Object.is(v, old.deps[n]))) { old?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = effect(); }); } },
};
const storage = new Map();
global.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
global.window = { setTimeout: fn => { const id = ++tick; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id), addEventListener() {}, removeEventListener() {} };
global.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
const hookModule = { exports: {} };
new Function('require', 'module', 'exports', source)(name => name === 'react' ? react : name === '@/lib/eventDraftStorage' ? mod.exports : require(name), hookModule, hookModule.exports);
const fingerprint = JSON.stringify(draft);
function render(account, fp = fingerprint, dirty = false) { cursor = 0; const hook = hookModule.exports.useEventDraftRecovery(account, undefined, fp, fingerprint, dirty); effects.splice(0).forEach(fn => fn()); return hook; }
render('account-a'); render('account-a');
const changed = JSON.stringify({ ...draft, values: { ...draft.values, nome: 'Changed' } });
render('account-a', changed, true); assert.equal(timers.size, 1);
render('account-b', changed, true); render('account-b', changed, true);
assert.equal(timers.size, 0); assert.equal(storage.size, 0, 'account switch cancels pending writes');
assert.match(render('account-b', changed, true).message, /conta mudou/i);
slots.forEach(slot => slot?.cleanup?.()); slots = []; timers.clear();
render('account-a'); render('account-a');
let hook = render('account-a', changed, true); for (const fn of timers.values()) fn(); timers.clear();
assert.equal(storage.size, 1);
hook.clearSaved(); assert.equal(storage.size, 0);
render('account-a', changed, true); assert.equal(timers.size, 0, 'manual save prevents recreation');
slots.forEach(slot => slot?.cleanup?.());
console.log('PASS: real autosave hook cancels identity changes, prevents cross-account persistence and clears successful saves');
assert.equal(parseStoredEventDraft(JSON.stringify({ ...envelope, draft: { ...draft, dates: ['2026-02-30', '2026-02-30'] } }), now), null);
console.log('PASS: impossible calendar dates rejected before recovery');
