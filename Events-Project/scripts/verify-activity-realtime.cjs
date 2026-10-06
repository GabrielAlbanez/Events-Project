const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const slots = [], effects = [], timers = new Map(), intervals = new Map(), handlers = new Map(), emissions = [];
let cursor = 0, timerId = 0, refreshed = 0;
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
const source = ts.transpileModule(fs.readFileSync("hooks/useActivityRealtime.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
new Function("require", "module", "exports", "navigator", "document", "window", "setTimeout", "clearTimeout", "setInterval", "clearInterval", source)(
  name => name === "react" ? react : name === "next-auth/react" ? { useSession: () => session } : { useSocket: () => socket },
  moduleValue, moduleValue.exports, navigator, document, surface,
  (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; }, id => timers.delete(id),
  callback => { const id = ++timerId; intervals.set(id, callback); return id; }, id => intervals.delete(id),
);
function render(input) { cursor = 0; const result = moduleValue.exports.useActivityRealtime(input, () => { refreshed++; }); while (effects.length) effects.shift()(); return result; }
async function debounce() { for (const [id, timer] of timers) if (timer.delay === 150) { timers.delete(id); timer.callback(); } for (let i = 0; i < 10; i++) await Promise.resolve(); }
async function run() {
  const input = { eventIds: Array.from({ length: 30 }, (_, i) => `event-${i}`), roomIds: Array.from({ length: 30 }, (_, i) => `room-${i}`) };
  render(input); assert.equal(emissions.filter(call => call.name === "community-subscribe").length, 19);
  assert.equal(render(input), "live"); await debounce(); assert.equal(refreshed, 1);
  render({ eventIds: [...input.eventIds].reverse(), roomIds: input.roomIds });
  assert.equal(emissions.length, 19, "Reordering snapshots must not rebuild subscriptions");
  for (const callback of intervals.values()) callback(); await debounce();
  assert.equal(refreshed, 2, "Live snapshots also reconcile unseen memberships");
  navigator.onLine = false; for (const callback of intervals.values()) callback(); await debounce(); assert.equal(refreshed, 2);
  navigator.onLine = true; document.visibilityState = "hidden"; for (const callback of intervals.values()) callback(); await debounce(); assert.equal(refreshed, 2);
  document.visibilityState = "visible";
  render({ eventIds: ["other"], roomIds: [] });
  assert.equal(emissions.filter(call => call.name === "community-subscribe").length, 20, "Only new rooms should subscribe");
  session = { status: "unauthenticated", data: null }; render({ eventIds: [], roomIds: [] });
  assert.equal(render({ eventIds: [], roomIds: [] }), "denied");
  assert.equal(intervals.size, 0); assert.equal(timers.size, 0);
  for (const set of handlers.values()) assert.equal(set.size, 0, "Listeners must be removed after logout");
  session = { status: "authenticated", data: { user: { id: "two", role: "BASIC" } } };
  holdReplies = true;
  render({ eventIds: ["race"], roomIds: [] });
  const old = replies.find(call => call.payload.eventId === "race");
  render({ eventIds: [], roomIds: [] });
  render({ eventIds: ["race"], roomIds: [] });
  const fresh = replies.filter(call => call.payload.eventId === "race").at(-1);
  old.reply({ ok: true });
  replies.find(call => call.payload.user)?.reply({ ok: true });
  assert.equal(render({ eventIds: ["race"], roomIds: [] }), "connecting", "Removed subscription ACK must not authenticate replacement");
  fresh.reply({ ok: true }); assert.equal(render({ eventIds: ["race"], roomIds: [] }), "live");
  render({ eventIds: ["revoked"], roomIds: [] });
  const revoked = replies.find(call => call.payload.eventId === "revoked");
  for (const handler of handlers.get("community-access-denied")) handler({ room: "event:revoked" });
  revoked.reply({ ok: true });
  assert.equal(render({ eventIds: ["revoked"], roomIds: [] }), "fallback", "Late ACK must not restore revoked access");
  assert.equal([...timers.values()].filter(timer => timer.delay === 4000).length, 0, "Revocation cancels pending ACK timeout");
  session = { status: "unauthenticated", data: null }; render({ eventIds: [], roomIds: [] });
  console.log("PASS activity realtime: bounded subscriptions, stable snapshots, periodic reconciliation, offline/background, logout cleanup");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
