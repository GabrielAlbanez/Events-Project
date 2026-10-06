const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// Execute the real hook with deterministic hook slots, network promises and timers.
// This verifies resource state transitions; it does not simulate a browser or render UI.
function harness() {
  const slots = [], effects = [], calls = [], timers = new Map(), listeners = new Map();
  let cursor = 0, timerId = 0, session = { status: "authenticated", data: { user: { id: "admin", role: "ADMIN" } } };
  let url = "/api/community/events/one", result, ignoreAbort = false;
  const changed = (previous, next) => !previous || previous.length !== next.length || previous.some((value, index) => !Object.is(value, next[index]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, value => { slots[index].value = typeof value === "function" ? value(slots[index].value) : value; }];
    },
    useRef(initial) { const index = cursor++; if (!slots[index]) slots[index] = { current: initial }; return slots[index]; },
    useCallback(callback, dependencies) {
      const index = cursor++;
      if (!slots[index] || changed(slots[index].dependencies, dependencies)) slots[index] = { dependencies, callback };
      return slots[index].callback;
    },
    useEffect(effect, dependencies) {
      const index = cursor++, previous = slots[index];
      if (!previous || changed(previous.dependencies, dependencies)) {
        const slot = { dependencies, cleanup: previous?.cleanup }; slots[index] = slot;
        effects.push(() => { slot.cleanup?.(); slot.cleanup = effect(); });
      }
    },
  };
  const navigator = { onLine: true };
  const window = { addEventListener(name, handler) { listeners.set(name, handler); }, removeEventListener(name, handler) { if (listeners.get(name) === handler) listeners.delete(name); } };
  const fetch = (requestUrl, options = {}) => {
    let resolve, reject;
    const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
    const call = { url: requestUrl, options, resolve: (status, body) => resolve({ status, ok: status >= 200 && status < 300, json: async () => body }), reject, settled: false };
    calls.push(call);
    if (!ignoreAbort) options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    ignoreAbort = false;
    return promise;
  };
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../components/MyComponents/CommunityResource.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", "fetch", "navigator", "window", "setTimeout", "clearTimeout", source)(
    name => name === "react" ? react : name === "next-auth/react" ? { useSession: () => session } : require(name), module, module.exports, fetch, navigator, window,
    (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; }, id => timers.delete(id),
  );
  function render() {
    cursor = 0; result = module.exports.useCommunityResource(url);
    while (effects.length) effects.shift()();
    return result;
  }
  async function flush() { for (let index = 0; index < 12; index++) await Promise.resolve(); return render(); }
  return {
    calls, render, flush,
    get current() { return result; },
    changeIdentity(id, role = "BASIC", status = "authenticated") { session = { status, data: id ? { user: { id, role } } : null }; },
    changeUrl(next) { url = next; },
    ignoreNextAbort() { ignoreAbort = true; },
    timer(delay) { const timersToRun = [...timers].filter(([, value]) => value.delay === delay); assert.ok(timersToRun.length, `Expected timer ${delay}`); for (const [id, timer] of timersToRun) { timers.delete(id); timer.callback(); } },
    offline() { navigator.onLine = false; listeners.get("offline")?.(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

async function initial(h) {
  assert.equal(h.render().data, null); assert.equal(h.calls.length, 1);
  h.calls[0].resolve(200, { value: "initial private data" });
  const current = await h.flush(); assert.equal(current.loading, false); assert.equal(current.data.value, "initial private data");
  assert.equal(current.revision, 1); assert.equal(current.lastChangeSource, "remote"); assert.ok(Number.isFinite(Date.parse(current.lastSuccessfulAt)));
}
async function run() {
  const h = harness();
  try {
    await initial(h);
    const timestamp = h.current.lastSuccessfulAt;
    const refresh = h.current.refresh(); h.calls.at(-1).resolve(500, { message: "Temporary failure" }); await refresh;
    let current = await h.flush(); assert.equal(current.data.value, "initial private data"); assert.equal(current.error, "Temporary failure"); assert.equal(current.revision, 1); assert.equal(current.lastSuccessfulAt, timestamp);
    const hanging = current.refresh(); h.timer(15000); await hanging; current = await h.flush();
    assert.equal(current.refreshing, false); assert.equal(current.data.value, "initial private data"); assert.match(current.error, /demorou/);
    for (const status of [401, 403, 404]) {
      const denied = current.refresh(); h.calls.at(-1).resolve(status, { message: "Access denied" }); await denied; current = await h.flush();
      assert.equal(current.data, null); assert.equal(current.lastSuccessfulAt, null);
      const restore = current.refresh(); h.calls.at(-1).resolve(200, { value: "restored" }); await restore; current = await h.flush();
    }
    for (const change of [() => h.changeIdentity("basic"), () => h.changeIdentity("basic", "PROMOTER"), () => h.changeUrl("/api/community/events/two")]) {
      change(); current = h.render(); assert.equal(current.data, null); assert.equal(current.lastSuccessfulAt, null);
      h.calls.at(-1).resolve(200, { value: "new identity" }); current = await h.flush(); assert.equal(current.data.value, "new identity");
    }
    h.ignoreNextAbort(); const stale = current.refresh(); const staleCall = h.calls.at(-1);
    h.changeIdentity("other", "ADMIN"); assert.equal(h.render().data, null); assert.equal(staleCall.options.signal.aborted, true);
    h.calls.at(-1).resolve(200, { value: "other account" }); current = await h.flush();
    staleCall.resolve(200, { value: "STALE PRIVATE DATA" }); await stale; current = await h.flush(); assert.equal(current.data.value, "other account");
    console.log("PASS resource real hook: initial metadata, transient errors/timeouts preserve same identity, access denials clear, account/role/URL transitions and stale responses");

    let count = h.calls.length;
    const failed = current.act({ action: "question.ask", text: "Keep this draft" }); h.calls.at(-1).reject(new TypeError("Network lost")); assert.equal(await failed, false); current = await h.flush();
    assert.equal(h.calls.length, count + 1); assert.equal(current.busy, false); assert.match(current.message, /confirmar|confirmar o envio/); assert.equal(current.data.value, "other account");
    count = h.calls.length;
    const timedOut = current.act({ action: "question.ask", text: "Keep this draft" }); h.timer(30000); assert.equal(await timedOut, false); current = await h.flush();
    assert.equal(h.calls.length, count + 1); assert.equal(current.busy, false); assert.match(current.message, /antes de reenviar/);
    const successful = current.act({ action: "question.ask", text: "Saved" }); h.calls.at(-1).resolve(200, { ok: true }); await h.flush();
    assert.equal(h.calls.at(-1).options.method, undefined); h.calls.at(-1).resolve(200, { value: "own mutation" }); assert.equal(await successful, true); current = await h.flush();
    assert.equal(current.lastChangeSource, "own"); assert.equal(current.data.value, "own mutation"); assert.ok(current.lastSuccessfulAt);
    const previousCalls = h.calls.length; h.offline(); current = h.render(); assert.equal(current.online, false); assert.equal(await current.act({ action: "question.ask", text: "Offline" }), false); assert.equal(h.calls.length, previousCalls);
    console.log("PASS resource real hook: POST network/timeout failures return false without retry, successful mutation records own source, offline blocks submission");
  } finally { h.unmount(); }

  const leaving = harness();
  try {
    await initial(leaving);
    const submitting = leaving.current.act({ action: "question.ask", text: "Old account" }); const pendingPost = leaving.calls.at(-1);
    leaving.changeIdentity("replacement"); assert.equal(leaving.render().data, null); assert.equal(pendingPost.options.signal.aborted, true);
    assert.equal(await submitting, false);
    leaving.calls.at(-1).resolve(200, { value: "replacement" }); const current = await leaving.flush();
    assert.equal(current.busy, false); assert.equal(current.message, ""); assert.equal(current.data.value, "replacement");
    console.log("PASS resource real hook: identity cleanup aborts pending POST and prevents old-account feedback");
  } finally { leaving.unmount(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
