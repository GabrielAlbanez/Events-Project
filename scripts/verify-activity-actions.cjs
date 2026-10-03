const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// Real hook, deterministic React slots/network/timers; no browser or database.
function harness() {
  const slots = [], effects = [], calls = [], timers = new Map();
  let cursor = 0, timerId = 0, identity = "authenticated:account:ADMIN", result;
  let session = { status: "authenticated", data: { user: { id: "account", role: "ADMIN" } } };
  let ignoreAbort = false, refreshFailure = false, refreshes = 0;
  const changed = (a, b) => !a || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const react = {
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === "function" ? initial() : initial }; return [slots[i].value, value => { slots[i].value = typeof value === "function" ? value(slots[i].value) : value; }]; },
    useRef(initial) { const i = cursor++; if (!slots[i]) slots[i] = { current: initial }; return slots[i]; },
    useCallback(callback, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { deps, callback }; return slots[i].callback; },
    useEffect(effect, deps) { const i = cursor++, old = slots[i]; if (!old || changed(old.deps, deps)) { const slot = { deps, cleanup: old?.cleanup }; slots[i] = slot; effects.push(() => { slot.cleanup?.(); slot.cleanup = effect(); }); } },
  };
  const navigator = { onLine: true };
  const refresh = async () => { refreshes++; if (refreshFailure) throw new Error("Synchronization unavailable"); };
  const fetch = (url, options = {}) => {
    let resolve, reject;
    const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
    calls.push({ url, options, resolve: (status, body) => resolve({ status, ok: status >= 200 && status < 300, json: async () => body }), reject });
    if (!ignoreAbort) options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    ignoreAbort = false;
    return promise;
  };
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../hooks/useActivityActions.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", "fetch", "navigator", "setTimeout", "clearTimeout", source)(
    name => name === "react" ? react : name === "next-auth/react" ? { useSession: () => session } : require(name), module, module.exports, fetch, navigator,
    (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; }, id => timers.delete(id),
  );
  function render() { cursor = 0; result = module.exports.useActivityActions(identity, refresh); while (effects.length) effects.shift()(); return result; }
  return {
    calls, render, async flush() { for (let i = 0; i < 15; i++) await Promise.resolve(); return render(); },
    get refreshes() { return refreshes; },
    offline() { navigator.onLine = false; },
    logout() { identity = "unauthenticated"; session = { status: "unauthenticated", data: null }; },
    replace() { identity = "authenticated:other:BASIC"; session = { status: "authenticated", data: { user: { id: "other", role: "BASIC" } } }; },
    ignoreNextAbort() { ignoreAbort = true; },
    failRefresh() { refreshFailure = true; },
    timer(delay) { const found = [...timers].filter(([, timer]) => timer.delay === delay); assert.ok(found.length, `Expected timer ${delay}`); for (const [id, timer] of found) { timers.delete(id); timer.callback(); } },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}
const action = { eventId: "11111111-1111-4111-8111-111111111111", id: "22222222-2222-4222-8222-222222222222", action: "queue.leave" };
async function run() {
  const h = harness();
  try {
    let current = h.render();
    const first = current.run(action), duplicate = current.run(action);
    assert.equal(h.calls.length, 1); assert.equal(await duplicate, false); assert.ok(h.render().busy);
    assert.equal(h.calls[0].options.method, "POST");
    h.calls[0].resolve(200, { ok: true }); assert.equal(await first, true); current = await h.flush();
    assert.equal(current.busy, false); assert.equal(h.refreshes, 1); assert.ok(current.message);
    current.clearFeedback(); current = h.render(); assert.equal(current.message, ""); assert.equal(current.error, "");
    const failed = current.run({ ...action, action: "task.update", status: "HELP" }); h.calls.at(-1).resolve(500, { message: "Permission denied" }); assert.equal(await failed, false); current = await h.flush();
    assert.match(current.error, /Permission denied/); assert.equal(h.refreshes, 1); assert.equal(current.busy, false);
    const count = h.calls.length; const timedOut = current.run(action); h.timer(30000); assert.equal(await timedOut, false); current = await h.flush();
    assert.equal(h.calls.length, count + 1); assert.equal(h.refreshes, 1); assert.match(current.error || current.message, /confirm|reenvi|verifi/i);
    const network = current.run(action); h.calls.at(-1).reject(new TypeError("Network lost")); assert.equal(await network, false); current = await h.flush(); assert.equal(h.calls.length, count + 2); assert.equal(h.refreshes, 1);
    h.failRefresh(); const saved = current.run(action); h.calls.at(-1).resolve(200, { ok: true }); assert.equal(await saved, true); current = await h.flush();
    assert.ok(current.message); assert.match(current.error || current.message, /atual|sincron|sync/i); assert.equal(h.refreshes, 2);
    const beforeOffline = h.calls.length; h.offline(); assert.equal(await current.run(action), false); assert.equal(h.calls.length, beforeOffline);
    console.log("PASS activity actions real hook: single POST, feedback, server denial, timeout/network uncertainty without retry, confirmed success and synchronization failure");
  } finally { h.unmount(); }
  for (const status of [401, 403, 404]) {
    const h = harness();
    try {
      const denied = h.render().run(action); h.calls[0].resolve(status, { message: "Access denied" });
      assert.equal(await denied, false); const current = await h.flush();
      assert.equal(h.refreshes, 1); assert.match(current.error, /Access denied/); assert.equal(current.message, "");
    } finally { h.unmount(); }
  }
  const invalid = harness();
  try {
    const current = invalid.render();
    for (const payload of [{ ...action, id: "invalid" }, { ...action, action: "task.update" }, { ...action, action: "task.update", status: "INVALID" }]) assert.equal(await current.run(payload), false);
    assert.equal(invalid.calls.length, 0);
  } finally { invalid.unmount(); }
  console.log("PASS activity actions real hook: access denials trigger authoritative refresh; invalid action identifiers/status never submitted");
  for (const change of ["logout", "replace"]) {
    const h = harness();
    try {
      let current = h.render(); h.ignoreNextAbort(); const pending = current.run(action), call = h.calls[0];
      h[change](); h.render(); assert.equal(call.options.signal.aborted, true);
      call.resolve(200, { ok: true }); assert.equal(await pending, false); current = await h.flush();
      assert.equal(h.refreshes, 0); assert.equal(current.busy, false); assert.equal(current.message, ""); assert.equal(current.error, "");
      if (change === "logout") { assert.equal(await current.run(action), false); assert.equal(h.calls.length, 1); }
    } finally { h.unmount(); }
  }
  console.log("PASS activity actions real hook: logout/account change abort pending request, ignore late response and remove old feedback; unauthenticated submissions blocked");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
