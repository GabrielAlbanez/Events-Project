const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const slots = [];
  let cursor = 0;
  let user = { id: 'account-1' };
  let interval;
  let effects = [];
  const equal = (left, right) => left && right && left.length === right.length && left.every((value, i) => Object.is(value, right[i]));
  const react = {
    useState(initial) { const index = cursor++; slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; }]; },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index]; },
    useCallback(callback, dependencies) { const index = cursor++; if (!equal(slots[index]?.dependencies, dependencies)) slots[index] = { dependencies, callback }; return slots[index].callback; },
    useEffect(effect, dependencies) { const index = cursor++; if (!equal(slots[index]?.dependencies, dependencies)) { const previous = slots[index]; slots[index] = { dependencies }; effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect(); }); } },
  };
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../useResource.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, { exports, Promise, JSON, Error, require(name) {
    if (name === 'react') return react;
    if (name === 'react-native') return { AppState: { currentState: 'active', addEventListener() { return { remove() {} }; } } };
    if (name.includes('SessionContext')) return { useSession: () => ({ user }) };
    if (name.includes('resourcePolicy')) return { isAccessFailure: error => [401,403,404,409].includes(error.status) };
    if (name.includes('realtime')) return { onReconnect: () => () => {}, subscribeDomain: () => () => {} };
    throw new Error(name);
  }, setInterval(callback) { interval = callback; return 1; }, clearInterval() { interval = undefined; } });
  return {
    render(load) { cursor = 0; effects = []; const result = exports.useResource(load, 'events', { user: true }); for (const effect of effects) effect(); return result; },
    poll() { interval(); },
    account(id) { user = { id }; },
    unmount() { for (const slot of slots) slot.cleanup?.(); },
  };
}
function deferredLoader() { const calls = []; return { calls, load: () => new Promise((resolve, reject) => calls.push({ resolve, reject })) }; }
test('polling coalesces an in-flight request and commits its response before a queued refresh', async () => {
  const hook = harness(); const loader = deferredLoader();
  hook.render(loader.load); await flush();
  hook.poll(); hook.poll(); await flush();
  assert.equal(loader.calls.length, 1);
  loader.calls[0].resolve('first-valid-slow-response'); await flush();
  const result = hook.render(loader.load);
  assert.equal(result.data, 'first-valid-slow-response'); assert.equal(result.loading, false);
  assert.equal(loader.calls.length, 2);
  hook.unmount(); loader.calls[1].resolve('ignored'); await flush();
});
test('an account change cannot publish or queue responses from the previous identity', async () => {
  const hook = harness(); const loader = deferredLoader();
  hook.render(loader.load); await flush(); hook.poll();
  hook.account('account-2'); assert.equal(hook.render(loader.load).data, null); await flush();
  assert.equal(loader.calls.length, 2);
  loader.calls[0].resolve('account-1-private-data'); await flush();
  assert.equal(hook.render(loader.load).data, null); assert.equal(loader.calls.length, 2);
  loader.calls[1].resolve('account-2-private-data'); await flush();
  assert.equal(hook.render(loader.load).data, 'account-2-private-data'); hook.unmount();
});
test('a delayed request cannot update state after its effect is cleaned up', async () => {
  const hook = harness(); const loader = deferredLoader();
  hook.render(loader.load); await flush(); hook.poll(); hook.unmount();
  loader.calls[0].resolve('discarded'); await flush();
  assert.equal(loader.calls.length, 1);
});
