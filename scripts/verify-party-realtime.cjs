const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const slots = [], effects = [], timers = new Map(), intervals = new Map(), handlers = new Map(), emissions = [];
let cursor = 0, timerId = 0, refreshed = 0, denied = 0, enabled = true;
let holdReplies = false;
const replies = [];
let session = { status: "authenticated", data: { user: { id: "one", role: "BASIC" } } };
const different = (a, b) => !a || a.some((value, index) => value !== b[index]);
const react = {
  useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
  useState(value) { const i = cursor++; slots[i] ??= { value }; return [slots[i].value, next => { slots[i].value = next; }]; },
  useEffect(callback, dependencies) {
    const i = cursor++, old = slots[i];
    if (different(old?.dependencies, dependencies)) {
      const slot = slots[i] = { dependencies, cleanup: old?.cleanup };
      effects.push(() => { slot.cleanup?.(); slot.cleanup = callback(); });
    }
  },
};
const socket = {
  connected: true,
  on(name, callback) { const set = handlers.get(name) ?? new Set(); set.add(callback); handlers.set(name, set); },
  off(name, callback) { handlers.get(name)?.delete(callback); },
  emit(name, payload, reply) { emissions.push({ name, payload }); if (reply) { if (holdReplies) replies.push({ payload, reply }); else reply({ ok: true }); } },
};
const navigator = { onLine: true };
const surface = { addEventListener() {}, removeEventListener() {} };
const document = { ...surface, visibilityState: "visible" };
const moduleValue = { exports: {} };
const source = ts.transpileModule(fs.readFileSync("hooks/usePartyRealtime.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
new Function("require", "module", "exports", "navigator", "document", "window", "setTimeout", "clearTimeout", "setInterval", "clearInterval", source)(
  name => name === "react" ? react : name === "next-auth/react" ? { useSession: () => session } : { useSocket: () => socket },
  moduleValue, moduleValue.exports, navigator, document, surface,
  (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; }, id => timers.delete(id),
  callback => { const id = ++timerId; intervals.set(id, callback); return id; }, id => intervals.delete(id),
);
function render(input) { cursor = 0; const result = moduleValue.exports.usePartyRealtime(input, () => { refreshed++; }, () => { denied++; }, enabled); while (effects.length) effects.shift()(); return result; }
async function debounce() { for (const [id, timer] of timers) if (timer.delay === 150) { timers.delete(id); timer.callback(); } for (let i = 0; i < 10; i++) await Promise.resolve(); }
function emit(name, payload) { for (const handler of handlers.get(name) ?? []) handler(payload); }
async function run() {
  const scope = { partyEventId: "party" };
  enabled = false; render(scope); await debounce();
  assert.equal(denied, 0, "not opted-in must retain editable preferences");
  assert.equal(emissions.length, 0);
  enabled = true; render(scope); await debounce();
  assert.equal(render(scope), "live"); assert.equal(refreshed, 1);
  emit("notification-updated"); emit("community-updated", { room: "user:one" }); await debounce();
  assert.equal(refreshed, 2, "personal match signals refresh immediately and coalesce");
  emit("community-updated", { room: "user:other" }); await debounce();
  assert.equal(refreshed, 2, "other accounts cannot invalidate this snapshot");
  emit("community-updated", { room: "party:party" }); await debounce(); assert.equal(refreshed, 3);
  for (const callback of intervals.values()) callback(); await debounce(); assert.equal(refreshed, 4);
  navigator.onLine = false; emit("notification-updated"); await debounce(); assert.equal(refreshed, 4);
  navigator.onLine = true;
  session = { status: "unauthenticated", data: null }; render(scope);
  for (const set of handlers.values()) assert.equal(set.size, 0, "all listeners including notifications are removed after logout");
  assert.equal(timers.size, 0); assert.equal(intervals.size, 0);
  session = { status: "authenticated", data: { user: { id: "two", role: "BASIC" } } };
  holdReplies = true;
  render({ matchId: "pair" });
  const old = replies.at(-1);
  emit("community-access-denied", { room: "match:pair" });
  const deniedBefore = denied;
  old.reply({ ok: true });
  assert.equal(render({ matchId: "pair" }), "denied", "late ACK cannot restore revoked private access");
  assert.equal(denied, deniedBefore);
  session = { status: "unauthenticated", data: null }; render({ matchId: "pair" });
  console.log("PASS party realtime: personal match signals, account isolation, offline queue, opt-in, periodic authorization and cleanup.");
}
run().catch(error => { console.error(error); process.exitCode = 1; });

